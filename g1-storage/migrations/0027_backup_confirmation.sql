-- Additive byte-first confirmation over the existing head/original protocol.
-- Descriptive archive metadata cannot install grants, epochs or restore state.
CREATE TABLE fabric.storage_backup_confirmations (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 class text NOT NULL DEFAULT 'backup' CHECK(class='backup'),id uuid NOT NULL,revision fabric.safe_amount NOT NULL CHECK(revision=1),
 source_task_id uuid NOT NULL,witness text NOT NULL,key_id uuid NOT NULL,generation uuid NOT NULL,
 epoch fabric.safe_amount NOT NULL,at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 captured_epoch fabric.safe_amount NOT NULL,captured_at timestamptz NOT NULL,root_id uuid NOT NULL,
 archive_bytes fabric.safe_amount NOT NULL,decoded_bytes fabric.safe_amount NOT NULL,item_count fabric.safe_amount NOT NULL,
 last_checkpoint timestamptz,binding_digest text NOT NULL,receipt_id uuid NOT NULL,job_id uuid NOT NULL,event_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),UNIQUE(tenant_id,space_id,id),
 UNIQUE(tenant_id,space_id,actor_id,command_key,id,revision,epoch,at,event_id),
 CHECK(captured_epoch=epoch-1 AND captured_epoch>0 AND archive_bytes>0 AND archive_bytes<=134217728
  AND decoded_bytes<=67108864 AND item_count<=1024 AND isfinite(captured_at) AND isfinite(at)
  AND isfinite(expires_at) AND captured_at<=at AND at<expires_at AND (last_checkpoint IS NULL OR isfinite(last_checkpoint))),
 FOREIGN KEY(tenant_id,space_id,class,id,revision,source_task_id) REFERENCES fabric.storage_entities(tenant_id,space_id,class,id,revision,source_task_id),
 FOREIGN KEY(tenant_id,space_id,class,id,revision,witness,key_id,generation,epoch,at,expires_at) REFERENCES fabric.storage_current_heads(tenant_id,space_id,class,id,revision,witness,key_id,generation,epoch,accepted_at,expires_at),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_head_publications,
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,binding_digest,receipt_id,epoch,at) REFERENCES fabric.storage_commands(tenant_id,space_id,actor_id,command_key,binding_digest,receipt_id,epoch,at),
 FOREIGN KEY(tenant_id,space_id,job_id,actor_id,command_key,class,id,revision,epoch,at) REFERENCES fabric.storage_outbox(tenant_id,space_id,job_id,actor_id,command_key,class,target_id,target_revision,epoch,at)
);
CREATE TABLE fabric.storage_backup_events (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 id uuid NOT NULL,revision fabric.safe_amount NOT NULL,epoch fabric.safe_amount NOT NULL,at timestamptz NOT NULL,event_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind='backup-confirmed'),PRIMARY KEY(tenant_id,space_id,event_id),
 UNIQUE(tenant_id,space_id,actor_id,command_key,id,revision,epoch,at,event_id),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,id,revision,epoch,at,event_id) REFERENCES fabric.storage_backup_confirmations(tenant_id,space_id,actor_id,command_key,id,revision,epoch,at,event_id)
);
ALTER TABLE fabric.storage_backup_confirmations ADD FOREIGN KEY(tenant_id,space_id,actor_id,command_key,id,revision,epoch,at,event_id)
 REFERENCES fabric.storage_backup_events(tenant_id,space_id,actor_id,command_key,id,revision,epoch,at,event_id) DEFERRABLE INITIALLY DEFERRED;
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['storage_backup_confirmations','storage_backup_events'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY storage_control_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
CREATE FUNCTION fabric.storage_confirm_backup(k uuid,root uuid,captured numeric,captured_at timestamptz,
 archive_bytes numeric,decoded_bytes numeric,item_count numeric,checkpoint timestamptz,receipt uuid,job uuid,event uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 p fabric.storage_head_publications%ROWTYPE;authority jsonb;publication_xid xid;b text;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'backup scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["storage-epoch-original","%s","%s","%s","%s"]',t,sp,a,k),0));
 SELECT xmin INTO publication_xid FROM fabric.storage_head_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 IF publication_xid IS DISTINCT FROM (txid_current()%4294967296)::text::xid THEN
  RAISE EXCEPTION 'backup must share original transaction' USING ERRCODE='23514';END IF;
 SELECT * INTO p FROM fabric.storage_head_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 authority:=fabric.controller_authority();
 IF p.class IS DISTINCT FROM 'backup' OR p.revision IS DISTINCT FROM 1 OR p.expected_revision IS NOT NULL
  OR p.expires_at<=clock_timestamp() OR authority IS NULL
  OR NOT(authority->'grants' ?& ARRAY['storage:backup','storage:read','storage:write','storage:maintenance','task:write'])
  OR NOT EXISTS(SELECT 1 FROM fabric.storage_epoch_publications x JOIN fabric.storage_authority_epoch e USING(tenant_id,space_id,epoch,anchor_id)
   JOIN fabric.storage_policy policy ON (policy.tenant_id,policy.space_id,policy.revision)=(e.tenant_id,e.space_id,e.policy_revision)
   WHERE x.tenant_id=t AND x.space_id=sp AND x.actor_id=a AND x.command_key=k AND x.expires_at>clock_timestamp()
    AND policy.operations ?& ARRAY['backup','read','write','maintenance']) THEN
  RAISE EXCEPTION 'backup original denied' USING ERRCODE='23514';END IF;
 SELECT binding_digest INTO b FROM fabric.storage_epoch_publications WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 INSERT INTO fabric.storage_commands VALUES(t,sp,a,k,b,receipt,p.epoch,p.accepted_at);
 INSERT INTO fabric.storage_outbox VALUES(t,sp,job,a,k,'backup',p.id,1,p.epoch,p.accepted_at);
 INSERT INTO fabric.storage_backup_confirmations VALUES(t,sp,a,k,'backup',p.id,1,p.source_task_id,p.witness,p.key_id,p.generation,
  p.epoch,p.accepted_at,p.expires_at,captured,captured_at,root,archive_bytes,decoded_bytes,item_count,checkpoint,b,receipt,job,event);
 INSERT INTO fabric.storage_backup_events VALUES(t,sp,a,k,p.id,1,p.epoch,p.accepted_at,event,'backup-confirmed');
END $$;
REVOKE ALL ON FUNCTION fabric.storage_confirm_backup(uuid,uuid,numeric,timestamptz,numeric,numeric,numeric,timestamptz,uuid,uuid,uuid) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_confirm_backup(uuid,uuid,numeric,timestamptz,numeric,numeric,numeric,timestamptz,uuid,uuid,uuid) TO fabric_controller;
