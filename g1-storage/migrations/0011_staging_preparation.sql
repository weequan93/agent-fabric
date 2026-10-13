-- Authenticated byte preparation only. These records do not grant canonical
-- publication, command settlement or orphan deletion. Pending stays protected
-- until the content command owner installs a separately verified outcome.
CREATE TABLE fabric.storage_staging_reservations (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,
 command_key uuid NOT NULL,material_id uuid NOT NULL,upload_id uuid NOT NULL,root_id uuid NOT NULL,
 class text NOT NULL CHECK(class IN('source','knowledge','artifact','draft','live-file','checkpoint','summary','index','cache','ask','backup')),
 id uuid NOT NULL,revision fabric.safe_amount NOT NULL CHECK(revision>0),generation uuid NOT NULL,key_id uuid NOT NULL,
 session_id uuid NOT NULL,source_task_id uuid NOT NULL,expires_at timestamptz NOT NULL,lease_until timestamptz NOT NULL,
 at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),
 UNIQUE(tenant_id,space_id,upload_id),
 CHECK(isfinite(expires_at) AND isfinite(lease_until) AND isfinite(at) AND at<lease_until AND lease_until<=expires_at),
 FOREIGN KEY(tenant_id,space_id) REFERENCES fabric.storage_rooms,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES fabric.actors,
 FOREIGN KEY(tenant_id,space_id,session_id) REFERENCES fabric.model_sessions,
 FOREIGN KEY(tenant_id,space_id,source_task_id) REFERENCES fabric.tasks(tenant_id,space_id,task_id)
);
CREATE TABLE fabric.storage_staging_confirmations (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,upload_id uuid NOT NULL,
 object_digest text NOT NULL CHECK(object_digest ~ '^sha256:[0-9a-f]{64}$'),
 manifest_digest text NOT NULL CHECK(manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
 object_size fabric.safe_amount NOT NULL CHECK(object_size>0),manifest_size fabric.safe_amount NOT NULL CHECK(manifest_size>0),
 at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,space_id,upload_id),
 FOREIGN KEY(tenant_id,space_id,upload_id) REFERENCES fabric.storage_staging_reservations(tenant_id,space_id,upload_id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['storage_staging_reservations','storage_staging_confirmations'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY storage_control_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp',n);
  -- This is the trusted controller repository, as for installed native records.
  -- Content clients/workers cannot authenticate a controller transaction.
  EXECUTE format('GRANT SELECT,INSERT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
