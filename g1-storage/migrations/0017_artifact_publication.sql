ALTER TABLE fabric.storage_sources ADD UNIQUE(tenant_id,space_id,source_id,revision,witness);
ALTER TABLE fabric.storage_staging_confirmations ADD UNIQUE(tenant_id,space_id,upload_id,object_digest,manifest_digest,object_size,manifest_size);
-- Additive v17. Byte-first artifact publication; no destructive down migration.
CREATE TABLE fabric.storage_artifact_versions (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,class text NOT NULL DEFAULT 'artifact' CHECK(class='artifact'),
 id uuid NOT NULL,revision fabric.safe_amount NOT NULL CHECK(revision>0),source_task_id uuid NOT NULL,
 witness text NOT NULL,key_id uuid NOT NULL,generation uuid NOT NULL,epoch fabric.safe_amount NOT NULL,
 accepted_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 root_id uuid NOT NULL,upload_id uuid NOT NULL,object_id uuid NOT NULL,manifest_object_id uuid NOT NULL,
 object_digest text NOT NULL,manifest_digest text NOT NULL,object_size fabric.safe_amount NOT NULL,manifest_size fabric.safe_amount NOT NULL,
 source_id uuid,source_revision fabric.safe_amount,source_witness text,
 PRIMARY KEY(tenant_id,space_id,id,revision),
 UNIQUE(tenant_id,space_id,actor_id,command_key,id,revision,epoch,accepted_at),
 UNIQUE(tenant_id,space_id,upload_id),
 CHECK(isfinite(accepted_at) AND isfinite(expires_at) AND expires_at>accepted_at),
 CHECK((source_id IS NULL AND source_revision IS NULL AND source_witness IS NULL)
  OR (source_id IS NOT NULL AND source_revision IS NOT NULL AND source_witness IS NOT NULL)),
 FOREIGN KEY(tenant_id,space_id,class,id,revision,source_task_id)
 REFERENCES fabric.storage_entities(tenant_id,space_id,class,id,revision,source_task_id),
 FOREIGN KEY(tenant_id,space_id,class,id,revision,witness,key_id,generation,epoch,accepted_at,expires_at)
 REFERENCES fabric.storage_current_heads(tenant_id,space_id,class,id,revision,witness,key_id,generation,epoch,accepted_at,expires_at),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_head_publications,
 FOREIGN KEY(tenant_id,space_id,source_id,source_revision,source_witness) REFERENCES fabric.storage_sources(tenant_id,space_id,source_id,revision,witness),
 FOREIGN KEY(tenant_id,space_id,upload_id,object_digest,manifest_digest,object_size,manifest_size)
 REFERENCES fabric.storage_staging_confirmations(tenant_id,space_id,upload_id,object_digest,manifest_digest,object_size,manifest_size)
);
CREATE TABLE fabric.storage_artifact_events (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,event_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 mutation_id uuid NOT NULL,job_id uuid NOT NULL,target_id uuid NOT NULL,revision fabric.safe_amount NOT NULL,
 epoch fabric.safe_amount NOT NULL,at timestamptz NOT NULL,kind text NOT NULL CHECK(kind='artifact-committed'),
 PRIMARY KEY(tenant_id,space_id,event_id),
 UNIQUE(tenant_id,space_id,event_id,actor_id,command_key,job_id,target_id,revision,epoch,at),
 UNIQUE(tenant_id,space_id,actor_id,command_key),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,target_id,revision,epoch,at)
 REFERENCES fabric.storage_artifact_versions(tenant_id,space_id,actor_id,command_key,id,revision,epoch,accepted_at)
);
CREATE TABLE fabric.storage_artifact_receipts (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 binding_digest text NOT NULL,receipt_id uuid NOT NULL,job_id uuid NOT NULL,event_id uuid NOT NULL,
 id uuid NOT NULL,revision fabric.safe_amount NOT NULL,epoch fabric.safe_amount NOT NULL,at timestamptz NOT NULL,
 status text NOT NULL CHECK(status='artifact-committed'),class text NOT NULL DEFAULT 'artifact' CHECK(class='artifact'),
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),
 UNIQUE(tenant_id,space_id,actor_id,command_key,id,revision,epoch,at),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,binding_digest,receipt_id,epoch,at)
 REFERENCES fabric.storage_commands(tenant_id,space_id,actor_id,command_key,binding_digest,receipt_id,epoch,at),
 FOREIGN KEY(tenant_id,space_id,job_id,actor_id,command_key,class,id,revision,epoch,at)
 REFERENCES fabric.storage_outbox(tenant_id,space_id,job_id,actor_id,command_key,class,target_id,target_revision,epoch,at),
 FOREIGN KEY(tenant_id,space_id,event_id,actor_id,command_key,job_id,id,revision,epoch,at)
 REFERENCES fabric.storage_artifact_events(tenant_id,space_id,event_id,actor_id,command_key,job_id,target_id,revision,epoch,at),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,id,revision,epoch,at)
 REFERENCES fabric.storage_artifact_versions(tenant_id,space_id,actor_id,command_key,id,revision,epoch,accepted_at)
);
-- Every canonical knowledge row requires a receipt, event and exact outbox at
-- COMMIT. The deferred reverse FK closes the partial-publication path.
ALTER TABLE fabric.storage_artifact_versions ADD FOREIGN KEY(tenant_id,space_id,actor_id,command_key,id,revision,epoch,accepted_at)
 REFERENCES fabric.storage_artifact_receipts(tenant_id,space_id,actor_id,command_key,id,revision,epoch,at) DEFERRABLE INITIALLY DEFERRED;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['storage_artifact_versions','storage_artifact_receipts','storage_artifact_events'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY storage_control_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
CREATE FUNCTION fabric.storage_commit_artifact(k uuid,upload uuid,object_id uuid,manifest_id uuid,
 source uuid,source_rev numeric,source_w text,receipt uuid,job uuid,event uuid,mutation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 p fabric.storage_head_publications%ROWTYPE;r fabric.storage_staging_reservations%ROWTYPE;
 c fabric.storage_staging_confirmations%ROWTYPE;sh fabric.storage_sources%ROWTYPE;publication_xid xid;authority jsonb;expected_w text;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'artifact scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["storage-epoch-original","%s","%s","%s","%s"]',t,sp,a,k),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["storage-staging-original","%s","%s","%s","%s"]',t,sp,a,k),0));
 SELECT xmin INTO publication_xid FROM fabric.storage_head_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 IF publication_xid IS DISTINCT FROM (txid_current()%4294967296)::text::xid THEN
  RAISE EXCEPTION 'artifact must share original transaction' USING ERRCODE='23514';END IF;
 SELECT * INTO p FROM fabric.storage_head_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 SELECT * INTO r FROM fabric.storage_staging_reservations WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 SELECT * INTO c FROM fabric.storage_staging_confirmations WHERE tenant_id=t AND space_id=sp AND upload_id=upload;
 authority:=fabric.controller_authority();
 expected_w:='sha256:'||encode(sha256(convert_to('{"schemaVersion":1,"objectDigest":"'||c.object_digest||'","manifestDigest":"'||c.manifest_digest||'","objectSize":'||c.object_size::text||',"manifestSize":'||c.manifest_size::text||'}','UTF8')),'hex');
 IF p.class IS DISTINCT FROM 'artifact' OR p.revision IS DISTINCT FROM 1 OR p.expected_revision IS NOT NULL
  OR p.expires_at<=clock_timestamp() OR authority IS NULL OR NOT(authority->'grants' ?& ARRAY['storage:write','storage:maintenance','task:write'])
  OR r.upload_id IS DISTINCT FROM upload OR c.upload_id IS DISTINCT FROM upload OR object_id IS DISTINCT FROM p.material_id
  OR ROW(r.class,r.id,r.revision,r.generation,r.key_id,r.material_id,r.session_id,r.source_task_id)
   IS DISTINCT FROM ROW(p.class,p.id,p.revision,p.generation,p.key_id,p.material_id,
    (SELECT session_id FROM fabric.storage_epoch_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k),p.source_task_id)
  OR r.lease_until<=clock_timestamp() OR r.expires_at<=clock_timestamp() OR p.witness IS DISTINCT FROM expected_w
  OR EXISTS(SELECT 1 FROM fabric.storage_staging_abandonments WHERE tenant_id=t AND space_id=sp AND upload_id=upload)
  OR NOT EXISTS(SELECT 1 FROM fabric.storage_epoch_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k AND expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'artifact original denied' USING ERRCODE='23514';END IF;
 IF source IS NOT NULL THEN
  SELECT * INTO sh FROM fabric.storage_sources WHERE tenant_id=t AND space_id=sp AND source_id=source AND revision=source_rev;
  IF NOT FOUND OR sh.witness IS DISTINCT FROM source_w OR sh.expires_at<=clock_timestamp() OR p.expires_at>sh.expires_at
   OR EXISTS(SELECT 1 FROM fabric.storage_current_heads h WHERE (h.tenant_id,h.space_id,h.class,h.id)=(t,sp,'source',source) AND h.revision>source_rev)
   OR EXISTS(SELECT 1 FROM fabric.storage_tombstones d WHERE (d.tenant_id,d.space_id,d.class,d.id)=(t,sp,'source',source) AND d.revision>=source_rev)
   OR EXISTS(SELECT 1 FROM fabric.storage_restrictions x WHERE (x.tenant_id,x.space_id,x.source_id,x.source_revision)=(t,sp,source,source_rev)) THEN
   RAISE EXCEPTION 'artifact source denied' USING ERRCODE='23514';END IF;
 END IF;
 INSERT INTO fabric.storage_artifact_versions VALUES(t,sp,'artifact',p.id,p.revision,p.source_task_id,p.witness,p.key_id,p.generation,p.epoch,p.accepted_at,p.expires_at,a,k,
  r.root_id,upload,object_id,manifest_id,c.object_digest,c.manifest_digest,c.object_size,c.manifest_size,source,source_rev,source_w);
 INSERT INTO fabric.storage_commands VALUES(t,sp,a,k,(SELECT binding_digest FROM fabric.storage_epoch_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k),receipt,p.epoch,p.accepted_at);
 INSERT INTO fabric.storage_outbox VALUES(t,sp,job,a,k,'artifact',p.id,p.revision,p.epoch,p.accepted_at);
 INSERT INTO fabric.storage_artifact_events VALUES(t,sp,event,a,k,mutation,job,p.id,p.revision,p.epoch,p.accepted_at,'artifact-committed');
 INSERT INTO fabric.storage_artifact_receipts VALUES(t,sp,a,k,(SELECT binding_digest FROM fabric.storage_commands WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k),receipt,job,event,p.id,p.revision,p.epoch,p.accepted_at,'artifact-committed','artifact');
END $$;
REVOKE ALL ON FUNCTION fabric.storage_commit_artifact(uuid,uuid,uuid,uuid,uuid,numeric,text,uuid,uuid,uuid,uuid) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_commit_artifact(uuid,uuid,uuid,uuid,uuid,numeric,text,uuid,uuid,uuid,uuid) TO fabric_controller;
