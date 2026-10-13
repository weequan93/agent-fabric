-- Forward-only additive encrypted provenance. Rollback before COMMIT is safe;
-- committed content is never dropped by this migration or its runner.
CREATE TABLE fabric.storage_sources (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,class text NOT NULL DEFAULT 'source' CHECK(class='source'),
 source_id uuid NOT NULL,revision fabric.safe_amount NOT NULL CHECK(revision>0),source_task_id uuid NOT NULL,
 witness text NOT NULL,key_id uuid NOT NULL,generation uuid NOT NULL,
 epoch fabric.safe_amount NOT NULL,accepted_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 actor_id uuid NOT NULL,command_key uuid NOT NULL,cipher_text text NOT NULL,
 PRIMARY KEY(tenant_id,space_id,source_id,revision),
 CHECK(octet_length(cipher_text)<=1500000),
 CHECK(witness='sha256:'||encode(sha256(convert_to(cipher_text,'UTF8')),'hex')),
 CHECK(isfinite(accepted_at) AND isfinite(expires_at) AND expires_at>accepted_at),
 FOREIGN KEY(tenant_id,space_id,class,source_id,revision,source_task_id)
 REFERENCES fabric.storage_entities(tenant_id,space_id,class,id,revision,source_task_id),
 FOREIGN KEY(tenant_id,space_id,class,source_id,revision,witness,key_id,generation,epoch,accepted_at,expires_at)
 REFERENCES fabric.storage_current_heads(tenant_id,space_id,class,id,revision,witness,key_id,generation,epoch,accepted_at,expires_at),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_head_publications
);
ALTER TABLE fabric.storage_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_sources
 USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_sources
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_sources FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_sources TO fabric_controller;
CREATE FUNCTION fabric.storage_publish_source_content(k uuid,ct text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();s uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 p fabric.storage_head_publications%ROWTYPE;e jsonb;auth jsonb;publication_xid xid;
BEGIN
 IF NOT fabric.service_scope(t,s) THEN RAISE EXCEPTION 'source content scope denied' USING ERRCODE='42501';END IF;
 auth:=fabric.controller_authority();
 IF auth IS NULL OR NOT(auth->'grants' ?& ARRAY['storage:maintenance','task:write','storage:write'])
  OR auth->>'lifecycle'<>'active' OR (auth->>'actorRevoked')::boolean
  OR (auth->>'payerRevoked')::boolean OR (auth->>'membershipRevoked')::boolean THEN
  RAISE EXCEPTION 'source content authority denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,s),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["storage-epoch-original","%s","%s","%s","%s"]',t,s,a,k),0));
 SELECT xmin INTO publication_xid FROM fabric.storage_head_publications WHERE tenant_id=t AND space_id=s AND actor_id=a AND command_key=k;
 IF publication_xid IS DISTINCT FROM (txid_current()%4294967296)::text::xid THEN
  RAISE EXCEPTION 'source content must share original transaction' USING ERRCODE='23514';END IF;
 SELECT * INTO p FROM fabric.storage_head_publications WHERE tenant_id=t AND space_id=s AND actor_id=a AND command_key=k;
 IF NOT FOUND OR p.class<>'source' OR p.expires_at<=clock_timestamp()
  OR NOT EXISTS(SELECT 1 FROM fabric.storage_epoch_publications x WHERE x.tenant_id=t AND x.space_id=s AND x.actor_id=a AND x.command_key=k AND x.expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'source content original denied' USING ERRCODE='23514';END IF;
 IF ct IS NULL OR octet_length(ct)>1500000 THEN RAISE EXCEPTION 'source content bounds denied' USING ERRCODE='23514';END IF;
 e:=ct::jsonb;
 IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(e))<>12
  OR NOT(e ?& ARRAY['schemaVersion','algorithm','tenantId','spaceId','class','id','revision','generation','keyId','nonce','tag','ciphertext']) THEN
  RAISE EXCEPTION 'source content envelope denied' USING ERRCODE='23514';END IF;
 -- Closed envelope has twelve fields. No descriptions or caller control fields.
 IF e->>'schemaVersion' IS DISTINCT FROM '1' OR e->>'algorithm' IS DISTINCT FROM 'AES-256-GCM' OR e->>'class' IS DISTINCT FROM 'source'
  OR e->>'tenantId' IS DISTINCT FROM t::text OR e->>'spaceId' IS DISTINCT FROM s::text OR e->>'id' IS DISTINCT FROM p.id::text
  OR e->>'revision' IS DISTINCT FROM p.revision::text OR e->>'generation' IS DISTINCT FROM p.generation::text OR e->>'keyId' IS DISTINCT FROM p.key_id::text
  OR jsonb_typeof(e->'nonce') IS DISTINCT FROM 'string' OR jsonb_typeof(e->'tag') IS DISTINCT FROM 'string' OR jsonb_typeof(e->'ciphertext') IS DISTINCT FROM 'string'
  OR e->>'nonce'!~'^[A-Za-z0-9+/]{16}$' OR e->>'tag'!~'^[A-Za-z0-9+/]{22}==$'
  OR e->>'ciphertext'!~'^[A-Za-z0-9+/]*={0,2}$'
  OR octet_length(decode(e->>'ciphertext','base64'))>1048576
  OR replace(encode(decode(e->>'ciphertext','base64'),'base64'),E'\n','') IS DISTINCT FROM e->>'ciphertext'
  OR p.witness<>'sha256:'||encode(sha256(convert_to(ct,'UTF8')),'hex') THEN
  RAISE EXCEPTION 'source content binding denied' USING ERRCODE='23514';END IF;
 INSERT INTO fabric.storage_sources VALUES(t,s,'source',p.id,p.revision,p.source_task_id,p.witness,p.key_id,p.generation,p.epoch,p.accepted_at,p.expires_at,a,k,ct);
END $$;
REVOKE ALL ON FUNCTION fabric.storage_publish_source_content(uuid,text) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_publish_source_content(uuid,text) TO fabric_controller;
