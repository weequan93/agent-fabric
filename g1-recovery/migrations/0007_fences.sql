BEGIN;
CREATE TABLE fabric.recovery_task_controls (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,task_id uuid NOT NULL,blocked boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,space_id,task_id),FOREIGN KEY(tenant_id,space_id,task_id) REFERENCES fabric.tasks
);
CREATE TABLE fabric.recovery_resource_controls (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,resource_id uuid NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,resource_id)
);
CREATE TABLE fabric.recovery_run_resources (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,run_id uuid NOT NULL,resource_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,run_id),
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.recovery_runs,
 FOREIGN KEY(tenant_id,space_id,resource_id) REFERENCES fabric.recovery_resource_controls
);
CREATE TABLE fabric.recovery_fence_receipts (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 command_id uuid NOT NULL,payload_digest text NOT NULL,receipt jsonb NOT NULL,event_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),UNIQUE(tenant_id,space_id,event_id),
 UNIQUE(tenant_id,space_id,actor_id,command_key,event_id)
);
CREATE TABLE fabric.recovery_fence_events (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 event_id uuid NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,event_id),UNIQUE(tenant_id,space_id,actor_id,command_key,event_id),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,event_id) REFERENCES fabric.recovery_fence_receipts(tenant_id,space_id,actor_id,command_key,event_id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE fabric.recovery_fence_receipts ADD FOREIGN KEY(tenant_id,space_id,actor_id,command_key,event_id) REFERENCES fabric.recovery_fence_events(tenant_id,space_id,actor_id,command_key,event_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE fabric.recovery_resource_mutations (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,operation_id uuid NOT NULL,run_id uuid NOT NULL,
 resource_id uuid NOT NULL,binding jsonb NOT NULL,state text NOT NULL CHECK(state IN('submitted','settled','unknown')),
 PRIMARY KEY(tenant_id,space_id,operation_id),
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.recovery_runs,
 FOREIGN KEY(tenant_id,space_id,resource_id) REFERENCES fabric.recovery_resource_controls
);
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['recovery_task_controls','recovery_resource_controls','recovery_run_resources','recovery_fence_receipts','recovery_fence_events','recovery_resource_mutations'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY fence_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT,INSERT ON fabric.%I TO fabric_controller',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['recovery_run_resources','recovery_fence_receipts','recovery_fence_events'] LOOP
  EXECUTE format('CREATE TRIGGER fence_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
 END LOOP;
END $$;
GRANT UPDATE ON fabric.recovery_task_controls,fabric.recovery_resource_controls,fabric.recovery_resource_mutations TO fabric_controller;
CREATE FUNCTION fabric.recovery_mutation_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') OR OLD.state<>'submitted' THEN RAISE EXCEPTION 'immutable resource mutation';END IF;RETURN NEW;
END $$;
CREATE TRIGGER resource_mutation_binding BEFORE UPDATE ON fabric.recovery_resource_mutations FOR EACH ROW EXECUTE FUNCTION fabric.recovery_mutation_binding();
REVOKE ALL ON FUNCTION fabric.recovery_mutation_binding() FROM PUBLIC,fabric_worker,fabric_test_idp;
COMMIT;
