BEGIN;
CREATE TABLE fabric.recovery_result_tasks (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,task_id uuid NOT NULL,binding jsonb NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,task_id),FOREIGN KEY(tenant_id,space_id,task_id) REFERENCES fabric.tasks
);
CREATE TABLE fabric.recovery_artifact_versions (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,artifact_id uuid NOT NULL,version bigint NOT NULL,run_id uuid NOT NULL,binding jsonb NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,artifact_id,version),FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.recovery_runs
);
CREATE TABLE fabric.recovery_check_receipts (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,check_id uuid NOT NULL,artifact_id uuid NOT NULL,version bigint NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,check_id),UNIQUE(tenant_id,space_id,artifact_id,version,check_id),
 FOREIGN KEY(tenant_id,space_id,artifact_id,version) REFERENCES fabric.recovery_artifact_versions
);
CREATE TABLE fabric.recovery_deliveries (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,delivery_id uuid NOT NULL,run_id uuid NOT NULL,binding jsonb NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,delivery_id),FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.recovery_runs
);
CREATE TABLE fabric.recovery_attempt_outcomes (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,run_id uuid NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,run_id),FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.recovery_runs
);
CREATE TABLE fabric.recovery_notifications (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,notification_id uuid NOT NULL,run_id uuid NOT NULL,binding jsonb NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,notification_id),FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.recovery_attempt_outcomes
);
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['recovery_result_tasks','recovery_artifact_versions','recovery_check_receipts','recovery_deliveries','recovery_attempt_outcomes','recovery_notifications'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY result_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT,INSERT ON fabric.%I TO fabric_controller',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['recovery_check_receipts','recovery_attempt_outcomes'] LOOP
  EXECUTE format('CREATE TRIGGER result_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['recovery_result_tasks','recovery_artifact_versions','recovery_deliveries','recovery_notifications'] LOOP
  EXECUTE format('CREATE TRIGGER result_binding BEFORE UPDATE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.recovery_dispatch_binding()',n);
  EXECUTE format('CREATE TRIGGER result_no_delete BEFORE DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('GRANT UPDATE(record) ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
-- Fixed scoped authority observation; no broad SELECT grants on identity tables.
CREATE FUNCTION fabric.recovery_notification_authority(task_value uuid,recipient uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE owner uuid; member fabric.memberships%ROWTYPE;
BEGIN
 IF current_setting('app.identity_verified',true) IS DISTINCT FROM 'true' OR fabric.current_identity() IS NULL THEN RETURN NULL;END IF;
 SELECT owner_actor_id INTO owner FROM fabric.spaces WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND lifecycle='active' FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 PERFORM 1 FROM fabric.tasks WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND task_id=task_value FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO member FROM fabric.memberships WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND actor_id=recipient FOR SHARE;
 IF NOT FOUND OR member.revoked_at IS NOT NULL OR NOT(member.grants ? 'task:read') THEN RETURN NULL;END IF;
 PERFORM 1 FROM fabric.actors WHERE tenant_id=fabric.current_tenant() AND actor_id=recipient AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('ownerActorId',owner,'recipientActorId',recipient);
END $$;
REVOKE ALL ON FUNCTION fabric.recovery_notification_authority(uuid,uuid) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.recovery_notification_authority(uuid,uuid) TO fabric_controller;
COMMIT;
