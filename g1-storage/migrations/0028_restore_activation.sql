-- Fresh encrypted content availability; never imports a policy/head/epoch.
CREATE TABLE fabric.storage_restore_activations (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,original_key uuid NOT NULL,
 operation_id uuid NOT NULL,backup_id uuid NOT NULL,generation uuid NOT NULL,key_id uuid NOT NULL,root_id uuid NOT NULL,
 command_fingerprint text NOT NULL,stage_digest text NOT NULL,restriction_epoch fabric.safe_amount NOT NULL,
 eligible jsonb NOT NULL,metadata jsonb NOT NULL,result jsonb NOT NULL,activated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,space_id,actor_id,original_key),UNIQUE(tenant_id,space_id,operation_id),
 CHECK(command_fingerprint ~ '^sha256:[0-9a-f]{64}$' AND stage_digest ~ '^sha256:[0-9a-f]{64}$' AND restriction_epoch>0),
 CHECK(jsonb_typeof(eligible)='array' AND jsonb_array_length(eligible)<=1024),
 CHECK(jsonb_typeof(metadata)='object' AND metadata->>'algorithm'='AES-256-GCM'
  AND metadata->>'tenantId'=tenant_id::text AND metadata->>'spaceId'=space_id::text
  AND metadata->>'id'=operation_id::text AND metadata->>'class'='backup' AND metadata->>'revision'='1'
  AND metadata->>'generation'=generation::text AND metadata->>'keyId'=key_id::text
  AND metadata->>'nonce' ~ '^[A-Za-z0-9+/]{16}$' AND metadata->>'tag' ~ '^[A-Za-z0-9+/]{22}==$'),
 CHECK(jsonb_typeof(result)='object' AND result->>'state'='ready' AND result->>'serving'='true'
  AND result->>'operationId'=operation_id::text AND result->>'backupId'=backup_id::text AND result->>'generation'=generation::text),
 FOREIGN KEY(tenant_id,space_id,backup_id) REFERENCES fabric.storage_backup_confirmations(tenant_id,space_id,id),
 FOREIGN KEY(tenant_id,space_id,restriction_epoch) REFERENCES fabric.storage_authority_epoch(tenant_id,space_id,epoch)
);
ALTER TABLE fabric.storage_restore_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_restore_activations FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_restore_activations
 USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_restore_activations
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_restore_activations FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_restore_activations TO fabric_controller;
CREATE FUNCTION fabric.storage_activate_restore(k uuid,op uuid,backup uuid,generation uuid,key_id uuid,root uuid,
 fingerprint text,stage text,requested_epoch numeric,eligible jsonb,metadata jsonb,result jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();auth jsonb;r jsonb;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'restore scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 auth:=fabric.controller_authority();
 IF auth IS NULL OR NOT(auth->'grants' ?& ARRAY['storage:restore','storage:read','storage:maintenance'])
  OR requested_epoch IS DISTINCT FROM (SELECT max(e.epoch) FROM fabric.storage_authority_epoch e WHERE tenant_id=t AND space_id=sp)
  OR NOT EXISTS(SELECT 1 FROM fabric.storage_authority_epoch e JOIN fabric.storage_policy p ON (p.tenant_id,p.space_id,p.revision)=(e.tenant_id,e.space_id,e.policy_revision)
   WHERE e.tenant_id=t AND e.space_id=sp AND e.epoch=requested_epoch AND p.operations ?& ARRAY['restore','read','maintenance'])
  OR NOT EXISTS(SELECT 1 FROM fabric.storage_backup_confirmations b WHERE (b.tenant_id,b.space_id,b.id)=(t,sp,backup) AND b.expires_at>clock_timestamp())
  OR jsonb_typeof(eligible) IS DISTINCT FROM 'array' OR jsonb_array_length(eligible)>1024 THEN
  RAISE EXCEPTION 'restore authority denied' USING ERRCODE='23514';END IF;
 FOR r IN SELECT * FROM jsonb_array_elements(eligible) LOOP
  IF r->>'class'='ask' THEN
   IF NOT EXISTS(SELECT 1 FROM fabric.storage_graph_nodes n JOIN fabric.storage_ask_receipts ar ON (ar.tenant_id,ar.space_id,ar.id)=(n.tenant_id,n.space_id,n.id)
    WHERE (n.tenant_id,n.space_id,n.class,n.id,n.revision,n.witness)=(t,sp,'ask',(r->>'id')::uuid,1,r->>'witness') AND ar.expires_at>clock_timestamp()) THEN
    RAISE EXCEPTION 'restore receipt denied' USING ERRCODE='23514';END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM fabric.storage_current_heads h
   WHERE (h.tenant_id,h.space_id,h.class,h.id,h.revision,h.witness)=(t,sp,r->>'class',(r->>'id')::uuid,(r->>'revision')::numeric,r->>'witness')
    AND h.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM fabric.storage_current_heads newer WHERE (newer.tenant_id,newer.space_id,newer.class,newer.id)=(h.tenant_id,h.space_id,h.class,h.id) AND newer.revision>h.revision)
    AND NOT EXISTS(SELECT 1 FROM fabric.storage_tombstones d WHERE (d.tenant_id,d.space_id,d.class,d.id)=(h.tenant_id,h.space_id,h.class,h.id) AND d.revision>=h.revision)
    AND NOT EXISTS(SELECT 1 FROM fabric.storage_restrictions d WHERE h.class='source' AND (d.tenant_id,d.space_id,d.source_id,d.source_revision)=(h.tenant_id,h.space_id,h.id,h.revision))) THEN
   RAISE EXCEPTION 'restore head denied' USING ERRCODE='23514';END IF;
 END LOOP;
 INSERT INTO fabric.storage_restore_activations(tenant_id,space_id,actor_id,original_key,operation_id,backup_id,generation,key_id,root_id,command_fingerprint,stage_digest,restriction_epoch,eligible,metadata,result)
 VALUES(t,sp,a,k,op,backup,generation,key_id,root,fingerprint,stage,requested_epoch,eligible,metadata,result);
END $$;
REVOKE ALL ON FUNCTION fabric.storage_activate_restore(uuid,uuid,uuid,uuid,uuid,uuid,text,text,numeric,jsonb,jsonb,jsonb) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_activate_restore(uuid,uuid,uuid,uuid,uuid,uuid,text,text,numeric,jsonb,jsonb,jsonb) TO fabric_controller;
