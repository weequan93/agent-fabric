-- Native session controls extend the existing immutable session/event owner.
CREATE TABLE fabric.model_native_controls (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,session_id uuid NOT NULL,
 revision fabric.safe_amount NOT NULL,admission jsonb NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,session_id),
 FOREIGN KEY(tenant_id,space_id,session_id) REFERENCES fabric.model_sessions
);
CREATE TABLE fabric.model_no_dispatch (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,session_id uuid NOT NULL,
 operation_id uuid NOT NULL,original jsonb NOT NULL,reason text NOT NULL CHECK(reason IN('budget','overrun')),
 PRIMARY KEY(tenant_id,space_id,operation_id),
 FOREIGN KEY(tenant_id,space_id,session_id) REFERENCES fabric.model_sessions
);
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['model_native_controls','model_no_dispatch'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY native_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT,INSERT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
CREATE TRIGGER model_no_dispatch_immutable BEFORE UPDATE OR DELETE ON fabric.model_no_dispatch FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
CREATE FUNCTION fabric.model_native_control_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'record'-'revision') IS DISTINCT FROM (to_jsonb(OLD)-'record'-'revision') OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'immutable native admission or nonmonotonic control';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER model_native_controls_guard BEFORE UPDATE OR DELETE ON fabric.model_native_controls FOR EACH ROW EXECUTE FUNCTION fabric.model_native_control_guard();
GRANT UPDATE ON fabric.model_native_controls TO fabric_controller;
REVOKE ALL ON FUNCTION fabric.model_native_control_guard() FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
