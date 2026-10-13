-- Fixed scoped views preserve the accepted ledger's no-direct-table grants.
CREATE FUNCTION fabric.model_native_costs(session_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE a jsonb;b fabric.model_sessions%ROWTYPE;reserved numeric;actual numeric;pending numeric;
BEGIN
 a:=fabric.controller_authority();
 SELECT * INTO b FROM fabric.model_sessions WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND session_id=session_value;
 IF NOT FOUND OR a IS NULL OR NOT(a->'grants' ? 'task:read') OR b.binding->>'payerId' IS DISTINCT FROM a->>'payerId' OR a->>'lifecycle'<>'active' OR (a->>'actorRevoked')::boolean OR (a->>'payerRevoked')::boolean OR (a->>'membershipRevoked')::boolean THEN RAISE EXCEPTION 'native view denied' USING ERRCODE='42501';END IF;
 SELECT coalesce(sum(CASE WHEN r.state IN('active','unknown') THEN r.amount ELSE 0 END),0),coalesce(sum(CASE WHEN x.kind='settled' THEN x.measured ELSE 0 END),0),coalesce(sum(CASE WHEN r.state IN('active','unknown') AND t.record->>'status'<>'prepared' THEN 5 ELSE 0 END),0)
 INTO reserved,actual,pending
 FROM fabric.model_operations o JOIN fabric.model_attempts t USING(tenant_id,space_id,operation_id) JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id) LEFT JOIN fabric.model_resolutions x USING(tenant_id,space_id,attempt_id)
 WHERE o.tenant_id=b.tenant_id AND o.space_id=b.space_id AND o.session_id=b.session_id;
 IF reserved+pending>9007199254740991 OR actual>9007199254740991 THEN RAISE EXCEPTION 'native view overflow' USING ERRCODE='22003';END IF;
 RETURN jsonb_build_object('reserved',reserved,'actual',actual,'pendingExposure',pending);
END $$;
CREATE FUNCTION fabric.model_native_top_up(allowance_value uuid,added bigint,expected bigint) RETURNS fabric.safe_amount
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE actual bigint;a jsonb;
BEGIN
 a:=fabric.controller_authority();
 IF a IS NULL OR NOT(a->'grants' ? 'budget:control') OR (a->>'payerRevoked')::boolean OR (a->>'membershipRevoked')::boolean THEN RAISE EXCEPTION 'native control denied' USING ERRCODE='42501';END IF;
 SELECT revision INTO actual FROM fabric.budget_allowances WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND allowance_id=allowance_value FOR UPDATE;
 IF actual IS NULL OR actual<>expected THEN RAISE EXCEPTION 'native allowance revision changed' USING ERRCODE='P0004';END IF;
 RETURN fabric.model_top_up(allowance_value,added);
END $$;
REVOKE ALL ON FUNCTION fabric.model_native_costs(uuid),fabric.model_native_top_up(uuid,bigint,bigint) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.model_native_costs(uuid),fabric.model_native_top_up(uuid,bigint,bigint) TO fabric_controller;
