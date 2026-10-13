-- Canonical acceptance is distinct from later editable live-file revisions.
CREATE TABLE fabric.storage_volume_promotions (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,id uuid NOT NULL,revision fabric.safe_amount NOT NULL,
 kind text NOT NULL DEFAULT 'live-file' CHECK(kind='live-file'),artifact_id uuid NOT NULL,
 actor_id uuid NOT NULL,command_key uuid NOT NULL,base_revision fabric.safe_amount NOT NULL CHECK(base_revision>0),
 draft_id uuid NOT NULL,draft_revision fabric.safe_amount NOT NULL CHECK(draft_revision>0),
 draft_kind text NOT NULL DEFAULT 'draft' CHECK(draft_kind='draft'),draft_artifact_id uuid NOT NULL,
 validation_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,id,revision),UNIQUE(tenant_id,space_id,artifact_id),UNIQUE(tenant_id,space_id,actor_id,command_key),
 CHECK(revision=base_revision+1),
 FOREIGN KEY(tenant_id,space_id,kind,id,revision,artifact_id) REFERENCES fabric.storage_volume_versions(tenant_id,space_id,kind,id,revision,artifact_id),
 FOREIGN KEY(tenant_id,space_id,kind,id,base_revision) REFERENCES fabric.storage_volume_versions(tenant_id,space_id,kind,id,revision),
 FOREIGN KEY(tenant_id,space_id,draft_kind,draft_id,draft_revision,draft_artifact_id) REFERENCES fabric.storage_volume_versions(tenant_id,space_id,kind,id,revision,artifact_id),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_volume_versions(tenant_id,space_id,actor_id,command_key)
);
ALTER TABLE fabric.storage_volume_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_volume_promotions FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_volume_promotions USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_volume_promotions FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_volume_promotions FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_volume_promotions TO fabric_controller;
CREATE FUNCTION fabric.storage_commit_promotion(k uuid,draft uuid,draft_rev numeric,expected numeric,validation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 v fabric.storage_volume_versions%ROWTYPE;d fabric.storage_volume_versions%ROWTYPE;b fabric.storage_volume_versions%ROWTYPE;x xid;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'promotion scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 SELECT * INTO v FROM fabric.storage_volume_versions WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 SELECT xmin INTO x FROM fabric.storage_artifact_versions WHERE tenant_id=t AND space_id=sp AND id=v.artifact_id;
 SELECT * INTO d FROM fabric.storage_volume_versions WHERE tenant_id=t AND space_id=sp AND kind='draft' AND id=draft AND revision=draft_rev;
 SELECT * INTO b FROM fabric.storage_volume_versions WHERE tenant_id=t AND space_id=sp AND kind='live-file' AND id=v.id AND revision=expected;
 IF x IS DISTINCT FROM (txid_current()%4294967296)::text::xid OR v.kind IS DISTINCT FROM 'live-file'
  OR v.revision IS DISTINCT FROM expected+1 OR d.base_revision IS DISTINCT FROM expected OR expected<=0
  OR validation IS NULL OR d.artifact_id IS NULL OR b.artifact_id IS NULL OR v.expires_at>least(d.expires_at,b.expires_at)
  OR least(v.expires_at,d.expires_at,b.expires_at)<=clock_timestamp() THEN
  RAISE EXCEPTION 'promotion binding denied' USING ERRCODE='23514';END IF;
 PERFORM fabric.model_current(v.run_id,NULL,false);
 INSERT INTO fabric.storage_volume_promotions VALUES(t,sp,v.id,v.revision,'live-file',v.artifact_id,a,k,expected,draft,draft_rev,'draft',d.artifact_id,validation);
 IF NOT EXISTS(SELECT 1 FROM fabric.storage_volume_promotions WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k AND artifact_id=v.artifact_id) THEN
  RAISE EXCEPTION 'promotion evidence missing' USING ERRCODE='23514';END IF;
END $$;
REVOKE ALL ON FUNCTION fabric.storage_commit_promotion(uuid,uuid,numeric,numeric,uuid) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_commit_promotion(uuid,uuid,numeric,numeric,uuid) TO fabric_controller;
