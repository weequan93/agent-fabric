-- Additive encrypted conversation-query receipts. Installed native, recovery
-- and economic owners retain their source, schema, grants and behavior.
CREATE TABLE fabric.storage_ask_receipts (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 id uuid NOT NULL,session_id uuid NOT NULL,task_id uuid NOT NULL,run_id uuid NOT NULL,
 native_revision fabric.safe_amount NOT NULL,controls_revision fabric.safe_amount NOT NULL CHECK(controls_revision>0),
 key_id uuid NOT NULL,generation uuid NOT NULL,epoch fabric.safe_amount NOT NULL CHECK(epoch>0),
 resource_receipt_id uuid NOT NULL,binding_fingerprint text NOT NULL,query_fingerprint text NOT NULL,
 envelope jsonb NOT NULL,accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,space_id,id),UNIQUE(tenant_id,space_id,actor_id,command_key),
 UNIQUE(tenant_id,space_id,resource_receipt_id),
 UNIQUE(tenant_id,space_id,actor_id,session_id,task_id,run_id,command_key,id,native_revision),
 CHECK(binding_fingerprint ~ '^sha256:[0-9a-f]{64}$' AND query_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
 CHECK(isfinite(accepted_at) AND isfinite(expires_at) AND expires_at>accepted_at),
 CHECK(jsonb_typeof(envelope)='object' AND octet_length(envelope::text)<=1500000
  AND envelope ?& ARRAY['schemaVersion','algorithm','tenantId','spaceId','class','id','revision','generation','keyId','nonce','tag','ciphertext']
  AND envelope-ARRAY['schemaVersion','algorithm','tenantId','spaceId','class','id','revision','generation','keyId','nonce','tag','ciphertext']='{}'::jsonb
  AND envelope->'schemaVersion'='1'::jsonb AND envelope->>'algorithm'='AES-256-GCM'
  AND envelope->>'tenantId'=tenant_id::text AND envelope->>'spaceId'=space_id::text
  AND envelope->>'class'='ask' AND envelope->>'id'=id::text AND envelope->'revision'='1'::jsonb
  AND envelope->>'generation'=generation::text AND envelope->>'keyId'=key_id::text
  AND jsonb_typeof(envelope->'ciphertext')='string' AND envelope->>'ciphertext' ~ '^[A-Za-z0-9+/]*={0,2}$'
  AND envelope->>'nonce' ~ '^[A-Za-z0-9+/]{16}$' AND envelope->>'tag' ~ '^[A-Za-z0-9+/]{22}==$'),
 FOREIGN KEY(tenant_id,space_id,session_id,task_id,run_id) REFERENCES fabric.model_sessions(tenant_id,space_id,session_id,task_id,run_id),
 FOREIGN KEY(tenant_id,space_id,actor_id,session_id,controls_revision) REFERENCES fabric.storage_query_controls(tenant_id,space_id,actor_id,session_id,revision),
 FOREIGN KEY(tenant_id,space_id,resource_receipt_id) REFERENCES fabric.usage_settlements(tenant_id,space_id,settlement_id),
 FOREIGN KEY(tenant_id,space_id,resource_receipt_id) REFERENCES fabric.model_resource_intervals(tenant_id,space_id,receipt_id)
);
CREATE TABLE fabric.storage_native_ask_refs (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,session_id uuid NOT NULL,
 task_id uuid NOT NULL,run_id uuid NOT NULL,command_key uuid NOT NULL,id uuid NOT NULL,native_revision fabric.safe_amount NOT NULL,
 PRIMARY KEY(tenant_id,space_id,id),
 FOREIGN KEY(tenant_id,space_id,actor_id,session_id,task_id,run_id,command_key,id,native_revision)
  REFERENCES fabric.storage_ask_receipts(tenant_id,space_id,actor_id,session_id,task_id,run_id,command_key,id,native_revision)
);
ALTER TABLE fabric.storage_ask_receipts ADD FOREIGN KEY(tenant_id,space_id,id)
 REFERENCES fabric.storage_native_ask_refs DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE fabric.storage_ask_dependencies (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,ask_id uuid NOT NULL,ordinal integer NOT NULL CHECK(ordinal>=0 AND ordinal<64),
 knowledge_id uuid NOT NULL,knowledge_revision fabric.safe_amount NOT NULL,knowledge_witness text NOT NULL CHECK(knowledge_witness ~ '^sha256:[0-9a-f]{64}$'),
 source_id uuid NOT NULL,source_revision fabric.safe_amount NOT NULL,
 PRIMARY KEY(tenant_id,space_id,ask_id,ordinal),UNIQUE(tenant_id,space_id,ask_id,knowledge_id),
 FOREIGN KEY(tenant_id,space_id,ask_id) REFERENCES fabric.storage_ask_receipts,
 FOREIGN KEY(tenant_id,space_id,knowledge_id,knowledge_revision) REFERENCES fabric.storage_knowledge_revisions(tenant_id,space_id,id,revision),
 FOREIGN KEY(tenant_id,space_id,source_id,source_revision) REFERENCES fabric.storage_sources(tenant_id,space_id,source_id,revision)
);
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['storage_ask_receipts','storage_native_ask_refs','storage_ask_dependencies'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY storage_native_query_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('CREATE TRIGGER storage_native_query_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
CREATE FUNCTION fabric.storage_publish_native_ask(r jsonb,dependencies jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 n fabric.model_sessions%ROWTYPE;c fabric.model_native_controls%ROWTYPE;i fabric.model_resource_intervals%ROWTYPE;
 d jsonb;ix integer:=0;k fabric.storage_knowledge_revisions%ROWTYPE;
BEGIN
 IF NOT fabric.service_scope(t,sp) OR jsonb_typeof(r) IS DISTINCT FROM 'object'
  OR NOT(r ?& ARRAY['id','commandKey','sessionId','taskId','runId','nativeRevision','controlsRevision','epoch','keyId','generation','resourceReceiptId','bindingFingerprint','queryFingerprint','envelope','expiresAt','commandExpiresAt'])
  OR r-ARRAY['id','commandKey','sessionId','taskId','runId','nativeRevision','controlsRevision','epoch','keyId','generation','resourceReceiptId','bindingFingerprint','queryFingerprint','envelope','expiresAt','commandExpiresAt']<>'{}'::jsonb
  OR jsonb_typeof(dependencies) IS DISTINCT FROM 'array' OR jsonb_array_length(dependencies)>64 THEN
  RAISE EXCEPTION 'native query input denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 IF NOT((fabric.controller_authority())->'grants' ?& ARRAY['storage:read','task:read','task:write'])
  OR NOT isfinite((r->>'commandExpiresAt')::timestamptz) OR (r->>'commandExpiresAt')::timestamptz<=clock_timestamp() THEN
  RAISE EXCEPTION 'native query authority denied' USING ERRCODE='42501';END IF;
 SELECT * INTO n FROM fabric.model_sessions WHERE tenant_id=t AND space_id=sp AND session_id=(r->>'sessionId')::uuid;
 SELECT * INTO c FROM fabric.model_native_controls WHERE tenant_id=t AND space_id=sp AND session_id=n.session_id;
 IF n.binding->>'actorId' IS DISTINCT FROM a::text OR n.task_id::text IS DISTINCT FROM r->>'taskId'
  OR n.run_id::text IS DISTINCT FROM r->>'runId' OR n.binding->>'intent' IS DISTINCT FROM 'Ask'
  OR n.binding->>'purpose' IS DISTINCT FROM 'answer' OR c.admission->>'executionClass' IS DISTINCT FROM 'service'
  OR c.admission->'computerCapability' IS DISTINCT FROM 'null'::jsonb OR c.admission->'resourceId' IS DISTINCT FROM 'null'::jsonb
  OR c.admission->'targetEffect' IS DISTINCT FROM 'false'::jsonb OR c.admission->'approvalRequired' IS DISTINCT FROM 'false'::jsonb
  OR c.revision IS DISTINCT FROM (r->>'nativeRevision')::numeric OR c.record->'wait' IS DISTINCT FROM 'null'::jsonb
  OR (fabric.model_current(n.run_id,NULL,false))->'record' IS DISTINCT FROM n.binding THEN
  RAISE EXCEPTION 'native query origin denied' USING ERRCODE='42501';END IF;
 PERFORM fabric.model_recovery_current(n.run_id,false);
 SELECT * INTO i FROM fabric.model_resource_intervals WHERE tenant_id=t AND space_id=sp AND receipt_id=(r->>'resourceReceiptId')::uuid;
 IF i.origin_run_id IS DISTINCT FROM n.run_id OR i.category IS DISTINCT FROM 'service'
  OR i.xmin::text IS DISTINCT FROM pg_current_xact_id()::text
  OR NOT EXISTS(SELECT 1 FROM fabric.usage_settlements u WHERE u.tenant_id=t AND u.space_id=sp AND u.settlement_id=i.receipt_id AND u.receipt=i.record AND u.amount=i.amount)
  OR NOT EXISTS(SELECT 1 FROM fabric.storage_service_resources s WHERE s.tenant_id=t AND s.space_id=sp AND s.resource_id=i.resource_id AND s.origin_run_id=n.run_id AND s.actor_id=a AND s.purpose='ask')
  OR EXISTS(SELECT 1 FROM fabric.model_computer_assignments x WHERE x.tenant_id=t AND x.space_id=sp AND x.resource_id=i.resource_id) THEN
  RAISE EXCEPTION 'native query settlement denied' USING ERRCODE='42501';END IF;
 INSERT INTO fabric.storage_ask_receipts(tenant_id,space_id,actor_id,command_key,id,session_id,task_id,run_id,native_revision,controls_revision,key_id,generation,epoch,resource_receipt_id,binding_fingerprint,query_fingerprint,envelope,expires_at)
 VALUES(t,sp,a,(r->>'commandKey')::uuid,(r->>'id')::uuid,n.session_id,n.task_id,n.run_id,c.revision,(r->>'controlsRevision')::numeric,
  (r->>'keyId')::uuid,(r->>'generation')::uuid,(r->>'epoch')::numeric,i.receipt_id,r->>'bindingFingerprint',r->>'queryFingerprint',r->'envelope',(r->>'expiresAt')::timestamptz);
 INSERT INTO fabric.storage_native_ask_refs VALUES(t,sp,a,n.session_id,n.task_id,n.run_id,(r->>'commandKey')::uuid,(r->>'id')::uuid,c.revision);
 FOR d IN SELECT value FROM jsonb_array_elements(dependencies) LOOP
  SELECT * INTO k FROM fabric.storage_knowledge_revisions WHERE tenant_id=t AND space_id=sp AND id=(d->>'id')::uuid AND revision=(d->>'revision')::numeric;
  IF NOT FOUND OR k.witness IS DISTINCT FROM d->>'witness' OR k.source_id::text IS DISTINCT FROM d->>'sourceId'
   OR k.source_revision IS DISTINCT FROM (d->>'sourceRevision')::numeric THEN
   RAISE EXCEPTION 'native query dependency denied' USING ERRCODE='23514';END IF;
  INSERT INTO fabric.storage_ask_dependencies VALUES(t,sp,(r->>'id')::uuid,ix,k.id,k.revision,k.witness,k.source_id,k.source_revision);ix:=ix+1;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION fabric.storage_publish_native_ask(jsonb,jsonb) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_publish_native_ask(jsonb,jsonb) TO fabric_controller;
