-- Additive forward migration from v13. Transaction rollback is safe; no down
-- migration drops acknowledged content or receipt/event/outbox history.
ALTER TABLE fabric.storage_sources ADD UNIQUE(tenant_id,space_id,source_id,revision,source_task_id,witness);
CREATE TABLE fabric.storage_knowledge_revisions (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,class text NOT NULL DEFAULT 'knowledge' CHECK(class='knowledge'),
 id uuid NOT NULL,revision fabric.safe_amount NOT NULL CHECK(revision>0),source_task_id uuid NOT NULL,
 witness text NOT NULL,key_id uuid NOT NULL,generation uuid NOT NULL,epoch fabric.safe_amount NOT NULL,
 accepted_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 status text NOT NULL CHECK(status='user-asserted'),source_id uuid NOT NULL,source_revision fabric.safe_amount NOT NULL,
 source_witness text NOT NULL,subject_fingerprint text NOT NULL CHECK(subject_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
 cipher_text text NOT NULL,
 PRIMARY KEY(tenant_id,space_id,id,revision),
 UNIQUE(tenant_id,space_id,actor_id,command_key,id,revision,epoch,accepted_at),
 CHECK(octet_length(cipher_text)<=1500000 AND witness='sha256:'||encode(sha256(convert_to(cipher_text,'UTF8')),'hex')),
 CHECK(isfinite(accepted_at) AND isfinite(expires_at) AND expires_at>accepted_at),
 FOREIGN KEY(tenant_id,space_id,class,id,revision,source_task_id)
 REFERENCES fabric.storage_entities(tenant_id,space_id,class,id,revision,source_task_id),
 FOREIGN KEY(tenant_id,space_id,class,id,revision,witness,key_id,generation,epoch,accepted_at,expires_at)
 REFERENCES fabric.storage_current_heads(tenant_id,space_id,class,id,revision,witness,key_id,generation,epoch,accepted_at,expires_at),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_head_publications,
 FOREIGN KEY(tenant_id,space_id,source_id,source_revision,source_task_id,source_witness) REFERENCES fabric.storage_sources(tenant_id,space_id,source_id,revision,source_task_id,witness)
);
CREATE TABLE fabric.storage_save_events (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,event_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 mutation_id uuid NOT NULL,job_id uuid NOT NULL,target_id uuid NOT NULL,revision fabric.safe_amount NOT NULL,
 epoch fabric.safe_amount NOT NULL,at timestamptz NOT NULL,kind text NOT NULL CHECK(kind='knowledge-committed'),
 PRIMARY KEY(tenant_id,space_id,event_id),
 UNIQUE(tenant_id,space_id,event_id,actor_id,command_key,job_id,target_id,revision,epoch,at),
 UNIQUE(tenant_id,space_id,actor_id,command_key),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,target_id,revision,epoch,at)
 REFERENCES fabric.storage_knowledge_revisions(tenant_id,space_id,actor_id,command_key,id,revision,epoch,accepted_at)
);
CREATE TABLE fabric.storage_save_receipts (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 binding_digest text NOT NULL,receipt_id uuid NOT NULL,job_id uuid NOT NULL,event_id uuid NOT NULL,
 id uuid NOT NULL,revision fabric.safe_amount NOT NULL,epoch fabric.safe_amount NOT NULL,at timestamptz NOT NULL,
 status text NOT NULL CHECK(status='saved-here'),class text NOT NULL DEFAULT 'knowledge' CHECK(class='knowledge'),
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),
 UNIQUE(tenant_id,space_id,actor_id,command_key,id,revision,epoch,at),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,binding_digest,receipt_id,epoch,at)
 REFERENCES fabric.storage_commands(tenant_id,space_id,actor_id,command_key,binding_digest,receipt_id,epoch,at),
 FOREIGN KEY(tenant_id,space_id,job_id,actor_id,command_key,class,id,revision,epoch,at)
 REFERENCES fabric.storage_outbox(tenant_id,space_id,job_id,actor_id,command_key,class,target_id,target_revision,epoch,at),
 FOREIGN KEY(tenant_id,space_id,event_id,actor_id,command_key,job_id,id,revision,epoch,at)
 REFERENCES fabric.storage_save_events(tenant_id,space_id,event_id,actor_id,command_key,job_id,target_id,revision,epoch,at),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,id,revision,epoch,at)
 REFERENCES fabric.storage_knowledge_revisions(tenant_id,space_id,actor_id,command_key,id,revision,epoch,accepted_at)
);
-- Every canonical knowledge row requires a receipt, event and exact outbox at
-- COMMIT. The deferred reverse FK closes the partial-publication path.
ALTER TABLE fabric.storage_knowledge_revisions ADD FOREIGN KEY(tenant_id,space_id,actor_id,command_key,id,revision,epoch,accepted_at)
 REFERENCES fabric.storage_save_receipts(tenant_id,space_id,actor_id,command_key,id,revision,epoch,at) DEFERRABLE INITIALLY DEFERRED;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['storage_knowledge_revisions','storage_save_receipts','storage_save_events'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY storage_control_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
CREATE INDEX storage_knowledge_source ON fabric.storage_knowledge_revisions(tenant_id,space_id,source_id,source_revision);
CREATE INDEX storage_knowledge_subject ON fabric.storage_knowledge_revisions(tenant_id,space_id,subject_fingerprint,source_id,source_revision);
CREATE INDEX storage_knowledge_tail ON fabric.storage_knowledge_revisions(tenant_id,space_id,accepted_at DESC,id);
CREATE FUNCTION fabric.storage_commit_knowledge(k uuid,ct text,source uuid,source_rev numeric,source_w text,
 fingerprint text,receipt uuid,job uuid,event uuid,mutation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 p fabric.storage_head_publications%ROWTYPE;sh fabric.storage_sources%ROWTYPE;e jsonb;authority jsonb;publication_xid xid;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'knowledge scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["storage-epoch-original","%s","%s","%s","%s"]',t,sp,a,k),0));
 SELECT xmin INTO publication_xid FROM fabric.storage_head_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 IF publication_xid IS DISTINCT FROM (txid_current()%4294967296)::text::xid THEN
  RAISE EXCEPTION 'knowledge must share original transaction' USING ERRCODE='23514';END IF;
 SELECT * INTO p FROM fabric.storage_head_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 authority:=fabric.controller_authority();
 IF p.class IS DISTINCT FROM 'knowledge' OR p.revision IS DISTINCT FROM 1 OR p.expected_revision IS NOT NULL
  OR p.expires_at<=clock_timestamp() OR authority IS NULL OR NOT(authority->'grants' ?& ARRAY['storage:write','storage:maintenance','task:write'])
  OR NOT EXISTS(SELECT 1 FROM fabric.storage_epoch_publications x WHERE (x.tenant_id,x.space_id,x.actor_id,x.command_key)=(t,sp,a,k) AND x.expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'knowledge original denied' USING ERRCODE='23514';END IF;
 SELECT * INTO sh FROM fabric.storage_sources WHERE tenant_id=t AND space_id=sp AND source_id=source AND revision=source_rev;
 IF NOT FOUND OR sh.witness IS DISTINCT FROM source_w OR sh.source_task_id IS DISTINCT FROM p.source_task_id
  OR sh.expires_at<=clock_timestamp() OR p.expires_at>sh.expires_at
  OR EXISTS(SELECT 1 FROM fabric.storage_current_heads h WHERE (h.tenant_id,h.space_id,h.class,h.id)=(t,sp,'source',source) AND h.revision>source_rev)
  OR EXISTS(SELECT 1 FROM fabric.storage_tombstones d WHERE (d.tenant_id,d.space_id,d.class,d.id)=(t,sp,'source',source) AND d.revision>=source_rev)
  OR EXISTS(SELECT 1 FROM fabric.storage_restrictions r WHERE (r.tenant_id,r.space_id,r.source_id,r.source_revision)=(t,sp,source,source_rev)) THEN
  RAISE EXCEPTION 'knowledge source denied' USING ERRCODE='23514';END IF;
 IF ct IS NULL OR octet_length(ct)>1500000 THEN RAISE EXCEPTION 'knowledge bounds denied' USING ERRCODE='23514';END IF;
 e:=ct::jsonb;
 IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(e))<>12
  OR NOT(e ?& ARRAY['schemaVersion','algorithm','tenantId','spaceId','class','id','revision','generation','keyId','nonce','tag','ciphertext'])
  OR e->>'schemaVersion' IS DISTINCT FROM '1' OR e->>'algorithm' IS DISTINCT FROM 'AES-256-GCM'
  OR e->>'tenantId' IS DISTINCT FROM t::text OR e->>'spaceId' IS DISTINCT FROM sp::text
  OR e->>'class' IS DISTINCT FROM 'knowledge' OR e->>'id' IS DISTINCT FROM p.id::text
  OR e->>'revision' IS DISTINCT FROM p.revision::text OR e->>'keyId' IS DISTINCT FROM p.key_id::text OR e->>'generation' IS DISTINCT FROM p.generation::text
  OR jsonb_typeof(e->'nonce') IS DISTINCT FROM 'string' OR jsonb_typeof(e->'tag') IS DISTINCT FROM 'string' OR jsonb_typeof(e->'ciphertext') IS DISTINCT FROM 'string'
  OR e->>'nonce'!~'^[A-Za-z0-9+/]{16}$' OR e->>'tag'!~'^[A-Za-z0-9+/]{22}==$' OR e->>'ciphertext'!~'^[A-Za-z0-9+/]*={0,2}$'
  OR octet_length(decode(e->>'ciphertext','base64'))>1048576
  OR replace(encode(decode(e->>'ciphertext','base64'),'base64'),E'\n','') IS DISTINCT FROM e->>'ciphertext'
  OR p.witness<>'sha256:'||encode(sha256(convert_to(ct,'UTF8')),'hex') THEN
  RAISE EXCEPTION 'knowledge envelope denied' USING ERRCODE='23514';END IF;
 INSERT INTO fabric.storage_knowledge_revisions VALUES(t,sp,'knowledge',p.id,p.revision,p.source_task_id,p.witness,p.key_id,p.generation,p.epoch,p.accepted_at,p.expires_at,a,k,'user-asserted',source,source_rev,source_w,fingerprint,ct);
 INSERT INTO fabric.storage_commands VALUES(t,sp,a,k,(SELECT binding_digest FROM fabric.storage_epoch_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k),receipt,p.epoch,p.accepted_at);
 INSERT INTO fabric.storage_outbox VALUES(t,sp,job,a,k,'knowledge',p.id,p.revision,p.epoch,p.accepted_at);
 INSERT INTO fabric.storage_save_events VALUES(t,sp,event,a,k,mutation,job,p.id,p.revision,p.epoch,p.accepted_at,'knowledge-committed');
 INSERT INTO fabric.storage_save_receipts VALUES(t,sp,a,k,(SELECT binding_digest FROM fabric.storage_commands WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k),receipt,job,event,p.id,p.revision,p.epoch,p.accepted_at,'saved-here','knowledge');
END $$;
REVOKE ALL ON FUNCTION fabric.storage_commit_knowledge(uuid,text,uuid,numeric,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_commit_knowledge(uuid,text,uuid,numeric,text,text,uuid,uuid,uuid,uuid) TO fabric_controller;
