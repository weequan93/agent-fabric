-- Forward correction: fixed scoped view keeps accepted base table grants unchanged.
CREATE FUNCTION fabric.model_exposure() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();s uuid:=fabric.current_space();act uuid:=fabric.current_identity();authority jsonb;reserved numeric;pending numeric;actual numeric;deficit numeric;conform boolean;
BEGIN
 authority:=fabric.controller_authority();
 IF authority IS NULL OR authority->>'lifecycle'<>'active' OR (authority->>'actorRevoked')::boolean OR (authority->>'payerRevoked')::boolean OR (authority->>'membershipRevoked')::boolean OR NOT(authority->'grants' ? 'task:read') THEN RAISE EXCEPTION 'exposure denied' USING ERRCODE='42501';END IF;
 SELECT coalesce(sum(r.amount),0),count(*) FILTER(WHERE a.record->>'claimId' IS NOT NULL)*5 INTO reserved,pending FROM fabric.model_attempts a JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id) WHERE a.tenant_id=t AND a.space_id=s AND r.actor_id=act AND r.state IN('active','unknown');
 SELECT coalesce(sum(x.measured),0),coalesce(bool_and(x.conformance),true) INTO actual,conform FROM fabric.model_resolutions x JOIN fabric.model_attempts a USING(tenant_id,space_id,attempt_id) JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE x.tenant_id=t AND x.space_id=s AND o.actor_id=act;
 SELECT coalesce(sum(d.amount),0) INTO deficit FROM fabric.model_deficits d JOIN fabric.model_attempts a USING(tenant_id,space_id,attempt_id) JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE d.tenant_id=t AND d.space_id=s AND o.actor_id=act AND NOT EXISTS(SELECT 1 FROM fabric.model_deficit_covers c WHERE (c.tenant_id,c.space_id,c.attempt_id)=(d.tenant_id,d.space_id,d.attempt_id));
 IF reserved+pending>9007199254740991 OR actual>9007199254740991 OR deficit>9007199254740991 THEN RAISE EXCEPTION 'view overflow' USING ERRCODE='22003';END IF;
 RETURN jsonb_build_object('reserved',reserved,'pendingExposure',pending,'maximumLocalExposure',reserved+pending,'economicActual',actual,'uncoveredDeficit',deficit,'conformance',conform);
END $$;
REVOKE ALL ON FUNCTION fabric.model_exposure() FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.model_exposure() TO fabric_controller;
