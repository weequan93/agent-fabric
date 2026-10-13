-- Independent synthetic downstream journal. No controller grants or fabric FK.
CREATE ROLE fabric_model_receipt_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE SCHEMA model_receipts;
REVOKE ALL ON SCHEMA model_receipts FROM PUBLIC;
GRANT USAGE ON SCHEMA model_receipts TO fabric_model_receipt_owner;
CREATE TABLE model_receipts.access(login_name name PRIMARY KEY, owner_id uuid NOT NULL);
ALTER TABLE model_receipts.access ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_receipts.access FORCE ROW LEVEL SECURITY;
CREATE POLICY own_login ON model_receipts.access TO fabric_model_receipt_owner USING(login_name=current_user);
GRANT SELECT ON model_receipts.access TO fabric_model_receipt_owner;
CREATE TABLE model_receipts.journal(
 owner_id uuid NOT NULL, tenant_id uuid NOT NULL, space_id uuid NOT NULL,
 operation_id uuid NOT NULL, attempt_id uuid NOT NULL,
 original jsonb NOT NULL, dispatch_epoch bigint NOT NULL CHECK(dispatch_epoch BETWEEN 1 AND 9007199254740991),
 status text NOT NULL CHECK(status IN ('accepted','settled','sealed-not-accepted')),
 request jsonb, receipt jsonb, proof_id uuid, output text, chunks jsonb, private_state uuid,
 schedule jsonb, cancel_requested boolean NOT NULL DEFAULT false,
 accepted_at timestamptz, measured_at timestamptz,
 PRIMARY KEY(owner_id,tenant_id,space_id,operation_id,attempt_id),
 CHECK((status='sealed-not-accepted' AND request IS NULL AND receipt IS NULL AND proof_id IS NOT NULL AND accepted_at IS NULL)
  OR (status='accepted' AND request IS NOT NULL AND receipt IS NULL AND proof_id IS NULL AND accepted_at IS NOT NULL)
  OR (status='settled' AND request IS NOT NULL AND receipt IS NOT NULL AND proof_id IS NULL AND accepted_at IS NOT NULL AND measured_at IS NOT NULL))
);
CREATE TABLE model_receipts.counters(owner_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('accept','acceptance','usage','lookup','cancel','seal','chunk')), count bigint NOT NULL CHECK(count BETWEEN 0 AND 9007199254740991), PRIMARY KEY(owner_id,kind));
CREATE UNIQUE INDEX journal_usage_identity ON model_receipts.journal(owner_id,(receipt->>'usageKey')) WHERE status='settled';
CREATE UNIQUE INDEX journal_receipt_identity ON model_receipts.journal(owner_id,(receipt->>'receiptId')) WHERE status='settled';
CREATE TABLE model_receipts.private_states(owner_id uuid NOT NULL, token uuid NOT NULL, tenant_id uuid NOT NULL, space_id uuid NOT NULL, profile_digest text NOT NULL, context_digest text NOT NULL, opaque jsonb NOT NULL, PRIMARY KEY(owner_id,token));
ALTER TABLE model_receipts.journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_receipts.journal FORCE ROW LEVEL SECURITY;
ALTER TABLE model_receipts.counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_receipts.counters FORCE ROW LEVEL SECURITY;
ALTER TABLE model_receipts.private_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_receipts.private_states FORCE ROW LEVEL SECURITY;
CREATE POLICY own_journal ON model_receipts.journal TO fabric_model_receipt_owner USING(owner_id=(SELECT owner_id FROM model_receipts.access WHERE login_name=current_user)) WITH CHECK(owner_id=(SELECT owner_id FROM model_receipts.access WHERE login_name=current_user));
CREATE POLICY own_counters ON model_receipts.counters TO fabric_model_receipt_owner USING(owner_id=(SELECT owner_id FROM model_receipts.access WHERE login_name=current_user)) WITH CHECK(owner_id=(SELECT owner_id FROM model_receipts.access WHERE login_name=current_user));
CREATE POLICY own_private_states ON model_receipts.private_states TO fabric_model_receipt_owner USING(owner_id=(SELECT owner_id FROM model_receipts.access WHERE login_name=current_user)) WITH CHECK(owner_id=(SELECT owner_id FROM model_receipts.access WHERE login_name=current_user));
GRANT SELECT,INSERT,UPDATE ON model_receipts.journal,model_receipts.counters TO fabric_model_receipt_owner;
GRANT SELECT,INSERT ON model_receipts.private_states TO fabric_model_receipt_owner;
-- Original identity, captures, usage and seals cannot be rebound or erased.
CREATE FUNCTION model_receipts.guard_journal() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable receipt history'; END IF;
 IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.space_id IS DISTINCT FROM OLD.space_id OR NEW.operation_id IS DISTINCT FROM OLD.operation_id OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id OR NEW.original IS DISTINCT FROM OLD.original OR NEW.request IS DISTINCT FROM OLD.request OR NEW.schedule IS DISTINCT FROM OLD.schedule OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR NEW.proof_id IS DISTINCT FROM OLD.proof_id THEN RAISE EXCEPTION 'immutable original receipt'; END IF;
 IF OLD.cancel_requested AND NOT NEW.cancel_requested THEN RAISE EXCEPTION 'monotonic cancellation'; END IF;
 IF OLD.status='settled' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.receipt IS DISTINCT FROM OLD.receipt OR NEW.output IS DISTINCT FROM OLD.output OR NEW.chunks IS DISTINCT FROM OLD.chunks OR NEW.private_state IS DISTINCT FROM OLD.private_state OR NEW.measured_at IS DISTINCT FROM OLD.measured_at OR NEW.dispatch_epoch IS DISTINCT FROM OLD.dispatch_epoch) THEN RAISE EXCEPTION 'immutable usage'; END IF;
 IF OLD.status='sealed-not-accepted' AND (NEW.status<>OLD.status OR NEW.dispatch_epoch<OLD.dispatch_epoch) THEN RAISE EXCEPTION 'permanent seal'; END IF;
 IF OLD.status='accepted' AND (NEW.status NOT IN ('accepted','settled') OR NEW.dispatch_epoch<>OLD.dispatch_epoch) THEN RAISE EXCEPTION 'immutable acceptance'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION model_receipts.guard_journal() FROM PUBLIC;
CREATE TRIGGER journal_history BEFORE UPDATE OR DELETE ON model_receipts.journal FOR EACH ROW EXECUTE FUNCTION model_receipts.guard_journal();
