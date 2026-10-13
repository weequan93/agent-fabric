-- Forward-only synthetic meter. Existing accepted tables/functions are unchanged.
-- The mandatory native reservation run_id is an immutable correlation anchor for
-- Space costs, NOT economic task attribution. origin_run_id alone owns task cost.
CREATE TABLE fabric.model_resource_bindings (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,resource_id uuid NOT NULL,generation fabric.safe_amount NOT NULL,
 owner_id uuid NOT NULL,actor_id uuid NOT NULL,payer_id uuid NOT NULL,department_id uuid NOT NULL,
 allowance_id uuid NOT NULL,anchor_run_id uuid NOT NULL,cost_center text NOT NULL,purpose text NOT NULL,
 policy text NOT NULL CHECK(policy='reserved-until-confirmed-suspended'),
 PRIMARY KEY(tenant_id,space_id,resource_id),UNIQUE(tenant_id,resource_id),
 FOREIGN KEY(tenant_id,space_id,resource_id) REFERENCES fabric.model_computer_assignments(tenant_id,space_id,resource_id),
 FOREIGN KEY(tenant_id,space_id,anchor_run_id) REFERENCES fabric.model_billing_bindings(tenant_id,space_id,run_id),
 FOREIGN KEY(tenant_id,space_id,allowance_id) REFERENCES fabric.model_allowance_metadata,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES fabric.actors,FOREIGN KEY(tenant_id,payer_id) REFERENCES fabric.actors
);
CREATE TABLE fabric.model_resource_rates (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,resource_id uuid NOT NULL,category text NOT NULL CHECK(category IN('service','active-compute','reserved-compute','cold-start','retained-storage','network')),
 version fabric.safe_amount NOT NULL CHECK(version>0),start_tick fabric.safe_amount NOT NULL,end_tick fabric.safe_amount NOT NULL,rate fabric.safe_amount NOT NULL CHECK(rate>0),
 CHECK(end_tick>start_tick),PRIMARY KEY(tenant_id,space_id,resource_id,category,version),
 FOREIGN KEY(tenant_id,space_id,resource_id) REFERENCES fabric.model_resource_bindings
);
CREATE TABLE fabric.model_resource_intervals (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,resource_id uuid NOT NULL,receipt_id uuid NOT NULL,
 reservation_id uuid NOT NULL,origin_run_id uuid,category text NOT NULL,start_tick fabric.safe_amount NOT NULL,end_tick fabric.safe_amount NOT NULL,
 rate_version fabric.safe_amount NOT NULL,amount fabric.safe_amount NOT NULL CHECK(amount>0),record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,receipt_id),UNIQUE(tenant_id,space_id,reservation_id),
 FOREIGN KEY(tenant_id,space_id,resource_id,category,rate_version) REFERENCES fabric.model_resource_rates(tenant_id,space_id,resource_id,category,version),
 FOREIGN KEY(tenant_id,space_id,reservation_id) REFERENCES fabric.budget_reservations,
 FOREIGN KEY(tenant_id,space_id,origin_run_id) REFERENCES fabric.model_billing_bindings(tenant_id,space_id,run_id),CHECK(end_tick>start_tick)
);
CREATE INDEX model_resource_overlap ON fabric.model_resource_intervals(tenant_id,space_id,resource_id,category,start_tick,end_tick);
CREATE TABLE fabric.model_resource_lifecycle (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,resource_id uuid NOT NULL,key uuid NOT NULL,at_tick fabric.safe_amount NOT NULL,
 action text NOT NULL CHECK(action IN('archive','stop','request-suspend','declare-delete-retention','confirmed-simulated-suspended')),record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,key),FOREIGN KEY(tenant_id,space_id,resource_id) REFERENCES fabric.model_resource_bindings
);
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['model_resource_bindings','model_resource_rates','model_resource_intervals','model_resource_lifecycle'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY resource_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('CREATE TRIGGER resource_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
GRANT INSERT ON fabric.model_resource_lifecycle TO fabric_controller;
CREATE FUNCTION fabric.model_resource_current(resource_value uuid,control boolean DEFAULT false) RETURNS fabric.model_resource_bindings
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE b fabric.model_resource_bindings%ROWTYPE;a jsonb;
BEGIN
 a:=fabric.controller_authority();
 SELECT * INTO b FROM fabric.model_resource_bindings WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND resource_id=resource_value;
 IF NOT FOUND OR a IS NULL OR a->>'lifecycle'<>'active' OR (a->>'actorRevoked')::boolean OR (a->>'payerRevoked')::boolean OR (a->>'membershipRevoked')::boolean OR b.payer_id::text<>a->>'payerId' OR NOT(a->'grants' ? CASE WHEN control THEN 'budget:control' ELSE 'task:read' END) THEN RAISE EXCEPTION 'resource authority denied' USING ERRCODE='42501';END IF;
 RETURN b;
END $$;
-- Stable ancestry locking and original native ledger membership rows, identical
-- economic balances to model reservations. Persistent Space path excludes tasks.
CREATE FUNCTION fabric.model_resource_reserve(receipt jsonb,reservation_value uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE b fabric.model_resource_bindings%ROWTYPE;q fabric.model_resource_rates%ROWTYPE;old fabric.model_resource_intervals%ROWTYPE;
 a fabric.budget_allowances%ROWTYPE;m fabric.model_allowance_metadata%ROWTYPE;g fabric.model_accounts%ROWTYPE;
 ids uuid[]:=ARRAY[]::uuid[];accounts uuid[]:=ARRAY[]::uuid[];kinds text[]:=ARRAY[]::text[];path uuid[];n uuid;x uuid;origin uuid;leaf uuid;
 total numeric;lo bigint;hi bigint;cat_value text;
BEGIN
 b:=fabric.model_resource_current((receipt->>'resourceId')::uuid,false);
 IF b.actor_id<>fabric.current_identity() OR NOT((fabric.controller_authority())->'grants' ? 'task:write') OR receipt->>'assurance'<>'deterministic-local-only' OR receipt->>'ownerId' IS DISTINCT FROM b.owner_id::text OR receipt->>'tenantId' IS DISTINCT FROM b.tenant_id::text OR receipt->>'spaceId' IS DISTINCT FROM b.space_id::text OR (receipt->>'assignmentGeneration')::bigint IS DISTINCT FROM b.generation THEN RAISE EXCEPTION 'resource owner denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('resource/'||b.tenant_id::text||'/'||b.resource_id::text,0));
 SELECT * INTO old FROM fabric.model_resource_intervals WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND receipt_id=(receipt->>'receiptId')::uuid;
 IF FOUND THEN IF old.record IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'receipt conflict' USING ERRCODE='23505';END IF;RETURN old.reservation_id;END IF;
 cat_value:=receipt->>'category';lo:=(receipt->>'start')::bigint;hi:=(receipt->>'end')::bigint;origin:=(receipt->>'originRunId')::uuid;
 SELECT * INTO q FROM fabric.model_resource_rates WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND resource_id=b.resource_id AND model_resource_rates.category=cat_value AND version=(receipt->>'rateVersion')::bigint;
 IF NOT FOUND OR hi<=lo OR lo<q.start_tick OR hi>q.end_tick OR q.rate IS DISTINCT FROM (receipt->>'rateUnits')::bigint THEN RAISE EXCEPTION 'rate or policy boundary conflict' USING ERRCODE='23505';END IF;
 IF EXISTS(SELECT 1 FROM fabric.model_resource_intervals i WHERE i.tenant_id=b.tenant_id AND i.space_id=b.space_id AND i.resource_id=b.resource_id AND (i.category=cat_value OR (i.category IN('active-compute','reserved-compute') AND cat_value IN('active-compute','reserved-compute'))) AND i.start_tick<hi AND lo<i.end_tick) THEN RAISE EXCEPTION 'interval overlap' USING ERRCODE='23505';END IF;
 IF cat_value IN('active-compute','reserved-compute','cold-start') AND EXISTS(SELECT 1 FROM fabric.model_resource_lifecycle l WHERE l.tenant_id=b.tenant_id AND l.space_id=b.space_id AND l.resource_id=b.resource_id AND l.action='confirmed-simulated-suspended' AND hi>l.at_tick) THEN RAISE EXCEPTION 'compute after confirmed suspension' USING ERRCODE='23505';END IF;
 total:=(hi::numeric-lo::numeric)*q.rate::numeric;
 IF total<=0 OR total>9007199254740991 THEN RAISE EXCEPTION 'resource units overflow' USING ERRCODE='22003';END IF;
 IF origin IS NOT NULL THEN
  PERFORM fabric.model_reserve(origin,reservation_value,'resource/'||(receipt->>'receiptId'),jsonb_build_object(cat_value,total::bigint));
 ELSE
  n:=b.allowance_id;
  WHILE n IS NOT NULL LOOP
   IF n=ANY(ids) OR cardinality(ids)>=64 THEN RAISE EXCEPTION 'resource ancestry';END IF;ids:=array_append(ids,n);
   SELECT * INTO a FROM fabric.budget_allowances WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=n;
   SELECT * INTO m FROM fabric.model_allowance_metadata WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=n;
   IF a.allowance_id IS NULL OR m.allowance_id IS NULL OR a.payer_actor_id<>b.payer_id OR a.currency<>'synthetic-utf8-byte-unit' OR m.kind NOT IN('tenant','department','person','space') OR m.subject_id IS DISTINCT FROM (CASE m.kind WHEN 'tenant' THEN b.tenant_id WHEN 'department' THEN b.department_id WHEN 'person' THEN b.actor_id ELSE b.space_id END) THEN RAISE EXCEPTION 'resource allowance binding' USING ERRCODE='42501';END IF;
   IF cardinality(ids)=1 AND m.kind<>'space' THEN RAISE EXCEPTION 'explicit Space allowance required' USING ERRCODE='42501';END IF;
   kinds:=array_append(kinds,m.kind);n:=a.parent_allowance_id;
  END LOOP;
  IF NOT ARRAY['tenant','department','person','space']::text[] <@ kinds THEN RAISE EXCEPTION 'resource hierarchy incomplete';END IF;
  FOR x IN SELECT account_id FROM fabric.model_accounts WHERE tenant_id=b.tenant_id AND ((kind='tenant' AND subject_id=b.tenant_id) OR (kind='department' AND subject_id=b.department_id) OR (kind='person' AND subject_id=b.actor_id)) ORDER BY account_id LOOP
   path:=ARRAY[]::uuid[];n:=x;
   WHILE n IS NOT NULL LOOP
    IF n=ANY(path) OR cardinality(path)>=64 THEN RAISE EXCEPTION 'resource account ancestry';END IF;path:=array_append(path,n);
    SELECT * INTO g FROM fabric.model_accounts WHERE tenant_id=b.tenant_id AND account_id=n;
    IF g.account_id IS NULL OR g.payer_id<>b.payer_id OR g.subject_id IS DISTINCT FROM (CASE g.kind WHEN 'tenant' THEN b.tenant_id WHEN 'department' THEN b.department_id ELSE b.actor_id END) THEN RAISE EXCEPTION 'resource account binding' USING ERRCODE='42501';END IF;
    IF NOT(n=ANY(accounts)) THEN accounts:=array_append(accounts,n);END IF;n:=g.parent_id;
   END LOOP;
  END LOOP;
  PERFORM 1 FROM fabric.model_accounts WHERE tenant_id=b.tenant_id AND account_id=ANY(accounts) ORDER BY account_id FOR UPDATE;
  PERFORM 1 FROM fabric.budget_allowances WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=ANY(ids) ORDER BY allowance_id FOR UPDATE;
  -- Rewalk after locks; topology cannot change while moving economic balances.
  path:=ARRAY[]::uuid[];n:=b.allowance_id;
  WHILE n IS NOT NULL LOOP
   IF n=ANY(path) OR NOT(n=ANY(ids)) THEN RAISE EXCEPTION 'resource ancestry changed';END IF;path:=array_append(path,n);
   SELECT parent_allowance_id INTO n FROM fabric.budget_allowances WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=n;
  END LOOP;
  IF cardinality(path)<>cardinality(ids) THEN RAISE EXCEPTION 'resource ancestry changed';END IF;
  IF EXISTS(SELECT 1 FROM fabric.model_deficit_allowances d WHERE d.tenant_id=b.tenant_id AND d.space_id=b.space_id AND d.allowance_id=ANY(ids) AND NOT EXISTS(SELECT 1 FROM fabric.model_deficit_covers c WHERE (c.tenant_id,c.space_id,c.attempt_id)=(d.tenant_id,d.space_id,d.attempt_id))) OR EXISTS(SELECT 1 FROM fabric.model_deficit_accounts d WHERE d.tenant_id=b.tenant_id AND d.account_id=ANY(accounts) AND NOT EXISTS(SELECT 1 FROM fabric.model_deficit_covers c WHERE (c.tenant_id,c.space_id,c.attempt_id)=(d.tenant_id,d.space_id,d.attempt_id))) THEN RAISE EXCEPTION 'resource deficit' USING ERRCODE='P0003';END IF;
  IF EXISTS(SELECT 1 FROM fabric.model_accounts WHERE tenant_id=b.tenant_id AND account_id=ANY(accounts) AND (frozen OR reserved::numeric+settled::numeric+total>ceiling::numeric)) OR EXISTS(SELECT 1 FROM fabric.budget_allowances WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=ANY(ids) AND reserved::numeric+settled::numeric+total>ceiling::numeric) THEN RAISE EXCEPTION 'resource budget exhausted' USING ERRCODE='P0002';END IF;
  UPDATE fabric.model_accounts SET reserved=reserved+total::bigint,revision=revision+1 WHERE tenant_id=b.tenant_id AND account_id=ANY(accounts);
  UPDATE fabric.budget_allowances SET reserved=reserved+total::bigint,revision=revision+1 WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=ANY(ids);
  INSERT INTO fabric.budget_reservations(tenant_id,space_id,reservation_id,allowance_id,actor_id,run_id,idempotency_key,amount,state) VALUES(b.tenant_id,b.space_id,reservation_value,b.allowance_id,b.actor_id,b.anchor_run_id,'resource/'||(receipt->>'receiptId'),total::bigint,'active');
  FOREACH x IN ARRAY ids LOOP INSERT INTO fabric.model_reservation_allowances VALUES(b.tenant_id,b.space_id,reservation_value,x);END LOOP;
  FOREACH x IN ARRAY accounts LOOP INSERT INTO fabric.model_reservation_accounts VALUES(b.tenant_id,b.space_id,reservation_value,x);END LOOP;
  INSERT INTO fabric.model_category_reservations VALUES(b.tenant_id,b.space_id,reservation_value,cat_value,total::bigint);
 END IF;
 INSERT INTO fabric.model_resource_intervals VALUES(b.tenant_id,b.space_id,b.resource_id,(receipt->>'receiptId')::uuid,reservation_value,origin,cat_value,lo,hi,q.version,total::bigint,receipt);
 PERFORM fabric.model_resource_current(b.resource_id,false);RETURN reservation_value;
END $$;
CREATE FUNCTION fabric.model_resource_settle(receipt_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE i fabric.model_resource_intervals%ROWTYPE;r fabric.budget_reservations%ROWTYPE;b fabric.model_resource_bindings%ROWTYPE;
BEGIN
 SELECT * INTO i FROM fabric.model_resource_intervals WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND receipt_id=receipt_value;
 IF NOT FOUND THEN RAISE EXCEPTION 'resource receipt absent' USING ERRCODE='42501';END IF;
 b:=fabric.model_resource_current(i.resource_id,false);
 IF b.actor_id<>fabric.current_identity() OR NOT((fabric.controller_authority())->'grants' ? 'task:write') THEN RAISE EXCEPTION 'resource settle denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('resource/'||b.tenant_id::text||'/'||b.resource_id::text,0));
 SELECT * INTO r FROM fabric.budget_reservations WHERE tenant_id=i.tenant_id AND space_id=i.space_id AND reservation_id=i.reservation_id FOR UPDATE;
 IF r.state='settled' THEN RETURN r.reconciliation_receipt;END IF;
 PERFORM 1 FROM fabric.model_accounts WHERE tenant_id=i.tenant_id AND account_id IN(SELECT account_id FROM fabric.model_reservation_accounts WHERE tenant_id=i.tenant_id AND space_id=i.space_id AND reservation_id=i.reservation_id) ORDER BY account_id FOR UPDATE;
 PERFORM 1 FROM fabric.budget_allowances WHERE tenant_id=i.tenant_id AND space_id=i.space_id AND allowance_id IN(SELECT allowance_id FROM fabric.model_reservation_allowances WHERE tenant_id=i.tenant_id AND space_id=i.space_id AND reservation_id=i.reservation_id) ORDER BY allowance_id FOR UPDATE;
 UPDATE fabric.model_accounts SET reserved=reserved-i.amount,settled=settled+i.amount,revision=revision+1 WHERE tenant_id=i.tenant_id AND account_id IN(SELECT account_id FROM fabric.model_reservation_accounts WHERE tenant_id=i.tenant_id AND space_id=i.space_id AND reservation_id=i.reservation_id);
 UPDATE fabric.budget_allowances SET reserved=reserved-i.amount,settled=settled+i.amount,revision=revision+1 WHERE tenant_id=i.tenant_id AND space_id=i.space_id AND allowance_id IN(SELECT allowance_id FROM fabric.model_reservation_allowances WHERE tenant_id=i.tenant_id AND space_id=i.space_id AND reservation_id=i.reservation_id);
 INSERT INTO fabric.usage_settlements VALUES(i.tenant_id,i.space_id,i.receipt_id,i.reservation_id,'synthetic-resource/'||i.receipt_id::text,i.amount,i.record);
 UPDATE fabric.budget_reservations SET state='settled',settled_amount=i.amount,reconciliation_receipt=i.record WHERE tenant_id=i.tenant_id AND space_id=i.space_id AND reservation_id=i.reservation_id;
 PERFORM fabric.model_resource_current(i.resource_id,false);RETURN i.record;
END $$;
REVOKE ALL ON FUNCTION fabric.model_resource_current(uuid,boolean),fabric.model_resource_reserve(jsonb,uuid),fabric.model_resource_settle(uuid) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.model_resource_current(uuid,boolean),fabric.model_resource_reserve(jsonb,uuid),fabric.model_resource_settle(uuid) TO fabric_controller;
