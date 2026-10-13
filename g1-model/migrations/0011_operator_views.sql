-- Forward scoped read function; accepted table grants remain unchanged.
CREATE FUNCTION fabric.model_operator_accounting(session_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE authority jsonb;b fabric.model_sessions%ROWTYPE;accounting jsonb;allowances jsonb;totals jsonb;
BEGIN
 authority:=fabric.controller_authority();
 SELECT * INTO b FROM fabric.model_sessions WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND session_id=session_value;
 IF NOT FOUND OR authority IS NULL OR NOT(authority->'grants' ? 'task:read') OR b.binding->>'payerId' IS DISTINCT FROM authority->>'payerId' OR authority->>'lifecycle'<>'active' OR (authority->>'actorRevoked')::boolean OR (authority->>'payerRevoked')::boolean OR (authority->>'membershipRevoked')::boolean THEN RAISE EXCEPTION 'operator view denied' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('attemptCount',count(*),'estimate',coalesce(sum(r.amount),0),'measured',coalesce(sum(x.measured),0),'settled',coalesce(sum(u.amount),0),'heldReserve',coalesce(sum(r.amount) FILTER(WHERE r.state IN('active','unknown')),0)) INTO accounting
 FROM fabric.model_operations o JOIN fabric.model_attempts a USING(tenant_id,space_id,operation_id)
 JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id)
 LEFT JOIN fabric.model_resolutions x USING(tenant_id,space_id,attempt_id)
 LEFT JOIN fabric.usage_settlements u USING(tenant_id,space_id,reservation_id)
 WHERE o.tenant_id=b.tenant_id AND o.space_id=b.space_id AND o.session_id=b.session_id;
 SELECT coalesce(jsonb_object_agg(category,amount),'{}') INTO totals FROM (
 SELECT c.category,sum(c.amount) AS amount FROM fabric.model_usage_categories c JOIN fabric.model_attempts a USING(tenant_id,space_id,attempt_id) JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id)
 WHERE o.tenant_id=b.tenant_id AND o.space_id=b.space_id AND o.session_id=b.session_id GROUP BY c.category) category_totals;
 accounting:=accounting||jsonb_build_object('categories',totals,'retryCount',(SELECT coalesce(sum(greatest(0,(record->>'attemptsTaken')::int-1)),0) FROM fabric.model_operations WHERE tenant_id=b.tenant_id AND space_id=b.space_id AND session_id=b.session_id));
 -- UNION deduplicates an accidentally cyclic path; no unbounded recursion.
 WITH RECURSIVE path AS (
 SELECT a.* FROM fabric.budget_allowances a JOIN fabric.model_billing_bindings v ON (a.tenant_id,a.space_id,a.allowance_id)=(v.tenant_id,v.space_id,v.leaf_allowance) WHERE v.run_id=b.run_id AND a.tenant_id=b.tenant_id AND a.space_id=b.space_id
 UNION SELECT a.* FROM fabric.budget_allowances a JOIN path p ON (a.tenant_id,a.space_id,a.allowance_id)=(p.tenant_id,p.space_id,p.parent_allowance_id))
 SELECT coalesce(jsonb_agg(jsonb_build_object('allowanceId',allowance_id,'revision',revision,'ceiling',ceiling,'reserved',reserved,'settled',settled,'remaining',ceiling-reserved-settled) ORDER BY allowance_id),'[]') INTO allowances FROM path;
 IF EXISTS(SELECT 1 FROM jsonb_each(accounting) a WHERE a.key<>'categories' AND a.value::text::numeric>9007199254740991) OR EXISTS(SELECT 1 FROM jsonb_each(totals) a WHERE a.value::text::numeric>9007199254740991) THEN RAISE EXCEPTION 'operator view overflow' USING ERRCODE='22003';END IF;
 RETURN jsonb_build_object('accounting',accounting,'allowances',allowances);
END $$;
REVOKE ALL ON FUNCTION fabric.model_operator_accounting(uuid) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.model_operator_accounting(uuid) TO fabric_controller;
