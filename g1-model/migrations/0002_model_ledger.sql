-- Forward-only expansion. Disable admission for rollback; retain liabilities/history.
-- Existing fabric allowance/reservation/settlement constraints and grants are unchanged.
CREATE TABLE fabric.model_allowance_metadata (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,allowance_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('tenant','department','person','space','task','run')),
 subject_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,allowance_id),
 FOREIGN KEY(tenant_id,space_id,allowance_id) REFERENCES fabric.budget_allowances
);
CREATE TABLE fabric.model_accounts (
 tenant_id uuid NOT NULL,account_id uuid NOT NULL,parent_id uuid,
 payer_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('tenant','department','person')),
 subject_id uuid NOT NULL,ceiling fabric.safe_amount NOT NULL,
 reserved fabric.safe_amount NOT NULL DEFAULT 0,settled fabric.safe_amount NOT NULL DEFAULT 0,
 revision fabric.safe_amount NOT NULL DEFAULT 1,frozen boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,account_id),UNIQUE(tenant_id,kind,subject_id),FOREIGN KEY(tenant_id,payer_id) REFERENCES fabric.actors,
 FOREIGN KEY(tenant_id,parent_id) REFERENCES fabric.model_accounts,
 CHECK(parent_id IS DISTINCT FROM account_id),CHECK(reserved::numeric+settled::numeric<=ceiling::numeric)
);
CREATE TABLE fabric.model_billing_bindings (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,run_id uuid NOT NULL,task_id uuid NOT NULL,
 actor_id uuid NOT NULL,payer_id uuid NOT NULL,department_id uuid NOT NULL,cost_center text NOT NULL,
 leaf_allowance uuid NOT NULL,policy_revision fabric.safe_amount NOT NULL,
 record jsonb NOT NULL,
 CHECK(coalesce(record->>'tenantId'=tenant_id::text AND record->>'spaceId'=space_id::text AND record->>'runId'=run_id::text AND record->>'taskId'=task_id::text AND record->>'actorId'=actor_id::text AND record->>'payerId'=payer_id::text AND record->>'costCenter'=cost_center AND (record->>'policyRevision')::bigint=policy_revision,false)),
 PRIMARY KEY(tenant_id,space_id,run_id),UNIQUE(tenant_id,space_id,task_id,run_id),
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.runs,
 FOREIGN KEY(tenant_id,space_id,task_id) REFERENCES fabric.tasks,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES fabric.actors,FOREIGN KEY(tenant_id,payer_id) REFERENCES fabric.actors,
 FOREIGN KEY(tenant_id,space_id,leaf_allowance) REFERENCES fabric.model_allowance_metadata
);
CREATE TABLE fabric.model_account_bindings (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,run_id uuid NOT NULL,account_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,run_id,account_id),
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.model_billing_bindings,
 FOREIGN KEY(tenant_id,account_id) REFERENCES fabric.model_accounts
);
CREATE TABLE fabric.model_policies (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,revision fabric.safe_amount NOT NULL,
 admission_enabled boolean NOT NULL,profile_digests jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id),FOREIGN KEY(tenant_id,space_id) REFERENCES fabric.spaces
);
CREATE TABLE fabric.model_sessions (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,session_id uuid NOT NULL,task_id uuid NOT NULL,run_id uuid NOT NULL,
 binding jsonb NOT NULL,origin jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,session_id),UNIQUE(tenant_id,space_id,session_id,task_id,run_id),
 FOREIGN KEY(tenant_id,space_id,task_id,run_id) REFERENCES fabric.model_billing_bindings(tenant_id,space_id,task_id,run_id)
);
CREATE TABLE fabric.model_operations (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,operation_id uuid NOT NULL,
 actor_id uuid NOT NULL,task_id uuid NOT NULL,run_id uuid NOT NULL,session_id uuid NOT NULL,
 original_key text NOT NULL,request_digest text NOT NULL,binding_digest text NOT NULL,
 binding jsonb NOT NULL,request jsonb NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,operation_id),UNIQUE(tenant_id,space_id,actor_id,original_key),
 UNIQUE(tenant_id,space_id,operation_id,run_id),
 FOREIGN KEY(tenant_id,space_id,session_id,task_id,run_id) REFERENCES fabric.model_sessions(tenant_id,space_id,session_id,task_id,run_id),
 CHECK(record->>'operationId'=operation_id::text AND record->>'requestDigest'=request_digest)
);
CREATE TABLE fabric.model_attempts (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,attempt_id uuid NOT NULL,operation_id uuid NOT NULL,
 reservation_id uuid NOT NULL,ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 3),
 request jsonb NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,attempt_id),UNIQUE(tenant_id,space_id,operation_id,ordinal),
 UNIQUE(tenant_id,space_id,reservation_id),UNIQUE(tenant_id,space_id,operation_id,attempt_id),
 FOREIGN KEY(tenant_id,space_id,operation_id) REFERENCES fabric.model_operations,
 FOREIGN KEY(tenant_id,space_id,reservation_id) REFERENCES fabric.budget_reservations,
 CHECK(record->'original'->>'attemptId'=attempt_id::text AND record->'original'->>'operationId'=operation_id::text AND record->'original'->>'reservationId'=reservation_id::text)
);
CREATE TABLE fabric.model_claims (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,claim_id uuid NOT NULL,attempt_id uuid NOT NULL,
 dispatch_epoch fabric.safe_amount NOT NULL CHECK(dispatch_epoch>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,space_id,claim_id),UNIQUE(tenant_id,space_id,attempt_id),
 FOREIGN KEY(tenant_id,space_id,attempt_id) REFERENCES fabric.model_attempts
);
CREATE TABLE fabric.model_reservation_allowances (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,reservation_id uuid NOT NULL,allowance_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,reservation_id,allowance_id),
 FOREIGN KEY(tenant_id,space_id,reservation_id) REFERENCES fabric.budget_reservations,
 FOREIGN KEY(tenant_id,space_id,allowance_id) REFERENCES fabric.budget_allowances
);
CREATE TABLE fabric.model_reservation_accounts (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,reservation_id uuid NOT NULL,account_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,reservation_id,account_id),
 FOREIGN KEY(tenant_id,space_id,reservation_id) REFERENCES fabric.budget_reservations,
 FOREIGN KEY(tenant_id,account_id) REFERENCES fabric.model_accounts
);
CREATE TABLE fabric.model_category_reservations (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,reservation_id uuid NOT NULL,
 category text NOT NULL CHECK(category IN('model','service','tool','active-compute','reserved-compute','cold-start','retained-storage','network','embedding','reranking')),
 amount fabric.safe_amount NOT NULL,
 PRIMARY KEY(tenant_id,space_id,reservation_id,category),FOREIGN KEY(tenant_id,space_id,reservation_id) REFERENCES fabric.budget_reservations
);
CREATE TABLE fabric.model_native_events (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,session_id uuid NOT NULL,sequence fabric.safe_amount NOT NULL CHECK(sequence>0),event jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,session_id,sequence),FOREIGN KEY(tenant_id,space_id,session_id) REFERENCES fabric.model_sessions,
 CHECK((event->>'sequence')::bigint=sequence)
);
CREATE TABLE fabric.model_events (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,session_id uuid NOT NULL,sequence fabric.safe_amount NOT NULL CHECK(sequence>0),event jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,session_id,sequence),FOREIGN KEY(tenant_id,space_id,session_id) REFERENCES fabric.model_sessions,
 CHECK((event->>'sequence')::bigint=sequence)
);
CREATE TABLE fabric.model_audit (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,audit_id uuid NOT NULL,actor_id uuid NOT NULL,
 command_key text NOT NULL,payload_digest text NOT NULL,kind text NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,audit_id),UNIQUE(tenant_id,space_id,actor_id,command_key),
 UNIQUE(tenant_id,space_id,audit_id,actor_id,command_key,payload_digest),FOREIGN KEY(tenant_id,actor_id) REFERENCES fabric.actors
);
CREATE TABLE fabric.model_outbox (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,outbox_id uuid NOT NULL,audit_id uuid NOT NULL,actor_id uuid NOT NULL,
 command_key text NOT NULL,payload_digest text NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,outbox_id),UNIQUE(tenant_id,space_id,audit_id),
 UNIQUE(tenant_id,space_id,outbox_id,audit_id,actor_id,command_key,payload_digest),
 FOREIGN KEY(tenant_id,space_id,audit_id,actor_id,command_key,payload_digest) REFERENCES fabric.model_audit(tenant_id,space_id,audit_id,actor_id,command_key,payload_digest) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE fabric.model_command_receipts (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key text NOT NULL,
 payload_digest text NOT NULL,audit_id uuid NOT NULL,outbox_id uuid NOT NULL,receipt jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),UNIQUE(tenant_id,space_id,audit_id),UNIQUE(tenant_id,space_id,outbox_id),
 FOREIGN KEY(tenant_id,space_id,audit_id,actor_id,command_key,payload_digest) REFERENCES fabric.model_audit(tenant_id,space_id,audit_id,actor_id,command_key,payload_digest) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,space_id,outbox_id,audit_id,actor_id,command_key,payload_digest) REFERENCES fabric.model_outbox(tenant_id,space_id,outbox_id,audit_id,actor_id,command_key,payload_digest) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE fabric.model_audit ADD FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.model_command_receipts DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX model_pending_by_run ON fabric.model_operations(tenant_id,space_id,run_id,(record->>'status'));
-- Aggregate rows have no Space. Fixed functions never return foreign usage.
ALTER TABLE fabric.model_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.model_accounts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON fabric.model_accounts FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['model_allowance_metadata','model_billing_bindings','model_account_bindings','model_policies','model_sessions','model_operations','model_attempts','model_claims','model_reservation_allowances','model_reservation_accounts','model_category_reservations','model_native_events','model_events','model_audit','model_outbox','model_command_receipts'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY model_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
  IF n IN ('model_sessions','model_operations','model_attempts','model_claims','model_native_events','model_events','model_audit','model_outbox','model_command_receipts') THEN EXECUTE format('GRANT INSERT ON fabric.%I TO fabric_controller',n);END IF;
  IF n IN ('model_operations','model_attempts') THEN EXECUTE format('GRANT UPDATE ON fabric.%I TO fabric_controller',n);
  ELSIF n<>'model_policies' THEN EXECUTE format('CREATE TRIGGER model_history_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);END IF;
 END LOOP;
END $$;
CREATE FUNCTION fabric.model_immutable_intent() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF (to_jsonb(NEW)-'record') IS DISTINCT FROM (to_jsonb(OLD)-'record') THEN RAISE EXCEPTION 'immutable model intent';END IF;
 IF TG_TABLE_NAME='model_operations' THEN
  IF (NEW.record-'status'-'attemptsTaken'-'knownReceiptId') IS DISTINCT FROM (OLD.record-'status'-'attemptsTaken'-'knownReceiptId') OR (NEW.record->>'attemptsTaken')::int<(OLD.record->>'attemptsTaken')::int OR (NEW.record->>'attemptsTaken')::int>3 THEN RAISE EXCEPTION 'immutable operation binding';END IF;
 ELSE
  IF (NEW.record-'status'-'claimId') IS DISTINCT FROM (OLD.record-'status'-'claimId') OR (OLD.record->>'claimId' IS NOT NULL AND NEW.record->>'claimId' IS DISTINCT FROM OLD.record->>'claimId') THEN RAISE EXCEPTION 'immutable attempt binding';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER model_operation_binding BEFORE UPDATE ON fabric.model_operations FOR EACH ROW EXECUTE FUNCTION fabric.model_immutable_intent();
CREATE TRIGGER model_attempt_binding BEFORE UPDATE ON fabric.model_attempts FOR EACH ROW EXECUTE FUNCTION fabric.model_immutable_intent();

CREATE FUNCTION fabric.model_current(run_value uuid,profile_value text,admission boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE b fabric.model_billing_bindings%ROWTYPE;p fabric.model_policies%ROWTYPE;t fabric.tasks%ROWTYPE;r fabric.runs%ROWTYPE;a jsonb;
BEGIN
 a:=fabric.controller_authority();
 IF a IS NULL OR a->>'lifecycle'<>'active' OR (a->>'actorRevoked')::boolean OR (a->>'payerRevoked')::boolean OR (a->>'membershipRevoked')::boolean OR NOT (a->'grants' ? 'task:write') THEN RAISE EXCEPTION 'model unauthorized' USING ERRCODE='42501';END IF;
 SELECT * INTO b FROM fabric.model_billing_bindings WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND run_id=run_value;
 IF NOT FOUND OR b.actor_id<>fabric.current_identity() OR b.payer_id<>(a->>'payerId')::uuid THEN RAISE EXCEPTION 'model binding denied' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM fabric.model_policies WHERE tenant_id=b.tenant_id AND space_id=b.space_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'model policy absent' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM fabric.tasks WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND task_id=b.task_id FOR SHARE;
 SELECT * INTO r FROM fabric.runs WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND run_id=b.run_id FOR SHARE;
 IF r.task_id IS DISTINCT FROM b.task_id OR t.actor_id IS DISTINCT FROM b.actor_id OR t.revision IS DISTINCT FROM (b.record->>'requirementsRevision')::bigint OR t.cancellation_generation IS DISTINCT FROM (b.record->>'cancellationGeneration')::bigint OR r.generation IS DISTINCT FROM (b.record->>'workerGeneration')::bigint OR t.requirements->>'intent' IS DISTINCT FROM b.record->>'intent' OR (a->>'membershipRevision')::bigint IS DISTINCT FROM (b.record->>'membershipRevision')::bigint OR p.revision IS DISTINCT FROM b.policy_revision OR r.state IN('succeeded','failed','cancelled') THEN RAISE EXCEPTION 'model current binding denied' USING ERRCODE='42501';END IF;
 IF admission AND (NOT p.admission_enabled OR NOT(p.profile_digests ? profile_value)) THEN RAISE EXCEPTION 'model policy denied' USING ERRCODE='42501';END IF;
 RETURN to_jsonb(b);
END $$;
CREATE FUNCTION fabric.model_reserve(run_value uuid,reservation_value uuid,key_value text,categories jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE b fabric.model_billing_bindings%ROWTYPE;a fabric.budget_allowances%ROWTYPE;m fabric.model_allowance_metadata%ROWTYPE;g fabric.model_accounts%ROWTYPE;
 ids uuid[]:=ARRAY[]::uuid[];accounts uuid[]:=ARRAY[]::uuid[];path uuid[];next_id uuid;x uuid;row_id uuid;total numeric:=0;entry record;kinds text[]:=ARRAY[]::text[];
BEGIN
 SELECT * INTO b FROM fabric.model_billing_bindings WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND run_id=run_value;
 IF NOT FOUND THEN RAISE EXCEPTION 'billing binding denied' USING ERRCODE='42501';END IF;
 PERFORM fabric.model_current(run_value,NULL,false);
 IF jsonb_typeof(categories)<>'object' OR categories='{}'::jsonb THEN RAISE EXCEPTION 'invalid categories' USING ERRCODE='22003';END IF;
 FOR entry IN SELECT * FROM jsonb_each(categories) LOOP
  IF entry.key NOT IN('model','service','tool','active-compute','reserved-compute','cold-start','retained-storage','network','embedding','reranking') OR jsonb_typeof(entry.value)<>'number' OR entry.value::text !~ '^(0|[1-9][0-9]*)$' OR (entry.value::text)::numeric>9007199254740991 THEN RAISE EXCEPTION 'invalid amount' USING ERRCODE='22003';END IF;
  total:=total+(entry.value::text)::numeric;
 END LOOP;
 IF total<=0 OR total>9007199254740991 THEN RAISE EXCEPTION 'invalid total' USING ERRCODE='22003';END IF;
 next_id:=b.leaf_allowance;
 WHILE next_id IS NOT NULL LOOP
  IF next_id=ANY(ids) OR cardinality(ids)>=64 THEN RAISE EXCEPTION 'invalid ancestry';END IF;ids:=array_append(ids,next_id);
  SELECT * INTO a FROM fabric.budget_allowances WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=next_id;
  SELECT * INTO m FROM fabric.model_allowance_metadata WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=next_id;
  IF a.allowance_id IS NULL OR m.allowance_id IS NULL OR a.payer_actor_id<>b.payer_id OR a.currency<>'synthetic-utf8-byte-unit' OR m.subject_id IS DISTINCT FROM (CASE m.kind WHEN 'tenant' THEN b.tenant_id WHEN 'department' THEN b.department_id WHEN 'person' THEN b.actor_id WHEN 'space' THEN b.space_id WHEN 'task' THEN b.task_id WHEN 'run' THEN b.run_id END) THEN RAISE EXCEPTION 'invalid allowance binding' USING ERRCODE='42501';END IF;
  kinds:=array_append(kinds,m.kind);next_id:=a.parent_allowance_id;
 END LOOP;
 IF NOT ARRAY['tenant','department','person','space','task','run']::text[] <@ kinds THEN RAISE EXCEPTION 'incomplete hierarchy';END IF;
 FOR row_id IN
  SELECT account_id FROM fabric.model_account_bindings WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND run_id=b.run_id
  UNION SELECT account_id FROM fabric.model_accounts WHERE tenant_id=b.tenant_id AND ((kind='tenant' AND subject_id=b.tenant_id) OR (kind='department' AND subject_id=b.department_id) OR (kind='person' AND subject_id=b.actor_id))
  ORDER BY account_id LOOP
  path:=ARRAY[]::uuid[];next_id:=row_id;
  WHILE next_id IS NOT NULL LOOP
   IF next_id=ANY(path) OR cardinality(path)>=64 THEN RAISE EXCEPTION 'invalid account ancestry';END IF;path:=array_append(path,next_id);
   SELECT * INTO g FROM fabric.model_accounts WHERE tenant_id=b.tenant_id AND account_id=next_id;
   IF g.account_id IS NULL OR g.payer_id<>b.payer_id OR g.subject_id IS DISTINCT FROM (CASE g.kind WHEN 'tenant' THEN b.tenant_id WHEN 'department' THEN b.department_id WHEN 'person' THEN b.actor_id END) THEN RAISE EXCEPTION 'invalid aggregate binding' USING ERRCODE='42501';END IF;
   IF NOT(next_id=ANY(accounts)) THEN accounts:=array_append(accounts,next_id);END IF;next_id:=g.parent_id;
  END LOOP;
 END LOOP;
 PERFORM 1 FROM fabric.model_accounts WHERE tenant_id=b.tenant_id AND account_id=ANY(accounts) ORDER BY account_id FOR UPDATE;
 PERFORM 1 FROM fabric.budget_allowances WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=ANY(ids) ORDER BY allowance_id FOR UPDATE;
 PERFORM fabric.model_current(run_value,NULL,false);
 path:=ARRAY[]::uuid[];next_id:=b.leaf_allowance;
 WHILE next_id IS NOT NULL LOOP
  IF next_id=ANY(path) OR cardinality(path)>=64 OR NOT(next_id=ANY(ids)) THEN RAISE EXCEPTION 'ancestry changed after lock';END IF;
  path:=array_append(path,next_id);
  SELECT parent_allowance_id INTO next_id FROM fabric.budget_allowances WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=next_id;
 END LOOP;
 IF cardinality(path)<>cardinality(ids) THEN RAISE EXCEPTION 'ancestry changed after lock';END IF;
 IF EXISTS(SELECT 1 FROM fabric.model_accounts WHERE tenant_id=b.tenant_id AND account_id=ANY(accounts) AND (frozen OR reserved::numeric+settled::numeric+total>ceiling::numeric)) OR EXISTS(SELECT 1 FROM fabric.budget_allowances WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=ANY(ids) AND reserved::numeric+settled::numeric+total>ceiling::numeric) THEN RAISE EXCEPTION 'budget exhausted' USING ERRCODE='P0002';END IF;
 UPDATE fabric.model_accounts SET reserved=reserved+total::bigint,revision=revision+1 WHERE tenant_id=b.tenant_id AND account_id=ANY(accounts);
 UPDATE fabric.budget_allowances SET reserved=reserved+total::bigint,revision=revision+1 WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=ANY(ids);
 INSERT INTO fabric.budget_reservations(tenant_id,space_id,reservation_id,allowance_id,actor_id,run_id,idempotency_key,amount,state) VALUES(b.tenant_id,b.space_id,reservation_value,b.leaf_allowance,b.actor_id,b.run_id,key_value,total::bigint,'active');
 FOREACH x IN ARRAY ids LOOP INSERT INTO fabric.model_reservation_allowances VALUES(b.tenant_id,b.space_id,reservation_value,x);END LOOP;
 FOREACH x IN ARRAY accounts LOOP INSERT INTO fabric.model_reservation_accounts VALUES(b.tenant_id,b.space_id,reservation_value,x);END LOOP;
 FOR entry IN SELECT * FROM jsonb_each(categories) LOOP INSERT INTO fabric.model_category_reservations VALUES(b.tenant_id,b.space_id,reservation_value,entry.key,(entry.value::text)::bigint);END LOOP;
 RETURN b.leaf_allowance;
END $$;
CREATE FUNCTION fabric.model_top_up(allowance_value uuid,added bigint) RETURNS fabric.safe_amount
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE a jsonb;r fabric.budget_allowances%ROWTYPE;
BEGIN
 a:=fabric.controller_authority();
 IF a IS NULL OR NOT(a->'grants' ? 'budget:control') OR a->>'lifecycle'<>'active' OR (a->>'actorRevoked')::boolean OR (a->>'payerRevoked')::boolean OR (a->>'membershipRevoked')::boolean THEN RAISE EXCEPTION 'top up denied' USING ERRCODE='42501';END IF;
 IF added<=0 OR added>9007199254740991 THEN RAISE EXCEPTION 'invalid top up' USING ERRCODE='22003';END IF;
 SELECT * INTO r FROM fabric.budget_allowances WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND allowance_id=allowance_value FOR UPDATE;
 IF NOT FOUND OR r.payer_actor_id<>(a->>'payerId')::uuid OR r.currency<>'synthetic-utf8-byte-unit' OR NOT EXISTS(SELECT 1 FROM fabric.model_allowance_metadata WHERE tenant_id=r.tenant_id AND space_id=r.space_id AND allowance_id=r.allowance_id) THEN RAISE EXCEPTION 'top up binding denied' USING ERRCODE='42501';END IF;
 a:=fabric.controller_authority();
 IF NOT(a->'grants' ? 'budget:control') OR (a->>'payerRevoked')::boolean OR (a->>'membershipRevoked')::boolean THEN RAISE EXCEPTION 'late top up denied' USING ERRCODE='42501';END IF;
 IF r.ceiling::numeric+added::numeric>9007199254740991 THEN RAISE EXCEPTION 'top up overflow' USING ERRCODE='22003';END IF;
 UPDATE fabric.budget_allowances SET ceiling=ceiling+added,revision=revision+1 WHERE tenant_id=r.tenant_id AND space_id=r.space_id AND allowance_id=r.allowance_id RETURNING * INTO r;
 RETURN r.revision;
END $$;
REVOKE ALL ON FUNCTION fabric.model_immutable_intent(),fabric.model_current(uuid,text,boolean),fabric.model_reserve(uuid,uuid,text,jsonb),fabric.model_top_up(uuid,bigint) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.model_current(uuid,text,boolean),fabric.model_reserve(uuid,uuid,text,jsonb),fabric.model_top_up(uuid,bigint) TO fabric_controller;

-- Aggregate topology is installation authority, balances are ledger authority.
CREATE FUNCTION fabric.model_account_binding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF (to_jsonb(NEW)-'ceiling'-'reserved'-'settled'-'revision'-'frozen') IS DISTINCT FROM (to_jsonb(OLD)-'ceiling'-'reserved'-'settled'-'revision'-'frozen') THEN RAISE EXCEPTION 'immutable billing account';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER model_account_binding_immutable BEFORE UPDATE ON fabric.model_accounts FOR EACH ROW EXECUTE FUNCTION fabric.model_account_binding_guard();
REVOKE ALL ON FUNCTION fabric.model_account_binding_guard() FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
