-- Add immutable, original-key-serialized proof of native pre-admission refusal.
-- Existing model1-13 definitions, grants, history and liabilities remain intact.
CREATE TABLE fabric.model_preparation_refusals (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,session_id uuid NOT NULL,
 actor_id uuid NOT NULL,original_key text NOT NULL,attempt_id uuid NOT NULL,
 reservation_id uuid NOT NULL,operation_id uuid NOT NULL,original jsonb NOT NULL,
 reason text NOT NULL CHECK(reason IN('model-unavailable','permission','connection')),
 PRIMARY KEY(tenant_id,space_id,attempt_id),
 UNIQUE(tenant_id,space_id,actor_id,original_key),
 UNIQUE(tenant_id,space_id,reservation_id),
 FOREIGN KEY(tenant_id,space_id,session_id) REFERENCES fabric.model_sessions,
 CHECK((jsonb_typeof(original)='object' AND original->>'tenantId'=tenant_id::text AND original->>'spaceId'=space_id::text AND original->>'attemptId'=attempt_id::text AND original->>'reservationId'=reservation_id::text AND original->>'operationId'=operation_id::text AND original->>'requestDigest' ~ '^sha256:[a-f0-9]{64}$') IS TRUE)
);
ALTER TABLE fabric.model_preparation_refusals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.model_preparation_refusals FORCE ROW LEVEL SECURITY;
CREATE POLICY native_scope ON fabric.model_preparation_refusals
 USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
REVOKE ALL ON fabric.model_preparation_refusals FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT SELECT,INSERT ON fabric.model_preparation_refusals TO fabric_controller;
CREATE TRIGGER model_preparation_refusals_immutable BEFORE UPDATE OR DELETE ON fabric.model_preparation_refusals
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();

-- Preserve the foundation's table grants. This narrow authenticated, scoped
-- predicate borrows the caller transaction; it does not settle or release usage.
CREATE FUNCTION fabric.model_preparation_unreserved(reservation_value uuid,attempt_value uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE authority jsonb;
BEGIN
 authority:=fabric.controller_authority();
 IF authority IS NULL OR NOT(authority->'grants' ? 'task:write') THEN
  RAISE EXCEPTION 'model preparation authority denied' USING ERRCODE='42501';
 END IF;
 RETURN NOT EXISTS(SELECT 1 FROM fabric.budget_reservations
  WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space()
   AND (reservation_id=reservation_value OR idempotency_key=attempt_value::text));
END $$;
REVOKE ALL ON FUNCTION fabric.model_preparation_unreserved(uuid,uuid) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.model_preparation_unreserved(uuid,uuid) TO fabric_controller;
