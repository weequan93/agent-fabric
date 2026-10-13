-- Monotonic terminal outcome for preparation-only uploads. No publication,
-- save receipt or replay authority is created. The installed owner holds the
-- original-key and Space locks, checks current authority and reachability.
ALTER TABLE fabric.storage_staging_reservations ADD CONSTRAINT storage_staging_exact_original
 UNIQUE(tenant_id,space_id,actor_id,command_key,upload_id);
CREATE TABLE fabric.storage_staging_abandonments (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,
 command_key uuid NOT NULL,upload_id uuid NOT NULL,
 at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(at)),
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),
 UNIQUE(tenant_id,space_id,upload_id),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,upload_id)
 REFERENCES fabric.storage_staging_reservations(tenant_id,space_id,actor_id,command_key,upload_id)
);
ALTER TABLE fabric.storage_staging_abandonments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_staging_abandonments FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_staging_abandonments
 USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_staging_abandonments
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_staging_abandonments FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT,INSERT ON fabric.storage_staging_abandonments TO fabric_controller;
