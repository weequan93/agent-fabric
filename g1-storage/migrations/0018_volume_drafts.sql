-- Additive logical adapters over immutable confirmed artifact bytes. Descriptive
-- paths, draft bodies and checkpoint digest inventories stay in ciphertext.
ALTER TABLE fabric.storage_artifact_versions ADD UNIQUE(tenant_id,space_id,actor_id,command_key,id,epoch,accepted_at);
ALTER TABLE fabric.storage_artifact_versions ADD UNIQUE(tenant_id,space_id,id,witness);
CREATE TABLE fabric.storage_volume_versions (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('live-file','draft','checkpoint')),
 id uuid NOT NULL,revision fabric.safe_amount NOT NULL CHECK(revision>0),artifact_id uuid NOT NULL,
 actor_id uuid NOT NULL,command_key uuid NOT NULL,session_id uuid NOT NULL,
 task_id uuid NOT NULL,run_id uuid NOT NULL,worker_generation fabric.safe_amount NOT NULL,
 base_revision fabric.safe_amount NOT NULL,checkpoint_file_count fabric.safe_amount NOT NULL CHECK(checkpoint_file_count<=1024),
 index_witness text NOT NULL CHECK(index_witness ~ '^sha256:[0-9a-f]{64}$'),epoch fabric.safe_amount NOT NULL,
 confirmed_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,space_id,kind,id,revision),
 UNIQUE(tenant_id,space_id,artifact_id),UNIQUE(tenant_id,space_id,actor_id,command_key),
 UNIQUE(tenant_id,space_id,kind,id,revision,artifact_id),
 CHECK(kind='draft' OR base_revision=0),CHECK(kind='checkpoint' OR checkpoint_file_count=0),
 CHECK(isfinite(confirmed_at) AND isfinite(expires_at) AND expires_at>confirmed_at),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,artifact_id,epoch,confirmed_at)
 REFERENCES fabric.storage_artifact_versions(tenant_id,space_id,actor_id,command_key,id,epoch,accepted_at),
 FOREIGN KEY(tenant_id,space_id,session_id) REFERENCES fabric.model_sessions(tenant_id,space_id,session_id)
);
CREATE TABLE fabric.storage_checkpoint_files (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,checkpoint_id uuid NOT NULL,checkpoint_revision fabric.safe_amount NOT NULL,
 kind text NOT NULL DEFAULT 'checkpoint' CHECK(kind='checkpoint'),
 live_id uuid NOT NULL,live_revision fabric.safe_amount NOT NULL,artifact_id uuid NOT NULL,witness text NOT NULL,
 live_kind text NOT NULL DEFAULT 'live-file' CHECK(live_kind='live-file'),
 PRIMARY KEY(tenant_id,space_id,checkpoint_id,checkpoint_revision,live_id),
 FOREIGN KEY(tenant_id,space_id,kind,checkpoint_id,checkpoint_revision)
 REFERENCES fabric.storage_volume_versions(tenant_id,space_id,kind,id,revision),
 FOREIGN KEY(tenant_id,space_id,live_kind,live_id,live_revision,artifact_id)
 REFERENCES fabric.storage_volume_versions(tenant_id,space_id,kind,id,revision,artifact_id),
 FOREIGN KEY(tenant_id,space_id,artifact_id,witness)
 REFERENCES fabric.storage_artifact_versions(tenant_id,space_id,id,witness)
);
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['storage_volume_versions','storage_checkpoint_files'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY storage_control_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
CREATE FUNCTION fabric.storage_commit_volume(k uuid,kind_arg text,target uuid,expected numeric,base numeric,files jsonb,index_mac text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 v fabric.storage_artifact_versions%ROWTYPE;n fabric.model_sessions%ROWTYPE;prior numeric;f jsonb;l fabric.storage_volume_versions%ROWTYPE;
 artifact_xid xid;authority jsonb;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'volume scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 SELECT * INTO v FROM fabric.storage_artifact_versions WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 SELECT xmin INTO artifact_xid FROM fabric.storage_artifact_versions WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 authority:=fabric.controller_authority();
 IF artifact_xid IS DISTINCT FROM (txid_current()%4294967296)::text::xid OR v.expires_at<=clock_timestamp()
  OR kind_arg NOT IN('live-file','draft','checkpoint') OR expected<0 OR base<0
  OR authority IS NULL OR NOT(authority->'grants' ?& ARRAY['storage:write','storage:maintenance','task:write']) THEN
  RAISE EXCEPTION 'volume admission denied' USING ERRCODE='23514';END IF;
 SELECT s.* INTO n FROM fabric.model_sessions s JOIN fabric.storage_epoch_publications p
  ON (p.tenant_id,p.space_id,p.session_id)=(s.tenant_id,s.space_id,s.session_id)
  WHERE p.tenant_id=t AND p.space_id=sp AND p.actor_id=a AND p.command_key=k;
 IF n.binding->>'actorId' IS DISTINCT FROM a::text OR n.binding->>'purpose' IS DISTINCT FROM 'maintenance'
  OR n.task_id IS DISTINCT FROM v.source_task_id THEN RAISE EXCEPTION 'volume native denied' USING ERRCODE='23514';END IF;
 SELECT coalesce(max(revision),0) INTO prior FROM fabric.storage_volume_versions WHERE tenant_id=t AND space_id=sp AND kind=kind_arg AND id=target;
 IF prior IS DISTINCT FROM expected THEN RAISE EXCEPTION 'volume stale revision' USING ERRCODE='40001';END IF;
 INSERT INTO fabric.storage_volume_versions VALUES(t,sp,kind_arg,target,expected+1,v.id,a,k,n.session_id,n.task_id,n.run_id,
  (n.binding->>'workerGeneration')::numeric,base,jsonb_array_length(files),index_mac,v.epoch,v.accepted_at,v.expires_at);
 IF NOT EXISTS(SELECT 1 FROM fabric.storage_volume_versions WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k AND artifact_id=v.id) THEN RAISE EXCEPTION 'volume index missing' USING ERRCODE='23514';END IF;
 IF jsonb_typeof(files) IS DISTINCT FROM 'array' OR jsonb_array_length(files)>1024
  OR (kind_arg<>'checkpoint' AND jsonb_array_length(files)<>0) THEN RAISE EXCEPTION 'volume inventory denied' USING ERRCODE='23514';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(files) LOOP
  SELECT * INTO l FROM fabric.storage_volume_versions WHERE tenant_id=t AND space_id=sp AND kind='live-file' AND id=(f->>'id')::uuid AND revision=(f->>'revision')::numeric;
  IF NOT FOUND OR l.artifact_id IS DISTINCT FROM (f->>'artifactId')::uuid OR l.expires_at<=clock_timestamp() OR v.expires_at>l.expires_at
   OR NOT EXISTS(SELECT 1 FROM fabric.storage_artifact_versions x WHERE x.tenant_id=t AND x.space_id=sp AND x.id=l.artifact_id AND x.witness=f->>'witness') THEN
   RAISE EXCEPTION 'checkpoint entry denied' USING ERRCODE='23514';END IF;
  INSERT INTO fabric.storage_checkpoint_files VALUES(t,sp,target,expected+1,'checkpoint',l.id,l.revision,l.artifact_id,f->>'witness','live-file');
 END LOOP;
 IF (SELECT count(*) FROM fabric.storage_checkpoint_files WHERE tenant_id=t AND space_id=sp AND checkpoint_id=target AND checkpoint_revision=expected+1)<>jsonb_array_length(files) THEN RAISE EXCEPTION 'checkpoint incomplete' USING ERRCODE='23514';END IF;
END $$;
REVOKE ALL ON FUNCTION fabric.storage_commit_volume(uuid,text,uuid,numeric,numeric,jsonb,text) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_commit_volume(uuid,text,uuid,numeric,numeric,jsonb,text) TO fabric_controller;

-- The opaque deterministic volume artifact namespace is reserved for this owner.
-- Deferred evidence includes logical row and exact included count at COMMIT,
-- independently of INSERT row counts and the returned application callback.
CREATE FUNCTION fabric.storage_require_volume_index() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE h text;expected_id uuid;v fabric.storage_volume_versions%ROWTYPE;
BEGIN
 h:=encode(sha256(convert_to('["storage-volume-artifact-v1","'||NEW.tenant_id::text||'","'||NEW.space_id::text||'","'||NEW.actor_id::text||'","'||NEW.command_key::text||'"]','UTF8')),'hex');
 expected_id:=(substr(h,1,8)||'-'||substr(h,9,4)||'-'||substr(h,13,4)||'-'||substr(h,17,4)||'-'||substr(h,21,12))::uuid;
 IF NEW.id=expected_id THEN
  SELECT * INTO v FROM fabric.storage_volume_versions WHERE tenant_id=NEW.tenant_id AND space_id=NEW.space_id AND artifact_id=NEW.id;
  IF NOT FOUND OR ROW(v.actor_id,v.command_key,v.epoch,v.confirmed_at,v.expires_at) IS DISTINCT FROM ROW(NEW.actor_id,NEW.command_key,NEW.epoch,NEW.accepted_at,NEW.expires_at)
   OR (SELECT count(*) FROM fabric.storage_checkpoint_files WHERE tenant_id=v.tenant_id AND space_id=v.space_id AND checkpoint_id=v.id AND checkpoint_revision=v.revision)<>v.checkpoint_file_count THEN
   RAISE EXCEPTION 'volume evidence incomplete' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION fabric.storage_require_volume_index() FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
CREATE CONSTRAINT TRIGGER storage_required_volume_index AFTER INSERT ON fabric.storage_artifact_versions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fabric.storage_require_volume_index();
