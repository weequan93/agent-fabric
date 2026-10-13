-- Monotonic source-control revocation; no content deletion or propagation claim.
CREATE TABLE fabric.storage_source_revocations (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 class text NOT NULL DEFAULT 'source' CHECK(class='source'),source_id uuid NOT NULL,
 source_revision fabric.safe_amount NOT NULL,witness text NOT NULL CHECK(witness ~ '^sha256:[0-9a-f]{64}$'),
 kind text NOT NULL DEFAULT 'revoked' CHECK(kind='revoked'),at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),UNIQUE(tenant_id,space_id,source_id,source_revision),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_epoch_publications,
 FOREIGN KEY(tenant_id,space_id,class,source_id,source_revision) REFERENCES fabric.storage_current_heads,
 FOREIGN KEY(tenant_id,space_id,source_id,source_revision,kind) REFERENCES fabric.storage_restrictions
);
ALTER TABLE fabric.storage_source_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_source_revocations FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_source_revocations
 USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_source_revocations
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_source_revocations FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_source_revocations TO fabric_controller;
CREATE FUNCTION fabric.storage_revoke_source(k uuid,b text,sid uuid,previous numeric,old_anchor uuid,
 new_anchor uuid,old_digest text,new_digest text,source uuid,sr numeric,w text,recorded timestamptz,expires timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 e fabric.storage_authority_epoch%ROWTYPE;h fabric.storage_current_heads%ROWTYPE;authority jsonb;admission jsonb;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'storage source scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["storage-epoch-original","%s","%s","%s","%s"]',t,sp,a,k),0));
 authority:=fabric.controller_authority();
 IF authority IS NULL OR jsonb_typeof(authority->'grants') IS DISTINCT FROM 'array'
  OR NOT(authority->'grants' ?& ARRAY['storage:maintenance','task:write','storage:forget'])
  OR authority->>'lifecycle'<>'active' OR (authority->>'actorRevoked')::boolean
  OR (authority->>'payerRevoked')::boolean OR (authority->>'membershipRevoked')::boolean
  OR expires IS NULL OR expires<=clock_timestamp() OR expires>='infinity'::timestamptz
  OR recorded IS NULL OR NOT isfinite(recorded) OR recorded>clock_timestamp() THEN
  RAISE EXCEPTION 'storage source authority denied' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM fabric.storage_authority_epoch WHERE tenant_id=t AND space_id=sp ORDER BY epoch DESC LIMIT 1;
 IF NOT FOUND OR e.epoch IS DISTINCT FROM previous OR e.anchor_id IS DISTINCT FROM old_anchor OR e.control_digest IS DISTINCT FROM old_digest THEN
  RAISE EXCEPTION 'storage source epoch stale' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM fabric.storage_policy p WHERE p.tenant_id=t AND p.space_id=sp AND p.revision=e.policy_revision AND operations ?& ARRAY['maintenance','forget','read']) THEN
  RAISE EXCEPTION 'storage source policy denied' USING ERRCODE='42501';END IF;
 SELECT * INTO h FROM fabric.storage_current_heads WHERE tenant_id=t AND space_id=sp AND class='source' AND id=source ORDER BY storage_current_heads.revision DESC LIMIT 1;
 IF NOT FOUND OR h.revision IS DISTINCT FROM sr OR h.witness IS DISTINCT FROM w OR h.expires_at<=clock_timestamp()
  OR EXISTS(SELECT 1 FROM fabric.storage_restrictions r WHERE r.tenant_id=t AND r.space_id=sp AND r.source_id=source AND r.source_revision=sr)
  OR EXISTS(SELECT 1 FROM fabric.storage_tombstones d WHERE d.tenant_id=t AND d.space_id=sp AND d.class='source' AND d.id=source AND d.revision>=sr) THEN
  RAISE EXCEPTION 'storage source head denied' USING ERRCODE='23514';END IF;
 SELECT c.admission INTO admission FROM fabric.model_native_controls c JOIN fabric.model_sessions s USING(tenant_id,space_id,session_id)
 WHERE c.tenant_id=t AND c.space_id=sp AND c.session_id=sid AND s.binding->>'actorId'=a::text
  AND s.binding->>'intent'='Ask' AND s.binding->>'purpose'='maintenance';
 IF admission IS NULL OR admission->>'executionClass'<>'service' OR admission->>'resourceId' IS NOT NULL
  OR admission->>'computerCapability' IS NOT NULL OR (admission->>'targetEffect')::boolean OR (admission->>'approvalRequired')::boolean THEN
  RAISE EXCEPTION 'storage source native denied' USING ERRCODE='42501';END IF;
 INSERT INTO fabric.storage_restrictions VALUES(t,sp,'source',source,sr,previous+1,'revoked',recorded);
 INSERT INTO fabric.storage_authority_epoch VALUES(t,sp,previous+1,new_anchor,e.policy_revision,new_digest,clock_timestamp());
 INSERT INTO fabric.storage_epoch_publications VALUES(t,sp,a,k,b,sid,previous,previous+1,new_anchor,expires,clock_timestamp());
 INSERT INTO fabric.storage_source_revocations VALUES(t,sp,a,k,'source',source,sr,w,'revoked',recorded);
END $$;
REVOKE ALL ON FUNCTION fabric.storage_revoke_source(uuid,text,uuid,numeric,uuid,uuid,text,text,uuid,numeric,text,timestamptz,timestamptz)
 FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_revoke_source(uuid,text,uuid,numeric,uuid,uuid,text,text,uuid,numeric,text,timestamptz,timestamptz) TO fabric_controller;
