-- A control-only epoch refresh. This is never content or backup authority.
-- No table mutation privilege is granted to a serving role.
ALTER TABLE fabric.storage_authority_epoch ADD UNIQUE(tenant_id,space_id,epoch,anchor_id);
CREATE TABLE fabric.storage_epoch_publications (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 binding_digest text NOT NULL CHECK(binding_digest ~ '^sha256:[0-9a-f]{64}$'),session_id uuid NOT NULL,
 previous_epoch fabric.safe_amount NOT NULL CHECK(previous_epoch>0),epoch fabric.safe_amount NOT NULL,
 anchor_id uuid NOT NULL,expires_at timestamptz NOT NULL,at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),UNIQUE(tenant_id,space_id,epoch),
 CHECK(epoch=previous_epoch+1 AND expires_at<'infinity'::timestamptz),
 FOREIGN KEY(tenant_id,space_id,previous_epoch) REFERENCES fabric.storage_authority_epoch,
 FOREIGN KEY(tenant_id,space_id,epoch,anchor_id) REFERENCES fabric.storage_authority_epoch(tenant_id,space_id,epoch,anchor_id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES fabric.actors,
 FOREIGN KEY(tenant_id,space_id,session_id) REFERENCES fabric.model_sessions
);
ALTER TABLE fabric.storage_epoch_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_epoch_publications FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_epoch_publications
 USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_epoch_publications
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_epoch_publications FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_epoch_publications TO fabric_controller;
CREATE FUNCTION fabric.storage_publish_epoch(k uuid,b text,sid uuid,previous numeric,old_anchor uuid,
 new_anchor uuid,d text,expires timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 e fabric.storage_authority_epoch%ROWTYPE;authority jsonb;admission jsonb;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'storage publication scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["storage-epoch-original","%s","%s","%s","%s"]',t,sp,a,k),0));
 authority:=fabric.controller_authority();
 IF authority IS NULL OR jsonb_typeof(authority->'grants')<>'array' OR NOT(authority->'grants' ? 'storage:maintenance')
  OR NOT(authority->'grants' ? 'task:write') OR authority->>'lifecycle'<>'active'
  OR (authority->>'actorRevoked')::boolean OR (authority->>'payerRevoked')::boolean OR (authority->>'membershipRevoked')::boolean
  OR expires<=clock_timestamp() OR expires>='infinity'::timestamptz THEN
  RAISE EXCEPTION 'storage publication authority denied' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM fabric.storage_authority_epoch WHERE tenant_id=t AND space_id=sp ORDER BY epoch DESC LIMIT 1;
 IF NOT FOUND OR e.epoch<>previous OR e.anchor_id<>old_anchor OR e.control_digest<>d THEN
  RAISE EXCEPTION 'storage publication stale' USING ERRCODE='23514';END IF;
 -- Refresh cannot change policy, content, heads, restrictions, commands or jobs.
 IF NOT EXISTS(SELECT 1 FROM fabric.storage_policy WHERE tenant_id=t AND space_id=sp AND revision=e.policy_revision
  AND operations ? 'maintenance') THEN RAISE EXCEPTION 'storage publication policy denied' USING ERRCODE='42501';END IF;
 SELECT c.admission INTO admission FROM fabric.model_native_controls c JOIN fabric.model_sessions s USING(tenant_id,space_id,session_id)
 WHERE c.tenant_id=t AND c.space_id=sp AND c.session_id=sid AND s.binding->>'actorId'=a::text
  AND s.binding->>'intent'='Ask' AND s.binding->>'purpose'='maintenance';
 IF admission IS NULL OR admission->>'executionClass'<>'service' OR admission->>'resourceId' IS NOT NULL
  OR admission->>'computerCapability' IS NOT NULL OR (admission->>'targetEffect')::boolean
  OR (admission->>'approvalRequired')::boolean THEN
  RAISE EXCEPTION 'storage publication native denied' USING ERRCODE='42501';END IF;
 INSERT INTO fabric.storage_authority_epoch VALUES(t,sp,previous+1,new_anchor,e.policy_revision,d,clock_timestamp());
 INSERT INTO fabric.storage_epoch_publications VALUES(t,sp,a,k,b,sid,previous,previous+1,new_anchor,expires,clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION fabric.storage_publish_epoch(uuid,text,uuid,numeric,uuid,uuid,text,timestamptz)
 FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_publish_epoch(uuid,text,uuid,numeric,uuid,uuid,text,timestamptz) TO fabric_controller;
