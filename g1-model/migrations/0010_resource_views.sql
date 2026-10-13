-- Scoped projection; no direct native-table grants or prior migration edits.
CREATE FUNCTION fabric.model_resource_costs(resource_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE b fabric.model_resource_bindings%ROWTYPE;result jsonb;
BEGIN
 b:=fabric.model_resource_current(resource_value,false);
 SELECT coalesce(jsonb_agg(jsonb_build_object('receipt',i.record,'settled',r.state='settled') ORDER BY i.start_tick,i.receipt_id),'[]'::jsonb) INTO result
 FROM fabric.model_resource_intervals i JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id)
 WHERE i.tenant_id=b.tenant_id AND i.space_id=b.space_id AND i.resource_id=b.resource_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION fabric.model_resource_costs(uuid) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.model_resource_costs(uuid) TO fabric_controller;
