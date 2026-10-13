-- Forward-only v16: new correction capability; v1-v15 functions/data stay intact.
-- Rollback before COMMIT is safe. No destructive committed down migration.
ALTER TABLE fabric.storage_knowledge_revisions ADD UNIQUE(tenant_id,space_id,id,revision,witness,actor_id,command_key);
ALTER TABLE fabric.storage_knowledge_revisions ADD UNIQUE(tenant_id,space_id,actor_id,command_key,id,revision);
CREATE TABLE fabric.storage_knowledge_corrections (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,id uuid NOT NULL,revision fabric.safe_amount NOT NULL,
 previous_revision fabric.safe_amount NOT NULL,previous_witness text NOT NULL,
 previous_actor uuid NOT NULL,previous_key uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,id,revision),CHECK(revision=previous_revision+1),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,id,revision) REFERENCES fabric.storage_knowledge_revisions(tenant_id,space_id,actor_id,command_key,id,revision),
 FOREIGN KEY(tenant_id,space_id,id,previous_revision,previous_witness,previous_actor,previous_key) REFERENCES fabric.storage_knowledge_revisions(tenant_id,space_id,id,revision,witness,actor_id,command_key)
);
ALTER TABLE fabric.storage_knowledge_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_knowledge_corrections FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_knowledge_corrections USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_knowledge_corrections FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_knowledge_corrections FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_knowledge_corrections TO fabric_controller;
CREATE INDEX storage_knowledge_scoped_claim ON fabric.storage_knowledge_revisions(tenant_id,space_id,source_id,source_revision,subject_fingerprint,id,revision DESC);
CREATE FUNCTION fabric.storage_commit_corrected_knowledge(k uuid,ct text,source uuid,source_rev numeric,source_w text,
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
 IF p.expected_revision IS NULL OR st NOT IN('user-asserted','source-verified') THEN
  RAISE EXCEPTION 'correction requires an accepted target' USING ERRCODE='23514';END IF;
 SELECT * INTO prior FROM fabric.storage_knowledge_revisions WHERE tenant_id=t AND space_id=sp AND id=p.id AND revision=p.expected_revision;
 IF NOT FOUND OR prior.status NOT IN('user-asserted','source-verified','disputed')
  OR prior.source_id<>source OR prior.source_revision<>source_rev OR prior.source_witness<>source_w
  OR prior.subject_fingerprint<>fingerprint
  OR (EXISTS(SELECT 1 FROM fabric.storage_knowledge_admissions m WHERE (m.tenant_id,m.space_id,m.id,m.revision)=(t,sp,p.id,p.expected_revision))
   AND NOT EXISTS(SELECT 1 FROM fabric.storage_knowledge_admissions m WHERE (m.tenant_id,m.space_id,m.id,m.revision)=(t,sp,p.id,p.expected_revision)
   AND m.source_digest=src_digest AND m.valid_from=vfrom AND m.valid_until IS NOT DISTINCT FROM vuntil))
  OR prior.expires_at<>p.expires_at THEN
  RAISE EXCEPTION 'correction target binding denied' USING ERRCODE='23514';END IF;
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
 INSERT INTO fabric.storage_knowledge_corrections VALUES(t,sp,p.id,p.revision,p.expected_revision,p.expected_witness,prior.actor_id,prior.command_key,a,k);
END $$;
REVOKE ALL ON FUNCTION fabric.storage_commit_corrected_knowledge(uuid,text,uuid,numeric,text,text,uuid,uuid,uuid,uuid,text,uuid,text,text,timestamptz,timestamptz) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_commit_corrected_knowledge(uuid,text,uuid,numeric,text,text,uuid,uuid,uuid,uuid,text,uuid,text,text,timestamptz,timestamptz) TO fabric_controller;
-- A changed claim or same-status successor requires its immutable correction
-- edge at actual COMMIT; typed status admission alone cannot bypass lineage.
CREATE FUNCTION fabric.storage_require_correction_lineage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF NEW.revision>1 AND EXISTS(
  SELECT 1 FROM fabric.storage_knowledge_revisions p
  LEFT JOIN fabric.storage_knowledge_admissions previous_admission ON (previous_admission.tenant_id,previous_admission.space_id,previous_admission.id,previous_admission.revision)=(p.tenant_id,p.space_id,p.id,p.revision)
  JOIN fabric.storage_knowledge_admissions next_admission ON (next_admission.tenant_id,next_admission.space_id,next_admission.id,next_admission.revision)=(NEW.tenant_id,NEW.space_id,NEW.id,NEW.revision)
  WHERE (p.tenant_id,p.space_id,p.id,p.revision)=(NEW.tenant_id,NEW.space_id,NEW.id,NEW.revision-1)
   AND (p.status=NEW.status OR previous_admission.claim_digest<>next_admission.claim_digest)
 ) AND NOT EXISTS(SELECT 1 FROM fabric.storage_knowledge_corrections WHERE (tenant_id,space_id,id,revision)=(NEW.tenant_id,NEW.space_id,NEW.id,NEW.revision)) THEN
  RAISE EXCEPTION 'correction requires lineage' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fabric.storage_require_correction_lineage() FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
CREATE CONSTRAINT TRIGGER storage_correction_lineage_required AFTER INSERT ON fabric.storage_knowledge_revisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fabric.storage_require_correction_lineage();
