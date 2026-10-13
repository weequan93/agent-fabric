-- Simulated single Space assignment only. There is no real provision/wake port.
CREATE TABLE fabric.model_computer_assignments (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,resource_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id),UNIQUE(tenant_id,space_id,resource_id),
 FOREIGN KEY(tenant_id,space_id) REFERENCES fabric.spaces
);
CREATE TABLE fabric.model_computer_preflights (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,session_id uuid NOT NULL,resource_id uuid NOT NULL,
 record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,session_id),
 FOREIGN KEY(tenant_id,space_id,resource_id) REFERENCES fabric.model_computer_assignments(tenant_id,space_id,resource_id),
 FOREIGN KEY(tenant_id,space_id,session_id) REFERENCES fabric.model_native_controls
);
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['model_computer_assignments','model_computer_preflights'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY native_computer_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT,INSERT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
CREATE TRIGGER model_computer_assignment_immutable BEFORE UPDATE OR DELETE ON fabric.model_computer_assignments FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
CREATE FUNCTION fabric.model_computer_preflight_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'record') IS DISTINCT FROM (to_jsonb(OLD)-'record') OR (NEW.record-'phase') IS DISTINCT FROM (OLD.record-'phase') OR OLD.record->>'phase'<>'preparing' OR NEW.record->>'phase'<>'simulated-ready' THEN RAISE EXCEPTION 'immutable simulated preflight';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER model_computer_preflight_guard BEFORE UPDATE OR DELETE ON fabric.model_computer_preflights FOR EACH ROW EXECUTE FUNCTION fabric.model_computer_preflight_guard();
GRANT UPDATE ON fabric.model_computer_preflights TO fabric_controller;
REVOKE ALL ON FUNCTION fabric.model_computer_preflight_guard() FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
