BEGIN;
-- Session responses are append-only PostgreSQL records, never process memory.
CREATE TABLE fabric.recovery_session_events (
 tenant_id uuid NOT NULL, space_id uuid NOT NULL, session_id uuid NOT NULL,
 run_id uuid NOT NULL, sequence fabric.safe_amount NOT NULL CHECK(sequence>0), record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,session_id,sequence),
 FOREIGN KEY(tenant_id,space_id,session_id) REFERENCES fabric.recovery_sessions,
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.recovery_runs
);
ALTER TABLE fabric.recovery_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.recovery_session_events FORCE ROW LEVEL SECURITY;
CREATE POLICY recovery_events_scope ON fabric.recovery_session_events
 USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER recovery_events_immutable BEFORE UPDATE OR DELETE ON fabric.recovery_session_events
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.recovery_session_events FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT SELECT,INSERT ON fabric.recovery_session_events TO fabric_controller;
COMMIT;
