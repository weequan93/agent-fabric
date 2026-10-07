BEGIN;
CREATE TABLE fabric.recovery_schedules (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,schedule_id uuid NOT NULL,run_id uuid NOT NULL,
 binding jsonb NOT NULL,record jsonb NOT NULL,revision bigint NOT NULL,
 PRIMARY KEY(tenant_id,space_id,schedule_id),
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.recovery_runs
);
CREATE TABLE fabric.recovery_occurrences (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,schedule_id uuid NOT NULL,occurrence_id uuid NOT NULL,
 binding jsonb NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,occurrence_id),
 FOREIGN KEY(tenant_id,space_id,schedule_id) REFERENCES fabric.recovery_schedules
);
CREATE TABLE fabric.recovery_dispatch_receipts (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 payload_digest text NOT NULL,receipt jsonb NOT NULL,event_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),UNIQUE(tenant_id,space_id,event_id),
 UNIQUE(tenant_id,space_id,actor_id,command_key,event_id)
);
CREATE TABLE fabric.recovery_dispatch_events (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,event_id uuid NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,event_id),UNIQUE(tenant_id,space_id,actor_id,command_key,event_id),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,event_id) REFERENCES fabric.recovery_dispatch_receipts(tenant_id,space_id,actor_id,command_key,event_id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE fabric.recovery_dispatch_receipts ADD FOREIGN KEY(tenant_id,space_id,actor_id,command_key,event_id) REFERENCES fabric.recovery_dispatch_events(tenant_id,space_id,actor_id,command_key,event_id) DEFERRABLE INITIALLY DEFERRED;
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['recovery_schedules','recovery_occurrences','recovery_dispatch_receipts','recovery_dispatch_events'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY dispatch_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT,INSERT ON fabric.%I TO fabric_controller',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['recovery_dispatch_receipts','recovery_dispatch_events'] LOOP
  EXECUTE format('CREATE TRIGGER dispatch_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
 END LOOP;
END $$;
GRANT UPDATE ON fabric.recovery_schedules,fabric.recovery_occurrences TO fabric_controller;
CREATE FUNCTION fabric.recovery_dispatch_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF (to_jsonb(NEW)-'record'-'revision') IS DISTINCT FROM (to_jsonb(OLD)-'record'-'revision') THEN RAISE EXCEPTION 'immutable dispatch binding';END IF;RETURN NEW;
END $$;
CREATE TRIGGER schedule_binding BEFORE UPDATE ON fabric.recovery_schedules FOR EACH ROW EXECUTE FUNCTION fabric.recovery_dispatch_binding();
CREATE TRIGGER occurrence_binding BEFORE UPDATE ON fabric.recovery_occurrences FOR EACH ROW EXECUTE FUNCTION fabric.recovery_dispatch_binding();
REVOKE ALL ON FUNCTION fabric.recovery_dispatch_binding() FROM PUBLIC,fabric_worker,fabric_test_idp;
COMMIT;
