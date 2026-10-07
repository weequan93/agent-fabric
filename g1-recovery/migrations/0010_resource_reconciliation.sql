BEGIN;
CREATE TABLE fabric.recovery_resource_reconciliations (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,operation_id uuid NOT NULL,actor_id uuid NOT NULL,
 record jsonb NOT NULL CHECK((jsonb_typeof(record)='object'
  AND record ?& ARRAY['operationId','bindingDigest','outcome','evidenceDigest']
  AND record->>'operationId'=operation_id::text
  AND record->>'outcome' IN ('applied','not-applied')
  AND record->>'bindingDigest' ~ '^sha256:[a-f0-9]{64}$'
  AND record->>'evidenceDigest' ~ '^sha256:[a-f0-9]{64}$') IS TRUE),
 PRIMARY KEY(tenant_id,space_id,operation_id),
 FOREIGN KEY(tenant_id,space_id,operation_id) REFERENCES fabric.recovery_resource_mutations
);
ALTER TABLE fabric.recovery_resource_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.recovery_resource_reconciliations FORCE ROW LEVEL SECURITY;
CREATE POLICY resource_reconciliation_scope ON fabric.recovery_resource_reconciliations USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
REVOKE ALL ON fabric.recovery_resource_reconciliations FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT SELECT,INSERT ON fabric.recovery_resource_reconciliations TO fabric_controller;
CREATE TRIGGER resource_reconciliation_immutable BEFORE UPDATE OR DELETE ON fabric.recovery_resource_reconciliations FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
COMMIT;
