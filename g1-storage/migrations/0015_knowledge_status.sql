-- Forward-only expansion from v14. Existing revisions/receipts are immutable.
-- Transaction rollback is safe before acknowledgment. Operational rollback
-- disables new status admission; never drop acknowledged history/check bindings.
ALTER TABLE fabric.storage_knowledge_revisions DROP CONSTRAINT storage_knowledge_revisions_status_check;
ALTER TABLE fabric.storage_knowledge_revisions ADD CHECK(status IN('proposed','user-asserted','source-verified','disputed','superseded','expired','deleted'));
ALTER TABLE fabric.storage_knowledge_revisions ADD UNIQUE(tenant_id,space_id,id,revision,status);
ALTER TABLE fabric.storage_knowledge_revisions ADD UNIQUE(tenant_id,space_id,id,revision,source_id,source_revision,source_witness);
ALTER TABLE fabric.storage_save_receipts DROP CONSTRAINT storage_save_receipts_status_check;
ALTER TABLE fabric.storage_save_receipts ADD CHECK(status IN('saved-here','pending-review'));
ALTER TABLE fabric.storage_save_events DROP CONSTRAINT storage_save_events_kind_check;
ALTER TABLE fabric.storage_save_events ADD CHECK(kind IN('knowledge-committed','knowledge-proposed'));
CREATE ROLE fabric_storage_source_checker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE TABLE fabric.storage_source_checks (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,check_id uuid NOT NULL,
 checker text NOT NULL CHECK(checker='local-source-exact-v1'),definition_digest text NOT NULL CHECK(definition_digest='sha256:e3a4ee5c8e02d19f057c105e215ad993514958dd1218f5634df8a7f10b7c446f'),
 source_id uuid NOT NULL,source_revision fabric.safe_amount NOT NULL,source_task_id uuid NOT NULL,source_witness text NOT NULL,
 source_digest text NOT NULL CHECK(source_digest ~ '^sha256:[0-9a-f]{64}$'),claim_digest text NOT NULL CHECK(claim_digest ~ '^sha256:[0-9a-f]{64}$'),
 checked_at timestamptz NOT NULL CHECK(isfinite(checked_at)),expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
 PRIMARY KEY(tenant_id,space_id,check_id),CHECK(expires_at>checked_at),
 UNIQUE(tenant_id,space_id,check_id,source_id,source_revision,source_witness,source_digest,claim_digest),
 FOREIGN KEY(tenant_id,space_id,source_id,source_revision,source_task_id,source_witness) REFERENCES fabric.storage_sources(tenant_id,space_id,source_id,revision,source_task_id,witness)
);
CREATE TABLE fabric.storage_knowledge_admissions (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,id uuid NOT NULL,revision fabric.safe_amount NOT NULL,status text NOT NULL,
 check_id uuid,claim_digest text NOT NULL CHECK(claim_digest ~ '^sha256:[0-9a-f]{64}$'),source_digest text NOT NULL CHECK(source_digest ~ '^sha256:[0-9a-f]{64}$'),
 valid_from timestamptz NOT NULL,valid_until timestamptz,previous_revision fabric.safe_amount,
 source_id uuid NOT NULL,source_revision fabric.safe_amount NOT NULL,source_witness text NOT NULL,
 PRIMARY KEY(tenant_id,space_id,id,revision),
 CHECK((status='source-verified')=(check_id IS NOT NULL)),CHECK(isfinite(valid_from) AND (valid_until IS NULL OR (isfinite(valid_until) AND valid_until>valid_from))),
 CHECK((revision=1 AND previous_revision IS NULL) OR revision=previous_revision+1),
 FOREIGN KEY(tenant_id,space_id,id,revision,status) REFERENCES fabric.storage_knowledge_revisions(tenant_id,space_id,id,revision,status),
 FOREIGN KEY(tenant_id,space_id,id,previous_revision) REFERENCES fabric.storage_knowledge_revisions(tenant_id,space_id,id,revision),
 FOREIGN KEY(tenant_id,space_id,id,revision,source_id,source_revision,source_witness) REFERENCES fabric.storage_knowledge_revisions(tenant_id,space_id,id,revision,source_id,source_revision,source_witness),
 FOREIGN KEY(tenant_id,space_id,check_id,source_id,source_revision,source_witness,source_digest,claim_digest) REFERENCES fabric.storage_source_checks(tenant_id,space_id,check_id,source_id,source_revision,source_witness,source_digest,claim_digest)
);
CREATE INDEX storage_knowledge_status_tail ON fabric.storage_knowledge_revisions(tenant_id,space_id,status,accepted_at DESC,id);
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['storage_source_checks','storage_knowledge_admissions'] LOOP
 EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY storage_control_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
 EXECUTE format('CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
 EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp,fabric_storage_source_checker',n);
 EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
END LOOP;END $$;
-- This fixed independent checker capability is installed only in the owned
-- synthetic fixture. Serving/controller/worker/IdP cannot issue check receipts.
CREATE FUNCTION fabric.storage_register_source_check(cid uuid,source uuid,rev numeric,w text,sd text,claim text) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();sh fabric.storage_sources%ROWTYPE;at timestamptz:=date_trunc('milliseconds',clock_timestamp());
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'check scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 SELECT * INTO sh FROM fabric.storage_sources WHERE tenant_id=t AND space_id=sp AND source_id=source AND revision=rev;
 IF NOT FOUND OR sh.witness<>w OR sh.expires_at<=clock_timestamp()
  OR EXISTS(SELECT 1 FROM fabric.storage_current_heads WHERE tenant_id=t AND space_id=sp AND class='source' AND id=source AND revision>rev)
  OR EXISTS(SELECT 1 FROM fabric.storage_restrictions WHERE tenant_id=t AND space_id=sp AND source_id=source AND source_revision=rev)
  OR EXISTS(SELECT 1 FROM fabric.storage_tombstones WHERE tenant_id=t AND space_id=sp AND class='source' AND id=source AND revision>=rev) THEN
  RAISE EXCEPTION 'check source denied' USING ERRCODE='23514';END IF;
 INSERT INTO fabric.storage_source_checks VALUES(t,sp,cid,'local-source-exact-v1','sha256:e3a4ee5c8e02d19f057c105e215ad993514958dd1218f5634df8a7f10b7c446f',source,rev,sh.source_task_id,w,sd,claim,at,sh.expires_at);
 RETURN at;
END $$;
REVOKE ALL ON FUNCTION fabric.storage_register_source_check(uuid,uuid,numeric,text,text,text) FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_register_source_check(uuid,uuid,numeric,text,text,text) TO fabric_storage_source_checker;
CREATE FUNCTION fabric.storage_commit_typed_knowledge(k uuid,ct text,source uuid,source_rev numeric,source_w text,
 fingerprint text,receipt uuid,job uuid,event uuid,mutation uuid,st text,check_ref uuid,claim text,src_digest text,vfrom timestamptz,vuntil timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 p fabric.storage_head_publications%ROWTYPE;sh fabric.storage_sources%ROWTYPE;e jsonb;authority jsonb;publication_xid xid;prior fabric.storage_knowledge_revisions%ROWTYPE;proof fabric.storage_source_checks%ROWTYPE;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'knowledge scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["storage-epoch-original","%s","%s","%s","%s"]',t,sp,a,k),0));
 SELECT xmin INTO publication_xid FROM fabric.storage_head_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 IF publication_xid IS DISTINCT FROM (txid_current()%4294967296)::text::xid THEN
  RAISE EXCEPTION 'knowledge must share original transaction' USING ERRCODE='23514';END IF;
 SELECT * INTO p FROM fabric.storage_head_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 authority:=fabric.controller_authority();
 IF p.class IS DISTINCT FROM 'knowledge' OR p.revision IS DISTINCT FROM coalesce(p.expected_revision,0)+1
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
 IF st NOT IN('proposed','user-asserted','source-verified','disputed','superseded','expired','deleted')
  OR st IS NULL OR vfrom IS NULL OR NOT isfinite(vfrom) OR (vuntil IS NOT NULL AND (NOT isfinite(vuntil) OR vuntil<=vfrom))
  OR p.expires_at<=vfrom OR claim !~ '^sha256:[0-9a-f]{64}$' OR src_digest !~ '^sha256:[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'knowledge status bounds denied' USING ERRCODE='23514';END IF;
 IF p.expected_revision IS NULL THEN
  IF st NOT IN('proposed','user-asserted','source-verified') THEN RAISE EXCEPTION 'knowledge initial status denied' USING ERRCODE='23514';END IF;
 ELSE
  SELECT * INTO prior FROM fabric.storage_knowledge_revisions WHERE tenant_id=t AND space_id=sp AND id=p.id AND revision=p.expected_revision;
  IF NOT FOUND OR prior.status IN('superseded','expired','deleted') OR st=prior.status
   OR NOT((prior.status='proposed' AND st IN('user-asserted','expired','deleted'))
    OR (prior.status='user-asserted' AND st IN('source-verified','disputed','superseded','expired','deleted'))
    OR (prior.status='source-verified' AND st IN('disputed','superseded','expired','deleted'))
    OR (prior.status='disputed' AND st IN('user-asserted','source-verified','superseded','expired','deleted')))
   OR prior.source_id<>source OR prior.source_revision<>source_rev OR prior.source_witness<>source_w
   OR (EXISTS(SELECT 1 FROM fabric.storage_knowledge_admissions m WHERE (m.tenant_id,m.space_id,m.id,m.revision)=(t,sp,p.id,p.expected_revision)) AND NOT EXISTS(SELECT 1 FROM fabric.storage_knowledge_admissions m WHERE (m.tenant_id,m.space_id,m.id,m.revision)=(t,sp,p.id,p.expected_revision)
    AND m.claim_digest=claim AND m.source_digest=src_digest AND m.valid_from=vfrom AND m.valid_until IS NOT DISTINCT FROM vuntil))
   THEN RAISE EXCEPTION 'knowledge transition denied' USING ERRCODE='23514';END IF;
 END IF;
 IF st='deleted' AND NOT(authority->'grants' ? 'storage:forget') THEN RAISE EXCEPTION 'knowledge delete denied' USING ERRCODE='42501';END IF;
 IF st='expired' AND (vuntil IS NULL OR vuntil>clock_timestamp()) THEN RAISE EXCEPTION 'knowledge expiry denied' USING ERRCODE='23514';END IF;
 IF st='source-verified' THEN
  SELECT * INTO proof FROM fabric.storage_source_checks WHERE tenant_id=t AND space_id=sp AND check_id=check_ref;
  IF NOT FOUND OR (proof.source_id,proof.source_revision,proof.source_witness,proof.source_digest,proof.claim_digest)
   IS DISTINCT FROM (source,source_rev,source_w,src_digest,claim) OR proof.checked_at>clock_timestamp()
   OR proof.checked_at<sh.accepted_at OR proof.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'knowledge check binding denied' USING ERRCODE='23514';END IF;
 ELSIF check_ref IS NOT NULL THEN RAISE EXCEPTION 'knowledge check status denied' USING ERRCODE='23514';END IF;
 INSERT INTO fabric.storage_knowledge_revisions VALUES(t,sp,'knowledge',p.id,p.revision,p.source_task_id,p.witness,p.key_id,p.generation,p.epoch,p.accepted_at,p.expires_at,a,k,st,source,source_rev,source_w,fingerprint,ct);
 INSERT INTO fabric.storage_commands VALUES(t,sp,a,k,(SELECT binding_digest FROM fabric.storage_epoch_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k),receipt,p.epoch,p.accepted_at);
 INSERT INTO fabric.storage_outbox VALUES(t,sp,job,a,k,'knowledge',p.id,p.revision,p.epoch,p.accepted_at);
 INSERT INTO fabric.storage_save_events VALUES(t,sp,event,a,k,mutation,job,p.id,p.revision,p.epoch,p.accepted_at,CASE WHEN st='proposed' THEN 'knowledge-proposed' ELSE 'knowledge-committed' END);
 INSERT INTO fabric.storage_save_receipts VALUES(t,sp,a,k,(SELECT binding_digest FROM fabric.storage_commands WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k),receipt,job,event,p.id,p.revision,p.epoch,p.accepted_at,CASE WHEN st='proposed' THEN 'pending-review' ELSE 'saved-here' END,'knowledge');
 INSERT INTO fabric.storage_knowledge_admissions VALUES(t,sp,p.id,p.revision,st,check_ref,claim,src_digest,vfrom,vuntil,p.expected_revision,source,source_rev,source_w);
END $$;
REVOKE ALL ON FUNCTION fabric.storage_commit_typed_knowledge(uuid,text,uuid,numeric,text,text,uuid,uuid,uuid,uuid,text,uuid,text,text,timestamptz,timestamptz) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_commit_typed_knowledge(uuid,text,uuid,numeric,text,text,uuid,uuid,uuid,uuid,text,uuid,text,text,timestamptz,timestamptz) TO fabric_controller;
CREATE FUNCTION fabric.storage_require_knowledge_admission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM fabric.storage_knowledge_admissions WHERE (tenant_id,space_id,id,revision,status)=(NEW.tenant_id,NEW.space_id,NEW.id,NEW.revision,NEW.status)) THEN
  RAISE EXCEPTION 'knowledge requires typed admission' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fabric.storage_require_knowledge_admission() FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
CREATE CONSTRAINT TRIGGER storage_knowledge_admission_required AFTER INSERT ON fabric.storage_knowledge_revisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fabric.storage_require_knowledge_admission();
