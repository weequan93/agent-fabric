-- Additive usage/resolution ledger. No accepted CHECK, role, function or byte is changed.
CREATE TABLE fabric.model_receipt_owners (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,attempt_id uuid NOT NULL,owner_id uuid NOT NULL,
 route text NOT NULL,profile_digest text NOT NULL,
 PRIMARY KEY(tenant_id,space_id,attempt_id),
 FOREIGN KEY(tenant_id,space_id,attempt_id) REFERENCES fabric.model_attempts
);
CREATE TABLE fabric.model_resolutions (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,attempt_id uuid NOT NULL,owner_id uuid NOT NULL,
 receipt_id uuid NOT NULL,usage_key text NOT NULL,kind text NOT NULL CHECK(kind IN('settled','sealed-not-accepted')),
 measured fabric.safe_amount NOT NULL,base_amount fabric.safe_amount NOT NULL,record jsonb NOT NULL,
 conformance boolean NOT NULL,
 PRIMARY KEY(tenant_id,space_id,attempt_id),UNIQUE(tenant_id,space_id,owner_id,receipt_id),UNIQUE(tenant_id,space_id,owner_id,usage_key),
 FOREIGN KEY(tenant_id,space_id,attempt_id) REFERENCES fabric.model_receipt_owners
);
CREATE TABLE fabric.model_usage_categories (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,attempt_id uuid NOT NULL,category text NOT NULL,
 amount fabric.safe_amount NOT NULL,
 PRIMARY KEY(tenant_id,space_id,attempt_id,category),FOREIGN KEY(tenant_id,space_id,attempt_id) REFERENCES fabric.model_resolutions
);
CREATE TABLE fabric.model_deficits (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,attempt_id uuid NOT NULL,amount fabric.safe_amount NOT NULL CHECK(amount>0),
 PRIMARY KEY(tenant_id,space_id,attempt_id),FOREIGN KEY(tenant_id,space_id,attempt_id) REFERENCES fabric.model_resolutions
);
CREATE TABLE fabric.model_deficit_allowances (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,attempt_id uuid NOT NULL,allowance_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,attempt_id,allowance_id),FOREIGN KEY(tenant_id,space_id,attempt_id) REFERENCES fabric.model_deficits,
 FOREIGN KEY(tenant_id,space_id,allowance_id) REFERENCES fabric.budget_allowances
);
CREATE TABLE fabric.model_deficit_accounts (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,attempt_id uuid NOT NULL,account_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,attempt_id,account_id),FOREIGN KEY(tenant_id,space_id,attempt_id) REFERENCES fabric.model_deficits,
 FOREIGN KEY(tenant_id,account_id) REFERENCES fabric.model_accounts
);
CREATE TABLE fabric.model_deficit_covers (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,attempt_id uuid NOT NULL,actor_id uuid NOT NULL,command_key text NOT NULL,
 amount fabric.safe_amount NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,attempt_id),FOREIGN KEY(tenant_id,space_id,attempt_id) REFERENCES fabric.model_deficits
);
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['model_receipt_owners','model_resolutions','model_usage_categories','model_deficits','model_deficit_allowances','model_deficit_accounts','model_deficit_covers'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY model_usage_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('CREATE TRIGGER model_usage_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
GRANT INSERT ON fabric.model_receipt_owners TO fabric_controller;
-- Recovery has current identity/payer/policy checks, but does not reopen native Task/Stop.
CREATE FUNCTION fabric.model_recovery_current(run_value uuid,control boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE b fabric.model_billing_bindings%ROWTYPE;a jsonb;p fabric.model_policies%ROWTYPE;
BEGIN
 a:=fabric.controller_authority();
 IF a IS NULL OR a->>'lifecycle'<>'active' OR (a->>'actorRevoked')::boolean OR (a->>'payerRevoked')::boolean OR (a->>'membershipRevoked')::boolean OR NOT(a->'grants' ? (CASE WHEN control THEN 'budget:control' ELSE 'task:write' END)) THEN RAISE EXCEPTION 'recovery authority denied' USING ERRCODE='42501';END IF;
 SELECT * INTO b FROM fabric.model_billing_bindings WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND run_id=run_value;
 IF NOT FOUND OR b.payer_id::text<>a->>'payerId' OR (NOT control AND b.actor_id::text<>a->>'actorId') THEN RAISE EXCEPTION 'original billing denied' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM fabric.model_policies WHERE tenant_id=b.tenant_id AND space_id=b.space_id FOR SHARE;
 IF NOT FOUND OR p.revision<>b.policy_revision THEN RAISE EXCEPTION 'recovery policy changed' USING ERRCODE='42501';END IF;
 RETURN b.record;
END $$;
-- New admissions encounter uncovered deficits at ANY affected allowance/account.
-- Original fixed reserve function still owns hierarchy validation and balance locks.
CREATE FUNCTION fabric.model_deficit_admission_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE b fabric.model_billing_bindings%ROWTYPE;
BEGIN
 SELECT * INTO b FROM fabric.model_billing_bindings WHERE tenant_id=NEW.tenant_id AND space_id=NEW.space_id AND run_id=NEW.run_id;
 IF NOT FOUND THEN RETURN NEW;END IF;
 IF EXISTS(WITH RECURSIVE path AS (
  SELECT allowance_id,parent_allowance_id FROM fabric.budget_allowances WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=b.leaf_allowance
  UNION SELECT a.allowance_id,a.parent_allowance_id FROM fabric.budget_allowances a JOIN path p ON a.allowance_id=p.parent_allowance_id WHERE a.tenant_id=b.tenant_id AND a.space_id=b.space_id
 ) SELECT 1 FROM path JOIN fabric.model_deficit_allowances d USING(allowance_id) WHERE d.tenant_id=b.tenant_id AND d.space_id=b.space_id AND NOT EXISTS(SELECT 1 FROM fabric.model_deficit_covers c WHERE (c.tenant_id,c.space_id,c.attempt_id)=(d.tenant_id,d.space_id,d.attempt_id))) THEN RAISE EXCEPTION 'uncovered model deficit' USING ERRCODE='P0003';END IF;
 IF EXISTS(WITH RECURSIVE path AS (
  SELECT account_id,parent_id FROM fabric.model_accounts WHERE tenant_id=b.tenant_id AND ((kind='tenant' AND subject_id=b.tenant_id) OR (kind='department' AND subject_id=b.department_id) OR (kind='person' AND subject_id=b.actor_id) OR account_id IN(SELECT account_id FROM fabric.model_account_bindings WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND run_id=b.run_id))
  UNION SELECT a.account_id,a.parent_id FROM fabric.model_accounts a JOIN path p ON a.account_id=p.parent_id WHERE a.tenant_id=b.tenant_id
 ) SELECT 1 FROM path JOIN fabric.model_deficit_accounts d USING(account_id) WHERE d.tenant_id=b.tenant_id AND NOT EXISTS(SELECT 1 FROM fabric.model_deficit_covers c WHERE (c.tenant_id,c.space_id,c.attempt_id)=(d.tenant_id,d.space_id,d.attempt_id))) THEN RAISE EXCEPTION 'uncovered aggregate deficit' USING ERRCODE='P0003';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER model_deficit_admission BEFORE INSERT ON fabric.budget_reservations FOR EACH ROW EXECUTE FUNCTION fabric.model_deficit_admission_guard();
-- Receipt proof is supplied only by the installed service composition, never caller JSON.
CREATE FUNCTION fabric.model_apply_observation(attempt_value uuid,observation jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();s uuid:=fabric.current_space();a fabric.model_attempts%ROWTYPE;r fabric.budget_reservations%ROWTYPE;
 own fabric.model_receipt_owners%ROWTYPE;old fabric.model_resolutions%ROWTYPE;receipt jsonb;original jsonb;measured numeric:=0;base bigint:=0;
 rid uuid;uk text;category record;total numeric:=0;kind text;conform boolean;response jsonb;
BEGIN
 SELECT * INTO a FROM fabric.model_attempts WHERE tenant_id=t AND space_id=s AND attempt_id=attempt_value FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'attempt denied' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM fabric.budget_reservations WHERE tenant_id=t AND space_id=s AND reservation_id=a.reservation_id FOR UPDATE;
 PERFORM fabric.model_recovery_current(r.run_id,false);
 SELECT * INTO own FROM fabric.model_receipt_owners WHERE tenant_id=t AND space_id=s AND attempt_id=attempt_value;
 IF NOT FOUND OR a.record->>'claimId' IS NULL THEN RAISE EXCEPTION 'owner or claim missing' USING ERRCODE='42501';END IF;
 kind:=observation->>'status';receipt:=CASE WHEN kind='settled' THEN observation->'receipt' ELSE observation END;
 original:=receipt->'original';
 IF original IS DISTINCT FROM a.record->'original' THEN RAISE EXCEPTION 'original conflict' USING ERRCODE='23505';END IF;
 SELECT * INTO old FROM fabric.model_resolutions WHERE tenant_id=t AND space_id=s AND attempt_id=attempt_value;
 IF FOUND THEN
  IF old.record IS DISTINCT FROM observation THEN RAISE EXCEPTION 'immutable resolution conflict' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('status',old.kind,'observation',old.record,'conformance',old.conformance);
 END IF;
 IF kind IN('unknown','accepted') THEN
  IF r.state NOT IN('active','unknown') THEN RAISE EXCEPTION 'terminal liability conflict' USING ERRCODE='23505';END IF;
  IF kind='unknown' THEN UPDATE fabric.budget_reservations SET state='unknown' WHERE tenant_id=t AND space_id=s AND reservation_id=a.reservation_id;END IF;
  RETURN jsonb_build_object('status',kind,'observation',observation,'conformance',true);
 END IF;
 IF receipt->>'ownerId' IS DISTINCT FROM own.owner_id::text OR kind NOT IN('settled','sealed-not-accepted') OR r.state NOT IN('active','unknown') THEN RAISE EXCEPTION 'owner resolution denied' USING ERRCODE='42501';END IF;
 IF kind='settled' THEN
  measured:=(receipt->>'measuredUnits')::numeric;
  IF measured<0 OR measured>9007199254740991 OR measured<>trunc(measured) THEN RAISE EXCEPTION 'invalid usage' USING ERRCODE='22003';END IF;
  FOR category IN SELECT * FROM jsonb_each(receipt->'components') LOOP total:=total+(category.value::text)::numeric;END LOOP;
  IF total<>measured THEN RAISE EXCEPTION 'category total mismatch' USING ERRCODE='22003';END IF;
  base:=least(measured,r.amount);rid:=(receipt->>'receiptId')::uuid;uk:=receipt->>'usageKey';conform:=measured<=r.amount::numeric+5;
 ELSE
  IF (receipt->>'dispatchEpoch')::numeric<(a.record->>'dispatchEpoch')::numeric THEN RAISE EXCEPTION 'stale seal' USING ERRCODE='42501';END IF;
  rid:=(receipt->>'proofId')::uuid;uk:='seal/'||rid::text;conform:=true;
 END IF;
 -- Frozen original membership lists; never recompute charge ownership from navigation.
 PERFORM 1 FROM fabric.model_accounts WHERE tenant_id=t AND account_id IN(SELECT account_id FROM fabric.model_reservation_accounts WHERE tenant_id=t AND space_id=s AND reservation_id=a.reservation_id) ORDER BY account_id FOR UPDATE;
 PERFORM 1 FROM fabric.budget_allowances WHERE tenant_id=t AND space_id=s AND allowance_id IN(SELECT allowance_id FROM fabric.model_reservation_allowances WHERE tenant_id=t AND space_id=s AND reservation_id=a.reservation_id) ORDER BY allowance_id FOR UPDATE;
 INSERT INTO fabric.model_resolutions VALUES(t,s,attempt_value,own.owner_id,rid,uk,kind,measured::bigint,base,observation,conform);
 UPDATE fabric.model_accounts SET reserved=reserved-r.amount,settled=settled+base,revision=revision+1 WHERE tenant_id=t AND account_id IN(SELECT account_id FROM fabric.model_reservation_accounts WHERE tenant_id=t AND space_id=s AND reservation_id=a.reservation_id);
 UPDATE fabric.budget_allowances SET reserved=reserved-r.amount,settled=settled+base,revision=revision+1 WHERE tenant_id=t AND space_id=s AND allowance_id IN(SELECT allowance_id FROM fabric.model_reservation_allowances WHERE tenant_id=t AND space_id=s AND reservation_id=a.reservation_id);
 UPDATE fabric.budget_reservations SET state=CASE WHEN kind='settled' THEN 'settled' ELSE 'released' END,settled_amount=base,reconciliation_receipt=observation WHERE tenant_id=t AND space_id=s AND reservation_id=a.reservation_id;
 IF kind='settled' THEN
  INSERT INTO fabric.usage_settlements VALUES(t,s,rid,a.reservation_id,uk,measured::bigint,receipt);
  FOR category IN SELECT * FROM jsonb_each(receipt->'components') LOOP
   INSERT INTO fabric.model_usage_categories VALUES(t,s,attempt_value,CASE category.key WHEN 'activeCompute' THEN 'active-compute' WHEN 'reservedCompute' THEN 'reserved-compute' WHEN 'coldStart' THEN 'cold-start' WHEN 'retainedStorage' THEN 'retained-storage' ELSE category.key END,(category.value::text)::bigint);
  END LOOP;
  IF measured>r.amount THEN
   INSERT INTO fabric.model_deficits VALUES(t,s,attempt_value,(measured-r.amount)::bigint);
   INSERT INTO fabric.model_deficit_allowances SELECT t,s,attempt_value,allowance_id FROM fabric.model_reservation_allowances WHERE tenant_id=t AND space_id=s AND reservation_id=a.reservation_id;
   INSERT INTO fabric.model_deficit_accounts SELECT t,s,attempt_value,account_id FROM fabric.model_reservation_accounts WHERE tenant_id=t AND space_id=s AND reservation_id=a.reservation_id;
  END IF;
 END IF;
 PERFORM fabric.model_recovery_current(r.run_id,false);
 RETURN jsonb_build_object('status',kind,'observation',observation,'conformance',conform);
END $$;
CREATE FUNCTION fabric.model_cover_deficit(attempt_value uuid,key_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();s uuid:=fabric.current_space();d fabric.model_deficits%ROWTYPE;run_value uuid;old fabric.model_deficit_covers%ROWTYPE;response jsonb;
BEGIN
 SELECT r.run_id INTO run_value FROM fabric.model_attempts a JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id) WHERE a.tenant_id=t AND a.space_id=s AND a.attempt_id=attempt_value;
 PERFORM fabric.model_recovery_current(run_value,true);
 SELECT * INTO d FROM fabric.model_deficits WHERE tenant_id=t AND space_id=s AND attempt_id=attempt_value FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'deficit absent' USING ERRCODE='42501';END IF;
 SELECT * INTO old FROM fabric.model_deficit_covers WHERE tenant_id=t AND space_id=s AND attempt_id=attempt_value;
 IF FOUND THEN
  IF old.actor_id<>fabric.current_identity() OR old.command_key<>key_value THEN RAISE EXCEPTION 'cover conflict' USING ERRCODE='23505';END IF;
  RETURN old.record;
 END IF;
 PERFORM 1 FROM fabric.model_accounts WHERE tenant_id=t AND account_id IN(SELECT account_id FROM fabric.model_deficit_accounts WHERE tenant_id=t AND space_id=s AND attempt_id=attempt_value) ORDER BY account_id FOR UPDATE;
 PERFORM 1 FROM fabric.budget_allowances WHERE tenant_id=t AND space_id=s AND allowance_id IN(SELECT allowance_id FROM fabric.model_deficit_allowances WHERE tenant_id=t AND space_id=s AND attempt_id=attempt_value) ORDER BY allowance_id FOR UPDATE;
 UPDATE fabric.model_accounts SET ceiling=ceiling+d.amount,settled=settled+d.amount,revision=revision+1 WHERE tenant_id=t AND account_id IN(SELECT account_id FROM fabric.model_deficit_accounts WHERE tenant_id=t AND space_id=s AND attempt_id=attempt_value);
 UPDATE fabric.budget_allowances SET ceiling=ceiling+d.amount,settled=settled+d.amount,revision=revision+1 WHERE tenant_id=t AND space_id=s AND allowance_id IN(SELECT allowance_id FROM fabric.model_deficit_allowances WHERE tenant_id=t AND space_id=s AND attempt_id=attempt_value);
 response:=jsonb_build_object('attemptId',attempt_value,'coveredUnits',d.amount,'autoResumed',false);
 INSERT INTO fabric.model_deficit_covers VALUES(t,s,attempt_value,fabric.current_identity(),key_value,d.amount,response);
 PERFORM fabric.model_recovery_current(run_value,true);RETURN response;
END $$;
REVOKE ALL ON FUNCTION fabric.model_recovery_current(uuid,boolean),fabric.model_deficit_admission_guard(),fabric.model_apply_observation(uuid,jsonb),fabric.model_cover_deficit(uuid,text) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.model_recovery_current(uuid,boolean),fabric.model_apply_observation(uuid,jsonb),fabric.model_cover_deficit(uuid,text) TO fabric_controller;
