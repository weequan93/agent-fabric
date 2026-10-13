-- Forward repair for SEC-F04-001. Model1–11 installed bytes stay unchanged.
-- Installation authority stamps an immutable, unambiguous parent Run. Neither
-- model/client tags nor continuation/recovery requests select budget lineage.
-- Drain old admissions before examining legacy liabilities or replacing reserve.
-- Every old reserve reads billing first and retains its relation lock to COMMIT.
LOCK TABLE fabric.model_billing_bindings,fabric.budget_reservations,fabric.budget_allowances,fabric.model_accounts IN ACCESS EXCLUSIVE MODE;
CREATE UNIQUE INDEX model_task_run_allowance_identity ON fabric.model_allowance_metadata(tenant_id,space_id,kind,subject_id) WHERE kind IN('task','run');
CREATE TABLE fabric.model_budget_lineage (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,run_id uuid NOT NULL,parent_run_id uuid,
 PRIMARY KEY(tenant_id,space_id,run_id),
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.model_billing_bindings,
 FOREIGN KEY(tenant_id,space_id,parent_run_id) REFERENCES fabric.model_budget_lineage,
 CHECK(parent_run_id IS DISTINCT FROM run_id)
);
ALTER TABLE fabric.model_budget_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.model_budget_lineage FORCE ROW LEVEL SECURITY;
CREATE POLICY model_budget_scope ON fabric.model_budget_lineage USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
REVOKE ALL ON fabric.model_budget_lineage FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.model_budget_lineage TO fabric_controller;
CREATE TRIGGER model_budget_lineage_immutable BEFORE UPDATE OR DELETE ON fabric.model_budget_lineage FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();

CREATE FUNCTION fabric.model_capture_budget_lineage(t uuid,s uuid,r uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE b fabric.model_billing_bindings%ROWTYPE;p fabric.model_billing_bindings%ROWTYPE;parent_task uuid;parent_run uuid;
BEGIN
 SELECT * INTO b FROM fabric.model_billing_bindings WHERE tenant_id=t AND space_id=s AND run_id=r;
 IF NOT FOUND OR NOT(b.record ? 'parentTaskId') THEN RAISE EXCEPTION 'missing budget binding' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM fabric.runs r JOIN fabric.tasks x USING(tenant_id,space_id,task_id) WHERE r.tenant_id=t AND r.space_id=s AND r.run_id=b.run_id AND r.task_id=b.task_id AND x.actor_id=b.actor_id) THEN RAISE EXCEPTION 'Task/Run budget lineage mismatch' USING ERRCODE='42501';END IF;
 parent_task:=(b.record->>'parentTaskId')::uuid;
 IF parent_task IS NOT NULL THEN
  IF parent_task=b.task_id OR (SELECT count(*) FROM fabric.model_billing_bindings WHERE tenant_id=t AND space_id=s AND task_id=parent_task)<>1 THEN RAISE EXCEPTION 'missing or ambiguous parent Run' USING ERRCODE='42501';END IF;
  SELECT * INTO p FROM fabric.model_billing_bindings WHERE tenant_id=t AND space_id=s AND task_id=parent_task;
  IF p.payer_id<>b.payer_id OR p.department_id<>b.department_id OR NOT EXISTS(SELECT 1 FROM fabric.model_budget_lineage WHERE tenant_id=t AND space_id=s AND run_id=p.run_id) THEN RAISE EXCEPTION 'invalid parent budget lineage' USING ERRCODE='42501';END IF;
  parent_run:=p.run_id;
 END IF;
 INSERT INTO fabric.model_budget_lineage VALUES(t,s,r,parent_run);
END $$;
CREATE FUNCTION fabric.model_capture_budget_lineage_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
BEGIN PERFORM fabric.model_capture_budget_lineage(NEW.tenant_id,NEW.space_id,NEW.run_id);RETURN NEW;END $$;

-- Never retrofit old unaccounted child charges, reset balances, or rewrite an
-- original reservation's immutable membership to make an upgrade look safe.
-- An installation with those historical liabilities requires an explicit
-- reconciliation/remediation decision; this migration aborts in full.
DO $$ DECLARE installed_binding record;progress integer;
BEGIN
 IF EXISTS(SELECT 1 FROM fabric.model_billing_bindings b JOIN fabric.budget_reservations r USING(tenant_id,space_id,run_id) WHERE b.record->>'parentTaskId' IS NOT NULL) THEN RAISE EXCEPTION 'legacy child liabilities require explicit reconciliation' USING ERRCODE='42501';END IF;
 LOOP
  progress:=0;
  FOR installed_binding IN SELECT x.* FROM fabric.model_billing_bindings x WHERE NOT EXISTS(SELECT 1 FROM fabric.model_budget_lineage l WHERE (l.tenant_id,l.space_id,l.run_id)=(x.tenant_id,x.space_id,x.run_id)) AND (x.record->>'parentTaskId' IS NULL OR EXISTS(SELECT 1 FROM fabric.model_billing_bindings p JOIN fabric.model_budget_lineage l USING(tenant_id,space_id,run_id) WHERE p.tenant_id=x.tenant_id AND p.space_id=x.space_id AND p.task_id=(x.record->>'parentTaskId')::uuid)) ORDER BY x.run_id LOOP
   PERFORM fabric.model_capture_budget_lineage(installed_binding.tenant_id,installed_binding.space_id,installed_binding.run_id);progress:=progress+1;
  END LOOP;
  EXIT WHEN progress=0;
 END LOOP;
 IF (SELECT count(*) FROM fabric.model_budget_lineage)<>(SELECT count(*) FROM fabric.model_billing_bindings) THEN RAISE EXCEPTION 'unresolved parent budget lineage' USING ERRCODE='42501';END IF;
END $$;
CREATE TRIGGER model_capture_budget_lineage AFTER INSERT ON fabric.model_billing_bindings FOR EACH ROW EXECUTE FUNCTION fabric.model_capture_budget_lineage_trigger();

-- Resolve each trusted family's OWN Task/Run/Space chain, then take a set union.
-- Individual child ceilings supplement inherited ceilings; they never copy or
-- replace the family's budget. Shared ancestors count once per reservation.
CREATE FUNCTION fabric.model_budget_membership(run_value uuid) RETURNS TABLE(allowance_ids uuid[],account_ids uuid[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE root fabric.model_billing_bindings%ROWTYPE;b fabric.model_billing_bindings%ROWTYPE;p fabric.model_billing_bindings%ROWTYPE;
 a fabric.budget_allowances%ROWTYPE;m fabric.model_allowance_metadata%ROWTYPE;g fabric.model_accounts%ROWTYPE;
 family uuid[]:=ARRAY[]::uuid[];tasks uuid[]:=ARRAY[]::uuid[];ids uuid[]:=ARRAY[]::uuid[];accounts uuid[]:=ARRAY[]::uuid[];
 path uuid[];kinds text[];next_run uuid:=run_value;parent_run uuid;next_id uuid;row_id uuid;
BEGIN
 SELECT * INTO root FROM fabric.model_billing_bindings WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND run_id=run_value;
 IF NOT FOUND THEN RAISE EXCEPTION 'billing binding denied' USING ERRCODE='42501';END IF;
 WHILE next_run IS NOT NULL LOOP
  IF next_run=ANY(family) OR cardinality(family)>=64 THEN RAISE EXCEPTION 'invalid family ancestry' USING ERRCODE='42501';END IF;
  SELECT * INTO b FROM fabric.model_billing_bindings WHERE tenant_id=root.tenant_id AND space_id=root.space_id AND run_id=next_run;
  IF NOT FOUND OR b.task_id=ANY(tasks) OR b.payer_id<>root.payer_id OR b.department_id<>root.department_id THEN RAISE EXCEPTION 'invalid family binding' USING ERRCODE='42501';END IF;
  family:=array_append(family,next_run);tasks:=array_append(tasks,b.task_id);
  SELECT parent_run_id INTO parent_run FROM fabric.model_budget_lineage WHERE tenant_id=root.tenant_id AND space_id=root.space_id AND run_id=next_run;
  IF NOT FOUND OR NOT(b.record ? 'parentTaskId') THEN RAISE EXCEPTION 'missing family lineage' USING ERRCODE='42501';END IF;
  IF parent_run IS NULL THEN
   IF b.record->>'parentTaskId' IS NOT NULL THEN RAISE EXCEPTION 'parent lineage mismatch' USING ERRCODE='42501';END IF;
  ELSE
   SELECT * INTO p FROM fabric.model_billing_bindings WHERE tenant_id=root.tenant_id AND space_id=root.space_id AND run_id=parent_run;
   IF NOT FOUND OR p.task_id IS DISTINCT FROM (b.record->>'parentTaskId')::uuid THEN RAISE EXCEPTION 'parent lineage mismatch' USING ERRCODE='42501';END IF;
  END IF;
  path:=ARRAY[]::uuid[];kinds:=ARRAY[]::text[];next_id:=b.leaf_allowance;
  WHILE next_id IS NOT NULL LOOP
   IF next_id=ANY(path) OR cardinality(path)>=64 THEN RAISE EXCEPTION 'invalid allowance ancestry';END IF;path:=array_append(path,next_id);
   SELECT * INTO a FROM fabric.budget_allowances WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=next_id;
   SELECT * INTO m FROM fabric.model_allowance_metadata WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=next_id;
   IF a.allowance_id IS NULL OR m.allowance_id IS NULL OR a.payer_actor_id<>b.payer_id OR a.currency<>'synthetic-utf8-byte-unit' OR m.subject_id IS DISTINCT FROM (CASE m.kind WHEN 'tenant' THEN b.tenant_id WHEN 'department' THEN b.department_id WHEN 'person' THEN b.actor_id WHEN 'space' THEN b.space_id WHEN 'task' THEN b.task_id WHEN 'run' THEN b.run_id END) THEN RAISE EXCEPTION 'invalid allowance binding' USING ERRCODE='42501';END IF;
   IF NOT(next_id=ANY(ids)) THEN
    IF cardinality(ids)>=64 THEN RAISE EXCEPTION 'family allowance bound exceeded';END IF;
    ids:=array_append(ids,next_id);
   END IF;
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
  next_run:=parent_run;
 END LOOP;
 RETURN QUERY SELECT ARRAY(SELECT unnest(ids) ORDER BY 1),ARRAY(SELECT unnest(accounts) ORDER BY 1);
END $$;

CREATE OR REPLACE FUNCTION fabric.model_reserve(run_value uuid,reservation_value uuid,key_value text,categories jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE b fabric.model_billing_bindings%ROWTYPE;
 ids uuid[];accounts uuid[];locked_ids uuid[];locked_accounts uuid[];x uuid;total numeric:=0;entry record;
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
 SELECT allowance_ids,account_ids INTO ids,accounts FROM fabric.model_budget_membership(run_value);
 PERFORM 1 FROM fabric.model_accounts WHERE tenant_id=b.tenant_id AND account_id=ANY(accounts) ORDER BY account_id FOR UPDATE;
 PERFORM 1 FROM fabric.budget_allowances WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=ANY(ids) ORDER BY allowance_id FOR UPDATE;
 PERFORM fabric.model_current(run_value,NULL,false);
 SELECT allowance_ids,account_ids INTO locked_ids,locked_accounts FROM fabric.model_budget_membership(run_value);
 IF ids IS DISTINCT FROM locked_ids OR accounts IS DISTINCT FROM locked_accounts THEN RAISE EXCEPTION 'family membership changed after lock' USING ERRCODE='42501';END IF;
 -- Covers inherited parent-only deficits too; original leaf-only trigger stays.
 IF to_regclass('fabric.model_deficit_allowances') IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM fabric.model_deficit_allowances d WHERE d.tenant_id=b.tenant_id AND d.space_id=b.space_id AND d.allowance_id=ANY(ids) AND NOT EXISTS(SELECT 1 FROM fabric.model_deficit_covers c WHERE (c.tenant_id,c.space_id,c.attempt_id)=(d.tenant_id,d.space_id,d.attempt_id))) OR EXISTS(SELECT 1 FROM fabric.model_deficit_accounts d WHERE d.tenant_id=b.tenant_id AND d.account_id=ANY(accounts) AND NOT EXISTS(SELECT 1 FROM fabric.model_deficit_covers c WHERE (c.tenant_id,c.space_id,c.attempt_id)=(d.tenant_id,d.space_id,d.attempt_id))) THEN RAISE EXCEPTION 'uncovered family deficit' USING ERRCODE='P0003';END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM fabric.model_accounts WHERE tenant_id=b.tenant_id AND account_id=ANY(accounts) AND (frozen OR reserved::numeric+settled::numeric+total>ceiling::numeric)) OR EXISTS(SELECT 1 FROM fabric.budget_allowances WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=ANY(ids) AND reserved::numeric+settled::numeric+total>ceiling::numeric) THEN RAISE EXCEPTION 'budget exhausted' USING ERRCODE='P0002';END IF;
 UPDATE fabric.model_accounts SET reserved=reserved+total::bigint,revision=revision+1 WHERE tenant_id=b.tenant_id AND account_id=ANY(accounts);
 UPDATE fabric.budget_allowances SET reserved=reserved+total::bigint,revision=revision+1 WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND allowance_id=ANY(ids);
 INSERT INTO fabric.budget_reservations(tenant_id,space_id,reservation_id,allowance_id,actor_id,run_id,idempotency_key,amount,state) VALUES(b.tenant_id,b.space_id,reservation_value,b.leaf_allowance,b.actor_id,b.run_id,key_value,total::bigint,'active');
 FOREACH x IN ARRAY ids LOOP INSERT INTO fabric.model_reservation_allowances VALUES(b.tenant_id,b.space_id,reservation_value,x);END LOOP;
 FOREACH x IN ARRAY accounts LOOP INSERT INTO fabric.model_reservation_accounts VALUES(b.tenant_id,b.space_id,reservation_value,x);END LOOP;
 FOR entry IN SELECT * FROM jsonb_each(categories) LOOP INSERT INTO fabric.model_category_reservations VALUES(b.tenant_id,b.space_id,reservation_value,entry.key,(entry.value::text)::bigint);END LOOP;
 RETURN b.leaf_allowance;
END $$;

REVOKE ALL ON FUNCTION fabric.model_capture_budget_lineage(uuid,uuid,uuid),fabric.model_capture_budget_lineage_trigger(),fabric.model_budget_membership(uuid) FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
REVOKE ALL ON FUNCTION fabric.model_reserve(uuid,uuid,text,jsonb) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.model_reserve(uuid,uuid,text,jsonb) TO fabric_controller;

-- Operator views must show the inherited ceilings which can refuse admission.
CREATE FUNCTION fabric.model_family_allowances(run_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE authority jsonb;b fabric.model_billing_bindings%ROWTYPE;ids uuid[];result jsonb;
BEGIN
 authority:=fabric.controller_authority();
 SELECT * INTO b FROM fabric.model_billing_bindings WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND run_id=run_value;
 IF NOT FOUND OR authority IS NULL OR NOT(authority->'grants' ? 'task:read') OR b.payer_id::text IS DISTINCT FROM authority->>'payerId' OR authority->>'lifecycle'<>'active' OR (authority->>'actorRevoked')::boolean OR (authority->>'payerRevoked')::boolean OR (authority->>'membershipRevoked')::boolean THEN RAISE EXCEPTION 'family allowance view denied' USING ERRCODE='42501';END IF;
 SELECT allowance_ids INTO ids FROM fabric.model_budget_membership(run_value);
 SELECT coalesce(jsonb_agg(jsonb_build_object('allowanceId',a.allowance_id,'revision',a.revision,'ceiling',a.ceiling,'reserved',a.reserved,'settled',a.settled,'remaining',a.ceiling-a.reserved-a.settled) ORDER BY a.allowance_id),'[]') INTO result FROM fabric.budget_allowances a WHERE a.tenant_id=b.tenant_id AND a.space_id=b.space_id AND a.allowance_id=ANY(ids);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION fabric.model_family_allowances(uuid) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.model_family_allowances(uuid) TO fabric_controller;
