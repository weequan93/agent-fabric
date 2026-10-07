BEGIN;
CREATE TABLE fabric.recovery_effect_events (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,operation_id uuid NOT NULL,
 phase text NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,operation_id,phase),
 FOREIGN KEY(tenant_id,space_id,operation_id) REFERENCES fabric.recovery_operations
);
ALTER TABLE fabric.recovery_effect_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.recovery_effect_events FORCE ROW LEVEL SECURITY;
CREATE POLICY effect_events_scope ON fabric.recovery_effect_events USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER effect_events_immutable BEFORE UPDATE OR DELETE ON fabric.recovery_effect_events FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.recovery_effect_events FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT SELECT,INSERT ON fabric.recovery_effect_events TO fabric_controller;
CREATE FUNCTION fabric.recovery_effect_record_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF NEW.record->'binding' IS DISTINCT FROM NEW.binding OR NEW.record->'binding' IS DISTINCT FROM OLD.record->'binding' THEN RAISE EXCEPTION 'immutable effect record binding';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER effect_record_binding BEFORE UPDATE ON fabric.recovery_operations FOR EACH ROW EXECUTE FUNCTION fabric.recovery_effect_record_binding();
REVOKE ALL ON FUNCTION fabric.recovery_effect_record_binding() FROM PUBLIC,fabric_worker,fabric_test_idp;
COMMIT;
