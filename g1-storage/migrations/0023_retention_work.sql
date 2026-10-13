-- Additive exact-target retention events. Legacy forget controls are preserved,
-- never backfilled or promoted to completed erasure. No destructive down migration.
ALTER TABLE fabric.storage_forget_work ADD UNIQUE(tenant_id,space_id,actor_id,command_key,binding_digest,receipt_id,job_id,class,id,revision,epoch,at);
CREATE TABLE fabric.storage_retention_events (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 binding_digest text NOT NULL,receipt_id uuid NOT NULL,job_id uuid NOT NULL,
 class text NOT NULL,id uuid NOT NULL,revision fabric.safe_amount NOT NULL,epoch fabric.safe_amount NOT NULL,at timestamptz NOT NULL,
 reason text NOT NULL CHECK(reason IN('forget','expiry')),
 accepted_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),
 CHECK(isfinite(at) AND isfinite(accepted_at) AND isfinite(expires_at) AND expires_at>accepted_at),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,binding_digest,receipt_id,job_id,class,id,revision,epoch,at)
 REFERENCES fabric.storage_forget_work(tenant_id,space_id,actor_id,command_key,binding_digest,receipt_id,job_id,class,id,revision,epoch,at),
 FOREIGN KEY(tenant_id,space_id,class,id,revision) REFERENCES fabric.storage_current_heads
);
ALTER TABLE fabric.storage_retention_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_retention_events FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_retention_events
 USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_retention_events
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_retention_events FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_retention_events TO fabric_controller;
CREATE INDEX storage_retention_expiry_scan ON fabric.storage_current_heads(tenant_id,space_id,class,expires_at,id,revision);
CREATE FUNCTION fabric.storage_record_retention_work(k uuid,reason_arg text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 w fabric.storage_forget_work%ROWTYPE;h fabric.storage_current_heads%ROWTYPE;work_xid xid;period numeric;
BEGIN
 IF NOT fabric.service_scope(t,sp) OR reason_arg NOT IN('forget','expiry') THEN RAISE EXCEPTION 'retention scope denied' USING ERRCODE='42501';END IF;
 SELECT * INTO w
 FROM fabric.storage_forget_work WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 SELECT xmin INTO work_xid FROM fabric.storage_forget_work WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 IF work_xid IS DISTINCT FROM (txid_current()%4294967296)::text::xid THEN RAISE EXCEPTION 'retention publication transaction denied' USING ERRCODE='23514';END IF;
 SELECT * INTO h FROM fabric.storage_current_heads WHERE tenant_id=t AND space_id=sp AND class=w.class AND id=w.id AND revision=w.revision;
 SELECT (p.periods->>h.class)::numeric INTO period FROM fabric.storage_policy p JOIN fabric.storage_authority_epoch e
 ON (e.tenant_id,e.space_id,e.policy_revision)=(p.tenant_id,p.space_id,p.revision)
 WHERE e.tenant_id=t AND e.space_id=sp AND e.epoch=h.epoch;
 IF period IS NULL OR period<1 OR period>86400 OR period<>trunc(period) OR NOT isfinite(h.accepted_at) OR NOT isfinite(h.expires_at)
 OR h.expires_at<=h.accepted_at OR h.expires_at>h.accepted_at+period*interval '1s' THEN RAISE EXCEPTION 'retention class window denied' USING ERRCODE='23514';END IF;
 IF reason_arg='expiry' AND h.expires_at>clock_timestamp() THEN RAISE EXCEPTION 'unexpired retention denied' USING ERRCODE='23514';END IF;
 INSERT INTO fabric.storage_retention_events VALUES(t,sp,a,k,w.binding_digest,w.receipt_id,w.job_id,w.class,w.id,w.revision,w.epoch,w.at,reason_arg,h.accepted_at,h.expires_at);
END $$;
REVOKE ALL ON FUNCTION fabric.storage_record_retention_work(uuid,text) FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_record_retention_work(uuid,text) TO fabric_controller;

-- Same monotonic restriction/command/outbox/epoch protocol as the accepted
-- forget owner, with database-clock expired eligibility and maintenance power.
CREATE FUNCTION fabric.storage_publish_expiry_work(k uuid,b text,sid uuid,previous numeric,old_anchor uuid,
 new_anchor uuid,old_digest text,new_digest text,cl text,target uuid,rev numeric,w text,recorded timestamptz,expires timestamptz,receipt uuid,job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 e fabric.storage_authority_epoch%ROWTYPE;h fabric.storage_current_heads%ROWTYPE;authority jsonb;admission jsonb;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'storage tombstone scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["storage-epoch-original","%s","%s","%s","%s"]',t,sp,a,k),0));
 authority:=fabric.controller_authority();
 IF authority IS NULL OR jsonb_typeof(authority->'grants') IS DISTINCT FROM 'array'
  OR NOT(authority->'grants' ?& ARRAY['storage:maintenance','task:write','storage:read'])
  OR authority->>'lifecycle'<>'active' OR (authority->>'actorRevoked')::boolean
  OR (authority->>'payerRevoked')::boolean OR (authority->>'membershipRevoked')::boolean
  OR expires IS NULL OR expires<=clock_timestamp() OR expires>='infinity'::timestamptz
  OR recorded IS NULL OR NOT isfinite(recorded) OR recorded>clock_timestamp() THEN
  RAISE EXCEPTION 'storage tombstone authority denied' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM fabric.storage_authority_epoch WHERE tenant_id=t AND space_id=sp ORDER BY epoch DESC LIMIT 1;
 IF NOT FOUND OR e.epoch IS DISTINCT FROM previous OR e.anchor_id IS DISTINCT FROM old_anchor OR e.control_digest IS DISTINCT FROM old_digest THEN
  RAISE EXCEPTION 'storage tombstone epoch stale' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM fabric.storage_policy p WHERE p.tenant_id=t AND p.space_id=sp AND p.revision=e.policy_revision AND operations ?& ARRAY['maintenance','read']) THEN
  RAISE EXCEPTION 'storage tombstone policy denied' USING ERRCODE='42501';END IF;
 SELECT * INTO h FROM fabric.storage_current_heads WHERE tenant_id=t AND space_id=sp AND class=cl AND id=target ORDER BY storage_current_heads.revision DESC LIMIT 1;
 IF NOT FOUND OR h.revision IS DISTINCT FROM rev OR h.witness IS DISTINCT FROM w OR h.expires_at>clock_timestamp()
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
 IF receipt IS NULL OR job IS NULL THEN RAISE EXCEPTION 'storage work identity denied' USING ERRCODE='23514';END IF;
 INSERT INTO fabric.storage_commands VALUES(t,sp,a,k,b,receipt,previous+1,recorded);
 INSERT INTO fabric.storage_outbox VALUES(t,sp,job,a,k,cl,target,rev,previous+1,recorded);
 INSERT INTO fabric.storage_authority_epoch VALUES(t,sp,previous+1,new_anchor,e.policy_revision,new_digest,clock_timestamp());
 INSERT INTO fabric.storage_epoch_publications VALUES(t,sp,a,k,b,sid,previous,previous+1,new_anchor,expires,clock_timestamp());
 INSERT INTO fabric.storage_tombstone_publications VALUES(t,sp,a,k,cl,target,rev,w,recorded);
 INSERT INTO fabric.storage_forget_work VALUES(t,sp,a,k,b,receipt,job,cl,target,rev,previous+1,recorded);
 PERFORM fabric.storage_record_retention_work(k,'expiry');
END $$;
REVOKE ALL ON FUNCTION fabric.storage_publish_expiry_work(uuid,text,uuid,numeric,uuid,uuid,text,text,text,uuid,numeric,text,timestamptz,timestamptz,uuid,uuid)
 FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_publish_expiry_work(uuid,text,uuid,numeric,uuid,uuid,text,text,text,uuid,numeric,text,timestamptz,timestamptz,uuid,uuid) TO fabric_controller;
