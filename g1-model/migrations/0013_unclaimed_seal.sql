-- Forward repair of model3: permanent nonacceptance releases unclaimed preparation.
-- Installed SQL, frozen reservation membership, owner, history and privileges survive.
CREATE OR REPLACE FUNCTION fabric.model_apply_observation(attempt_value uuid,observation jsonb) RETURNS jsonb
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
 IF NOT FOUND THEN RAISE EXCEPTION 'owner missing' USING ERRCODE='42501';END IF;
 kind:=observation->>'status';
 -- An unclaimed original may only resolve via its permanent owner seal.
 -- No claim or invocation permission is fabricated for accounting recovery.
 IF a.record->>'claimId' IS NULL AND (kind='sealed-not-accepted' AND a.record->>'status' IN('prepared','sealed-not-accepted')) IS NOT TRUE THEN RAISE EXCEPTION 'claim missing' USING ERRCODE='42501';END IF;
receipt:=CASE WHEN kind='settled' THEN observation->'receipt' ELSE observation END;
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
