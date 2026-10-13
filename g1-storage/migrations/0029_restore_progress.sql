-- Cancellation is forward-only control, separate from immutable activation and
-- current restrictions. Content cleanup never grants permission to serve.
CREATE TABLE fabric.storage_restore_rollbacks (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,original_key uuid NOT NULL,
 operation_id uuid NOT NULL,backup_id uuid NOT NULL,generation uuid NOT NULL,key_id uuid NOT NULL,root_id uuid NOT NULL,
 command_fingerprint text NOT NULL,status jsonb NOT NULL,rolled_back_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,space_id,actor_id,original_key),UNIQUE(tenant_id,space_id,operation_id),
 CHECK(command_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
 CHECK(status->>'state'='rolled-back' AND status->>'serving'='false' AND status->>'admissionEnabled'='false' AND status->>'jobsEnabled'='false'
  AND status->>'operationId'=operation_id::text AND status->>'generation'=generation::text)
);
ALTER TABLE fabric.storage_restore_rollbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_restore_rollbacks FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_restore_rollbacks
 USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_restore_rollbacks
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_restore_rollbacks FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_restore_rollbacks TO fabric_controller;
CREATE FUNCTION fabric.storage_rollback_restore(k uuid,op uuid,backup uuid,generation uuid,key_id uuid,root uuid,fingerprint text,status jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();auth jsonb;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'restore scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 auth:=fabric.controller_authority();
 IF auth IS NULL OR NOT(auth->'grants' ?& ARRAY['storage:restore','storage:read','storage:maintenance']) THEN
  RAISE EXCEPTION 'restore rollback authority denied' USING ERRCODE='42501';END IF;
 INSERT INTO fabric.storage_restore_rollbacks(tenant_id,space_id,actor_id,original_key,operation_id,backup_id,generation,key_id,root_id,command_fingerprint,status)
 VALUES(t,sp,a,k,op,backup,generation,key_id,root,fingerprint,status);
END $$;
REVOKE ALL ON FUNCTION fabric.storage_rollback_restore(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_rollback_restore(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb) TO fabric_controller;
CREATE FUNCTION fabric.storage_restore_cancelled_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM fabric.storage_restore_rollbacks r WHERE (r.tenant_id,r.space_id,r.operation_id)=(NEW.tenant_id,NEW.space_id,NEW.operation_id)) THEN
  RAISE EXCEPTION 'restore generation cancelled' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fabric.storage_restore_cancelled_guard() FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
CREATE TRIGGER storage_restore_cancelled BEFORE INSERT ON fabric.storage_restore_activations FOR EACH ROW EXECUTE FUNCTION fabric.storage_restore_cancelled_guard();
