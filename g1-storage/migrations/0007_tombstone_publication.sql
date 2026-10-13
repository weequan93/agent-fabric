-- Current deletion control only. No physical erasure or derived completion claim.
CREATE TABLE fabric.storage_tombstone_publications (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 class text NOT NULL,id uuid NOT NULL,revision fabric.safe_amount NOT NULL,
 witness text NOT NULL CHECK(witness ~ '^sha256:[0-9a-f]{64}$'),at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),UNIQUE(tenant_id,space_id,class,id,revision),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_epoch_publications,
 FOREIGN KEY(tenant_id,space_id,class,id,revision) REFERENCES fabric.storage_current_heads,
 FOREIGN KEY(tenant_id,space_id,class,id,revision) REFERENCES fabric.storage_tombstones
);
ALTER TABLE fabric.storage_tombstone_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_tombstone_publications FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_tombstone_publications
 USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_tombstone_publications
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_tombstone_publications FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_tombstone_publications TO fabric_controller;
CREATE FUNCTION fabric.storage_publish_tombstone(k uuid,b text,sid uuid,previous numeric,old_anchor uuid,
 new_anchor uuid,old_digest text,new_digest text,cl text,target uuid,rev numeric,w text,recorded timestamptz,expires timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 e fabric.storage_authority_epoch%ROWTYPE;h fabric.storage_current_heads%ROWTYPE;authority jsonb;admission jsonb;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'storage tombstone scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["storage-epoch-original","%s","%s","%s","%s"]',t,sp,a,k),0));
 authority:=fabric.controller_authority();
 IF authority IS NULL OR jsonb_typeof(authority->'grants') IS DISTINCT FROM 'array'
  OR NOT(authority->'grants' ?& ARRAY['storage:maintenance','task:write','storage:forget'])
  OR authority->>'lifecycle'<>'active' OR (authority->>'actorRevoked')::boolean
  OR (authority->>'payerRevoked')::boolean OR (authority->>'membershipRevoked')::boolean
  OR expires IS NULL OR expires<=clock_timestamp() OR expires>='infinity'::timestamptz
  OR recorded IS NULL OR NOT isfinite(recorded) OR recorded>clock_timestamp() THEN
  RAISE EXCEPTION 'storage tombstone authority denied' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM fabric.storage_authority_epoch WHERE tenant_id=t AND space_id=sp ORDER BY epoch DESC LIMIT 1;
 IF NOT FOUND OR e.epoch IS DISTINCT FROM previous OR e.anchor_id IS DISTINCT FROM old_anchor OR e.control_digest IS DISTINCT FROM old_digest THEN
  RAISE EXCEPTION 'storage tombstone epoch stale' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM fabric.storage_policy p WHERE p.tenant_id=t AND p.space_id=sp AND p.revision=e.policy_revision AND operations ?& ARRAY['maintenance','forget','read']) THEN
  RAISE EXCEPTION 'storage tombstone policy denied' USING ERRCODE='42501';END IF;
 SELECT * INTO h FROM fabric.storage_current_heads WHERE tenant_id=t AND space_id=sp AND class=cl AND id=target ORDER BY storage_current_heads.revision DESC LIMIT 1;
 IF NOT FOUND OR h.revision IS DISTINCT FROM rev OR h.witness IS DISTINCT FROM w OR h.expires_at<=clock_timestamp()
  OR EXISTS(SELECT 1 FROM fabric.storage_restrictions r WHERE cl='source' AND r.tenant_id=t AND r.space_id=sp AND r.source_id=target AND r.source_revision=rev)
  OR EXISTS(SELECT 1 FROM fabric.storage_tombstones d WHERE d.tenant_id=t AND d.space_id=sp AND d.class=cl AND d.id=target AND d.revision>=rev) THEN
  RAISE EXCEPTION 'storage tombstone head denied' USING ERRCODE='23514';END IF;
 -- Every supported target must have an installed same-Space Task lineage.
 IF NOT EXISTS(SELECT 1 FROM fabric.storage_entities x WHERE (x.tenant_id,x.space_id,x.class,x.id,x.revision)=(t,sp,cl,target,rev) AND x.source_task_id IS NOT NULL) THEN
  RAISE EXCEPTION 'storage tombstone lineage denied' USING ERRCODE='42501';END IF;
 SELECT c.admission INTO admission FROM fabric.model_native_controls c JOIN fabric.model_sessions s USING(tenant_id,space_id,session_id)
 WHERE c.tenant_id=t AND c.space_id=sp AND c.session_id=sid AND s.binding->>'actorId'=a::text
  AND s.binding->>'intent'='Ask' AND s.binding->>'purpose'='maintenance';
 IF admission IS NULL OR admission->>'executionClass'<>'service' OR admission->>'resourceId' IS NOT NULL
  OR admission->>'computerCapability' IS NOT NULL OR (admission->>'targetEffect')::boolean OR (admission->>'approvalRequired')::boolean THEN
  RAISE EXCEPTION 'storage tombstone native denied' USING ERRCODE='42501';END IF;
 INSERT INTO fabric.storage_tombstones VALUES(t,sp,cl,target,rev,previous+1,k,recorded);
 INSERT INTO fabric.storage_authority_epoch VALUES(t,sp,previous+1,new_anchor,e.policy_revision,new_digest,clock_timestamp());
 INSERT INTO fabric.storage_epoch_publications VALUES(t,sp,a,k,b,sid,previous,previous+1,new_anchor,expires,clock_timestamp());
 INSERT INTO fabric.storage_tombstone_publications VALUES(t,sp,a,k,cl,target,rev,w,recorded);
END $$;
REVOKE ALL ON FUNCTION fabric.storage_publish_tombstone(uuid,text,uuid,numeric,uuid,uuid,text,text,text,uuid,numeric,text,timestamptz,timestamptz)
 FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_publish_tombstone(uuid,text,uuid,numeric,uuid,uuid,text,text,text,uuid,numeric,text,timestamptz,timestamptz) TO fabric_controller;
