-- G0 reviewable PostgreSQL contract; this migration has NOT been deployed.
-- Only trusted controllers own/write authoritative records. Workers have no DB grants.
-- G1 must qualify real non-owner, non-superuser, non-BYPASSRLS roles, RLS,
-- encrypted object storage and volume restore. A mock cannot issue those qualifications.
BEGIN;
CREATE SCHEMA fabric;
REVOKE ALL ON SCHEMA fabric FROM PUBLIC;
SET LOCAL search_path = fabric, pg_catalog;
CREATE DOMAIN safe_amount AS bigint CHECK (VALUE >= 0 AND VALUE <= 9007199254740991);
CREATE TABLE tenants (
  tenant_id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE actors (
  tenant_id uuid NOT NULL REFERENCES tenants, actor_id uuid NOT NULL,
  identity_subject text NOT NULL, revoked_at timestamptz,
  PRIMARY KEY (tenant_id, actor_id), UNIQUE (tenant_id, identity_subject)
);
CREATE TABLE spaces (
  tenant_id uuid NOT NULL REFERENCES tenants, space_id uuid NOT NULL,
  owner_actor_id uuid NOT NULL, payer_actor_id uuid NOT NULL,
  data_namespace_id uuid NOT NULL, compute_namespace_id uuid NOT NULL,
  authority_revision safe_amount NOT NULL, lifecycle text NOT NULL
    CHECK (lifecycle IN ('active','suspended','archived','deleted')),
  PRIMARY KEY (tenant_id, space_id),
  UNIQUE (data_namespace_id), UNIQUE (compute_namespace_id),
  FOREIGN KEY (tenant_id, owner_actor_id) REFERENCES actors,
  FOREIGN KEY (tenant_id, payer_actor_id) REFERENCES actors
);
CREATE TABLE memberships (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, actor_id uuid NOT NULL,
  revision safe_amount NOT NULL, grants jsonb NOT NULL, revoked_at timestamptz,
  PRIMARY KEY (tenant_id, space_id, actor_id),
  FOREIGN KEY (tenant_id, space_id) REFERENCES spaces,
  FOREIGN KEY (tenant_id, actor_id) REFERENCES actors
);
CREATE TABLE tasks (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, task_id uuid NOT NULL,
  actor_id uuid NOT NULL, revision safe_amount NOT NULL,
  cancellation_generation safe_amount NOT NULL DEFAULT 0,
  state text NOT NULL, requirements jsonb NOT NULL,
  PRIMARY KEY (tenant_id, space_id, task_id),
  FOREIGN KEY (tenant_id, space_id) REFERENCES spaces,
  FOREIGN KEY (tenant_id, actor_id) REFERENCES actors
);
CREATE TABLE runs (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, run_id uuid NOT NULL,
  task_id uuid NOT NULL, attempt safe_amount NOT NULL CHECK (attempt > 0),
  requirement_revision safe_amount NOT NULL, version_pins jsonb NOT NULL,
  generation safe_amount NOT NULL, state text NOT NULL,
  PRIMARY KEY (tenant_id, space_id, run_id),
  UNIQUE (tenant_id, space_id, task_id, attempt),
  FOREIGN KEY (tenant_id, space_id, task_id) REFERENCES tasks
);
CREATE TABLE outbox (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, job_id uuid NOT NULL,
  mutation_id uuid NOT NULL, kind text NOT NULL, payload jsonb NOT NULL,
  authority_revision safe_amount NOT NULL, available_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz, PRIMARY KEY (tenant_id, space_id, job_id),
  UNIQUE (tenant_id, space_id, mutation_id),
  FOREIGN KEY (tenant_id, space_id) REFERENCES spaces
);
CREATE TABLE deletion_tombstones (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, tombstone_id uuid NOT NULL,
  record_kind text NOT NULL, record_id uuid NOT NULL, authority_revision safe_amount NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, space_id, tombstone_id),
  UNIQUE (tenant_id, space_id, record_kind, record_id),
  FOREIGN KEY (tenant_id, space_id) REFERENCES spaces
);
CREATE TABLE task_revisions (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, task_id uuid NOT NULL,
  revision safe_amount NOT NULL, requirements jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, space_id, task_id, revision),
  FOREIGN KEY (tenant_id, space_id, task_id) REFERENCES tasks
);
CREATE TABLE run_events (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, run_id uuid NOT NULL,
  sequence safe_amount NOT NULL CHECK (sequence > 0), event_id uuid NOT NULL,
  kind text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, space_id, run_id, sequence),
  UNIQUE (tenant_id, space_id, event_id),
  FOREIGN KEY (tenant_id, space_id, run_id) REFERENCES runs
);
CREATE TABLE commands (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, command_id uuid NOT NULL,
  actor_id uuid NOT NULL, task_id uuid NOT NULL, idempotency_key text NOT NULL,
  payload_digest text NOT NULL, expected_revision safe_amount NOT NULL,
  expires_at timestamptz NOT NULL, state text NOT NULL
    CHECK (state IN ('accepted','rejected','requires-review','completed')),
  payload jsonb NOT NULL, result jsonb,
  PRIMARY KEY (tenant_id, space_id, command_id),
  UNIQUE (tenant_id, space_id, actor_id, idempotency_key),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES actors,
  FOREIGN KEY (tenant_id, space_id, task_id) REFERENCES tasks
);
CREATE TABLE qualifications (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, qualification_id uuid NOT NULL,
  deployment_id text NOT NULL, environment_digest text NOT NULL,
  implementation_digest text NOT NULL, definition_digest text NOT NULL,
  evaluator_id text NOT NULL, evidence_reference text NOT NULL,
  expires_at timestamptz NOT NULL, revoked_at timestamptz, capabilities jsonb NOT NULL,
  PRIMARY KEY (tenant_id, space_id, qualification_id),
  UNIQUE (tenant_id, space_id, qualification_id, environment_digest),
  FOREIGN KEY (tenant_id, space_id) REFERENCES spaces
);
CREATE TABLE computer_assignments (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, assignment_id uuid NOT NULL,
  qualification_id uuid NOT NULL, computer_id text NOT NULL,
  runtime_generation safe_amount NOT NULL, predecessor_assignment_id uuid,
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id, space_id, assignment_id),
  UNIQUE (assignment_id), UNIQUE (computer_id),
  UNIQUE (tenant_id, space_id, predecessor_assignment_id),
  CHECK (predecessor_assignment_id IS DISTINCT FROM assignment_id),
  FOREIGN KEY (tenant_id, space_id, qualification_id) REFERENCES qualifications,
  FOREIGN KEY (tenant_id, space_id, predecessor_assignment_id) REFERENCES computer_assignments
);
CREATE TABLE execution_leases (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, lease_id uuid NOT NULL,
  run_id uuid NOT NULL, assignment_id uuid NOT NULL,
  task_generation safe_amount NOT NULL, run_generation safe_amount NOT NULL,
  runtime_generation safe_amount NOT NULL, fence safe_amount NOT NULL,
  expires_at timestamptz NOT NULL, revoked_at timestamptz,
  PRIMARY KEY (tenant_id, space_id, lease_id),
  FOREIGN KEY (tenant_id, space_id, run_id) REFERENCES runs,
  FOREIGN KEY (tenant_id, space_id, assignment_id) REFERENCES computer_assignments
);
CREATE TABLE budget_allowances (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, allowance_id uuid NOT NULL,
  parent_allowance_id uuid, payer_actor_id uuid NOT NULL, currency text NOT NULL,
  ceiling safe_amount NOT NULL, reserved safe_amount NOT NULL DEFAULT 0,
  settled safe_amount NOT NULL DEFAULT 0, revision safe_amount NOT NULL,
  PRIMARY KEY (tenant_id, space_id, allowance_id),
  CHECK (reserved::numeric + settled::numeric <= ceiling::numeric),
  CHECK (parent_allowance_id IS DISTINCT FROM allowance_id),
  FOREIGN KEY (tenant_id, space_id) REFERENCES spaces,
  FOREIGN KEY (tenant_id, payer_actor_id) REFERENCES actors,
  FOREIGN KEY (tenant_id, space_id, parent_allowance_id) REFERENCES budget_allowances
);
CREATE TABLE budget_reservations (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, reservation_id uuid NOT NULL,
  allowance_id uuid NOT NULL, actor_id uuid NOT NULL, run_id uuid NOT NULL,
  idempotency_key text NOT NULL, amount safe_amount NOT NULL,
  settled_amount safe_amount NOT NULL DEFAULT 0,
  state text NOT NULL CHECK (state IN ('active','unknown','settled','released')),
  reconciliation_receipt jsonb,
  PRIMARY KEY (tenant_id, space_id, reservation_id),
  UNIQUE (tenant_id, space_id, actor_id, idempotency_key),
  CHECK (settled_amount <= amount),
  CHECK (state NOT IN ('settled','released') OR reconciliation_receipt IS NOT NULL),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES actors,
  FOREIGN KEY (tenant_id, space_id, run_id) REFERENCES runs,
  FOREIGN KEY (tenant_id, space_id, allowance_id) REFERENCES budget_allowances
);
CREATE TABLE usage_settlements (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, settlement_id uuid NOT NULL,
  reservation_id uuid NOT NULL, provider_usage_key text NOT NULL,
  amount safe_amount NOT NULL, receipt jsonb NOT NULL,
  PRIMARY KEY (tenant_id, space_id, settlement_id),
  UNIQUE (tenant_id, space_id, reservation_id, provider_usage_key),
  FOREIGN KEY (tenant_id, space_id, reservation_id) REFERENCES budget_reservations
);
-- The single BudgetPort controller locks allowance ancestry in stable order and
-- commits parent/child accounting, reservation and deduplicated settlement together.
-- Unknown usage retains its reservation; ceilings are never copied as new authority.
CREATE TABLE artifact_uploads (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, upload_id uuid NOT NULL,
  actor_id uuid NOT NULL, object_key text NOT NULL, bytes_digest text NOT NULL,
  byte_count safe_amount NOT NULL, manifest_digest text NOT NULL,
  state text NOT NULL CHECK (state IN ('staged','confirmed','quarantined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, space_id, upload_id),
  UNIQUE (tenant_id, space_id, upload_id, bytes_digest, manifest_digest),
  FOREIGN KEY (tenant_id, space_id) REFERENCES spaces,
  FOREIGN KEY (tenant_id, actor_id) REFERENCES actors
);
CREATE TABLE storage_confirmations (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, confirmation_id uuid NOT NULL,
  upload_id uuid NOT NULL, bytes_digest text NOT NULL, manifest_digest text NOT NULL,
  bytes_receipt text NOT NULL, manifest_receipt text NOT NULL,
  confirmed_at timestamptz NOT NULL, storage_qualification_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, space_id, confirmation_id),
  UNIQUE (tenant_id, space_id, confirmation_id, bytes_digest, manifest_digest),
  FOREIGN KEY (tenant_id, space_id, upload_id, bytes_digest, manifest_digest)
    REFERENCES artifact_uploads (tenant_id, space_id, upload_id, bytes_digest, manifest_digest),
  FOREIGN KEY (tenant_id, space_id, storage_qualification_id) REFERENCES qualifications
);
CREATE TABLE artifact_versions (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, artifact_id uuid NOT NULL,
  version safe_amount NOT NULL CHECK (version > 0), run_id uuid NOT NULL,
  confirmation_id uuid NOT NULL, bytes_digest text NOT NULL, manifest_digest text NOT NULL,
  candidate_digest text NOT NULL,
  manifest jsonb NOT NULL, committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, space_id, artifact_id, version),
  UNIQUE (tenant_id, space_id, artifact_id, version, candidate_digest),
  FOREIGN KEY (tenant_id, space_id, run_id) REFERENCES runs,
  FOREIGN KEY (tenant_id, space_id, confirmation_id, bytes_digest, manifest_digest)
    REFERENCES storage_confirmations
      (tenant_id, space_id, confirmation_id, bytes_digest, manifest_digest)
);
-- Only the qualified storage controller may mint confirmations after both object
-- bytes and manifest are durably confirmed. Publication references committed versions.
CREATE TABLE sharing_grants (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, grant_id uuid NOT NULL,
  source_space_id uuid NOT NULL, artifact_id uuid NOT NULL, artifact_version safe_amount NOT NULL,
  recipient_actor_id uuid NOT NULL, authority_revision safe_amount NOT NULL,
  expires_at timestamptz NOT NULL, revoked_at timestamptz,
  PRIMARY KEY (tenant_id, space_id, grant_id),
  UNIQUE (tenant_id, space_id, grant_id, source_space_id, artifact_id, artifact_version),
  FOREIGN KEY (tenant_id, space_id) REFERENCES spaces,
  FOREIGN KEY (tenant_id, space_id, recipient_actor_id) REFERENCES memberships,
  FOREIGN KEY (tenant_id, source_space_id, artifact_id, artifact_version) REFERENCES artifact_versions
);
CREATE TABLE shared_artifact_references (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, reference_id uuid NOT NULL,
  grant_id uuid NOT NULL, source_space_id uuid NOT NULL,
  artifact_id uuid NOT NULL, artifact_version safe_amount NOT NULL,
  PRIMARY KEY (tenant_id, space_id, reference_id),
  FOREIGN KEY (tenant_id, space_id, grant_id, source_space_id, artifact_id, artifact_version)
    REFERENCES sharing_grants (tenant_id, space_id, grant_id, source_space_id, artifact_id, artifact_version)
);
-- Grant expiry/revocation and recipient identity are rechecked at every read;
-- a persisted reference does not grant ongoing access to the source Space.
CREATE TABLE approvals (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, approval_id uuid NOT NULL,
  actor_id uuid NOT NULL, run_id uuid NOT NULL, target text NOT NULL,
  parameters_digest text NOT NULL, artifact_id uuid NOT NULL, artifact_version safe_amount NOT NULL,
  policy_revision safe_amount NOT NULL, expires_at timestamptz NOT NULL,
  revoked_at timestamptz, binding jsonb NOT NULL,
  PRIMARY KEY (tenant_id, space_id, approval_id),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES actors,
  FOREIGN KEY (tenant_id, space_id, run_id) REFERENCES runs,
  FOREIGN KEY (tenant_id, space_id, artifact_id, artifact_version) REFERENCES artifact_versions
);
CREATE TABLE operations (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, operation_id uuid NOT NULL,
  actor_id uuid NOT NULL, run_id uuid NOT NULL, approval_id uuid NOT NULL,
  reservation_id uuid NOT NULL, lease_id uuid NOT NULL, idempotency_key text NOT NULL,
  target text NOT NULL, parameters_digest text NOT NULL, policy_revision safe_amount NOT NULL,
  task_generation safe_amount NOT NULL, run_generation safe_amount NOT NULL,
  runtime_generation safe_amount NOT NULL, state text NOT NULL
    CHECK (state IN ('prepared','dispatched','unknown','succeeded','failed','cancelled')),
  receipt jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, space_id, operation_id),
  UNIQUE (tenant_id, space_id, actor_id, idempotency_key),
  CHECK (state NOT IN ('succeeded','failed') OR receipt IS NOT NULL),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES actors,
  FOREIGN KEY (tenant_id, space_id, run_id) REFERENCES runs,
  FOREIGN KEY (tenant_id, space_id, approval_id) REFERENCES approvals,
  FOREIGN KEY (tenant_id, space_id, reservation_id) REFERENCES budget_reservations,
  FOREIGN KEY (tenant_id, space_id, lease_id) REFERENCES execution_leases
);
CREATE TABLE check_definitions (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, check_id uuid NOT NULL,
  definition_digest text NOT NULL, verifier_identity text NOT NULL,
  environment_digest text NOT NULL, lock_digest text NOT NULL,
  qualification_id uuid NOT NULL, definition jsonb NOT NULL,
  PRIMARY KEY (tenant_id, space_id, check_id),
  UNIQUE (tenant_id, space_id, check_id, definition_digest, verifier_identity, environment_digest, lock_digest),
  FOREIGN KEY (tenant_id, space_id, qualification_id, environment_digest)
    REFERENCES qualifications (tenant_id, space_id, qualification_id, environment_digest)
);
CREATE TABLE check_receipts (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, receipt_id uuid NOT NULL,
  check_id uuid NOT NULL, artifact_id uuid NOT NULL, artifact_version safe_amount NOT NULL,
  candidate_digest text NOT NULL, environment_digest text NOT NULL,
  lock_digest text NOT NULL, definition_digest text NOT NULL, verifier_identity text NOT NULL,
  result text NOT NULL CHECK (result IN ('pass','fail','pending')),
  evidence_reference text NOT NULL, issued_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, space_id, receipt_id),
  FOREIGN KEY (tenant_id, space_id, check_id, definition_digest, verifier_identity, environment_digest, lock_digest)
    REFERENCES check_definitions
      (tenant_id, space_id, check_id, definition_digest, verifier_identity, environment_digest, lock_digest),
  FOREIGN KEY (tenant_id, space_id, artifact_id, artifact_version, candidate_digest)
    REFERENCES artifact_versions (tenant_id, space_id, artifact_id, version, candidate_digest)
);
CREATE TABLE delivery_operations (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, delivery_id uuid NOT NULL,
  operation_id uuid NOT NULL, artifact_id uuid NOT NULL, artifact_version safe_amount NOT NULL,
  target text NOT NULL, state text NOT NULL
    CHECK (state IN ('prepared','dispatched','unknown','delivered','failed')),
  receipt jsonb, PRIMARY KEY (tenant_id, space_id, delivery_id),
  UNIQUE (tenant_id, space_id, operation_id),
  FOREIGN KEY (tenant_id, space_id, operation_id) REFERENCES operations,
  FOREIGN KEY (tenant_id, space_id, artifact_id, artifact_version) REFERENCES artifact_versions
);
CREATE TABLE notifications (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, notification_id uuid NOT NULL,
  actor_id uuid NOT NULL, run_id uuid NOT NULL, idempotency_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','sent','failed')),
  payload jsonb NOT NULL, PRIMARY KEY (tenant_id, space_id, notification_id),
  UNIQUE (tenant_id, space_id, actor_id, idempotency_key),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES actors,
  FOREIGN KEY (tenant_id, space_id, run_id) REFERENCES runs
);
CREATE TABLE authority_mutations (
  tenant_id uuid NOT NULL, space_id uuid NOT NULL, mutation_id uuid NOT NULL,
  job_id uuid NOT NULL, record_kind text NOT NULL, record_key jsonb NOT NULL,
  authority_revision safe_amount NOT NULL, committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, space_id, mutation_id),
  UNIQUE (tenant_id, space_id, mutation_id, job_id),
  FOREIGN KEY (tenant_id, space_id, job_id) REFERENCES outbox DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE outbox ADD CONSTRAINT outbox_authoritative_mutation_fk
  FOREIGN KEY (tenant_id, space_id, mutation_id, job_id)
  REFERENCES authority_mutations (tenant_id, space_id, mutation_id, job_id)
  DEFERRABLE INITIALLY DEFERRED;
-- Controllers commit authoritative mutation, authority_mutations and outbox in
-- ONE database transaction. Deferred paired FKs reject a missing outbox/mutation.
-- No object-store/volume snapshot can substitute for that database transaction.
CREATE INDEX outbox_pending ON outbox (available_at) WHERE completed_at IS NULL;
CREATE INDEX operations_unknown ON operations (tenant_id, space_id, run_id) WHERE state = 'unknown';
CREATE INDEX uploads_quarantine ON artifact_uploads (created_at) WHERE state <> 'confirmed';
CREATE UNIQUE INDEX one_current_computer_assignment ON computer_assignments (tenant_id, space_id)
  WHERE revoked_at IS NULL;

CREATE FUNCTION reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable authoritative history';
END $$;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['task_revisions','run_events','usage_settlements',
    'storage_confirmations','artifact_versions','check_definitions','check_receipts',
    'deletion_tombstones','authority_mutations'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()', name);
  END LOOP;
END $$;
CREATE FUNCTION protect_run_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'run history retained'; END IF;
  IF ROW(NEW.tenant_id,NEW.space_id,NEW.run_id,NEW.task_id,NEW.attempt,NEW.requirement_revision,NEW.version_pins)
    IS DISTINCT FROM ROW(OLD.tenant_id,OLD.space_id,OLD.run_id,OLD.task_id,OLD.attempt,OLD.requirement_revision,OLD.version_pins)
    OR NEW.generation < OLD.generation THEN RAISE EXCEPTION 'immutable run pins or stale generation'; END IF;
  IF OLD.state IN ('succeeded','partial','failed','cancelled') AND NEW.state <> OLD.state
    THEN RAISE EXCEPTION 'terminal run cannot reopen'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_run BEFORE UPDATE OR DELETE ON runs FOR EACH ROW EXECUTE FUNCTION protect_run_history();
CREATE FUNCTION protect_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'operation history retained'; END IF;
  IF ROW(NEW.tenant_id,NEW.space_id,NEW.operation_id,NEW.actor_id,NEW.run_id,NEW.approval_id,NEW.reservation_id,NEW.lease_id,NEW.idempotency_key,NEW.target,NEW.parameters_digest,NEW.policy_revision,NEW.task_generation,NEW.run_generation,NEW.runtime_generation)
    IS DISTINCT FROM ROW(OLD.tenant_id,OLD.space_id,OLD.operation_id,OLD.actor_id,OLD.run_id,OLD.approval_id,OLD.reservation_id,OLD.lease_id,OLD.idempotency_key,OLD.target,OLD.parameters_digest,OLD.policy_revision,OLD.task_generation,OLD.run_generation,OLD.runtime_generation)
    THEN RAISE EXCEPTION 'immutable operation binding'; END IF;
  IF OLD.state = 'unknown' AND NEW.state <> 'unknown'
    AND (NEW.state NOT IN ('succeeded','failed') OR NEW.receipt IS NULL)
    THEN RAISE EXCEPTION 'unknown effect requires reconciliation receipt'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_operation BEFORE UPDATE OR DELETE ON operations FOR EACH ROW EXECUTE FUNCTION protect_operation();

-- Tenant/Space identities never move. Replacement bindings receive new identities;
-- old generations and receipts remain historical evidence, subject to revocation.
CREATE FUNCTION protect_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.tenant_id, NEW.space_id) IS DISTINCT FROM ROW(OLD.tenant_id, OLD.space_id)
    THEN RAISE EXCEPTION 'immutable tenant/Space scope'; END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE name text; BEGIN
  FOR name IN SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'fabric' AND column_name = 'space_id' LOOP
    EXECUTE format('CREATE TRIGGER preserve_scope BEFORE UPDATE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.protect_scope()', name);
  END LOOP;
END $$;
CREATE FUNCTION protect_space_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'retain Space binding and tombstone'; END IF;
  IF ROW(NEW.owner_actor_id, NEW.payer_actor_id, NEW.data_namespace_id, NEW.compute_namespace_id)
    IS DISTINCT FROM ROW(OLD.owner_actor_id, OLD.payer_actor_id, OLD.data_namespace_id, OLD.compute_namespace_id)
    OR NEW.authority_revision < OLD.authority_revision
    THEN RAISE EXCEPTION 'immutable Space owner/payer/namespaces or stale authority'; END IF;
  IF OLD.lifecycle = 'deleted' AND NEW.lifecycle <> 'deleted'
    THEN RAISE EXCEPTION 'deleted Space cannot reopen'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_space_binding BEFORE UPDATE OR DELETE ON spaces
  FOR EACH ROW EXECUTE FUNCTION protect_space_binding();
CREATE FUNCTION protect_computer_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior computer_assignments%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'computer assignment history retained'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.assignment_id, NEW.qualification_id, NEW.computer_id, NEW.runtime_generation, NEW.predecessor_assignment_id)
      IS DISTINCT FROM ROW(OLD.assignment_id, OLD.qualification_id, OLD.computer_id, OLD.runtime_generation, OLD.predecessor_assignment_id)
      OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
      THEN RAISE EXCEPTION 'reassignment requires a new assignment identity and generation'; END IF;
  ELSE
    -- Serialize first assignment/replacement against the owning immutable Space.
    PERFORM 1 FROM fabric.spaces WHERE tenant_id = NEW.tenant_id AND space_id = NEW.space_id FOR UPDATE;
    IF NEW.predecessor_assignment_id IS NULL THEN
      IF EXISTS (SELECT 1 FROM fabric.computer_assignments
        WHERE tenant_id = NEW.tenant_id AND space_id = NEW.space_id)
        THEN RAISE EXCEPTION 'replacement requires an explicit predecessor'; END IF;
    ELSE
      SELECT * INTO prior FROM fabric.computer_assignments
        WHERE tenant_id = NEW.tenant_id AND space_id = NEW.space_id
          AND assignment_id = NEW.predecessor_assignment_id FOR UPDATE;
      IF NOT FOUND OR prior.revoked_at IS NULL OR NEW.runtime_generation <= prior.runtime_generation
        THEN RAISE EXCEPTION 'replacement requires revoked predecessor and newer generation'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_computer_assignment BEFORE INSERT OR UPDATE OR DELETE ON computer_assignments
  FOR EACH ROW EXECUTE FUNCTION protect_computer_assignment();
-- Exact receipt FKs bind candidate, immutable definition, verifier, environment
-- and lock. Protected verifier/qualification controllers issue these rows;
-- capability expiry/revocation is rechecked when consuming them, not inferred
-- from FK existence. Reassignment revokes the prior assignment and creates a
-- new identity with a strictly newer generation in one controller transaction.
-- assignment_id and computer_id (runtime identity) remain globally unique;
-- replacement creates fresh identities rather than moving an old runtime to a
-- different Space. Unique predecessor links forbid branching assignment history.

-- RLS is an additional boundary for scoped TRUSTED SERVICE sessions. app.* GUCs
-- are service assertions, not credentials: arbitrary SQL users can set custom GUCs.
-- Untrusted workers therefore receive NO database connection, schema/table/function
-- grants, owner/superuser/BYPASSRLS role, or ability to mint these assertions.
-- Deployers separately provision narrowly scoped controller privileges. No GRANT
-- is made here; approval/budget/check/qualification owners are separate services.
CREATE FUNCTION current_tenant() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true),'')::uuid
$$;
CREATE FUNCTION current_space() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.space_id', true),'')::uuid
$$;
CREATE FUNCTION current_identity() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.actor_id', true),'')::uuid
$$;
CREATE FUNCTION service_scope(t uuid, s uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.identity_verified', true) = 'true'
    AND t = fabric.current_tenant() AND s = fabric.current_space()
    AND fabric.current_identity() IS NOT NULL
$$;
DO $$ DECLARE name text; BEGIN
  FOR name IN SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'fabric' AND table_type = 'BASE TABLE' LOOP
    EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY', name);
    EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY', name);
    IF name = 'tenants' THEN
      EXECUTE format('CREATE POLICY service_tenant ON fabric.%I USING (tenant_id = fabric.current_tenant() AND fabric.current_identity() IS NOT NULL AND current_setting(''app.identity_verified'', true) = ''true'') WITH CHECK (tenant_id = fabric.current_tenant() AND fabric.current_identity() IS NOT NULL AND current_setting(''app.identity_verified'', true) = ''true'')', name);
    ELSIF name = 'actors' THEN
      EXECUTE format('CREATE POLICY service_identity ON fabric.%I USING (tenant_id = fabric.current_tenant() AND actor_id = fabric.current_identity() AND current_setting(''app.identity_verified'', true) = ''true'') WITH CHECK (tenant_id = fabric.current_tenant() AND actor_id = fabric.current_identity() AND current_setting(''app.identity_verified'', true) = ''true'')', name);
    ELSE
      EXECUTE format('CREATE POLICY service_scope ON fabric.%I USING (fabric.service_scope(tenant_id, space_id)) WITH CHECK (fabric.service_scope(tenant_id, space_id))', name);
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA fabric FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fabric FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA fabric REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA fabric REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- Policy checks tenant/Space session assertions; current membership, grants,
-- policy revisions, expiry, approval bindings, budget and fences remain trusted
-- controller preconditions, rechecked on dispatch, delayed jobs and every read.
-- Restore current revocations/tombstones first; then reconcile unknown effects;
-- only then permit authorized reads, rehydration and idempotent outbox jobs.
-- Object uploads before an authoritative commit remain quarantined. A volume
-- snapshot is not a database transaction and a memory commit does not save live files.
COMMIT;
