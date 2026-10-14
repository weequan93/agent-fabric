-- F05 current authority is NOT content-generation data and is never restored.
-- Enrollment in this slice belongs only to the owned synthetic fixture. Future
-- canonical owners must advance the independently witnessed epoch at commit.
CREATE TABLE fabric.storage_rooms (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('personal','group','share')),
 PRIMARY KEY(tenant_id,space_id),FOREIGN KEY(tenant_id,space_id) REFERENCES fabric.spaces
);
CREATE TABLE fabric.storage_policy (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,revision fabric.safe_amount NOT NULL CHECK(revision>0),
 periods jsonb NOT NULL,operations jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,revision),FOREIGN KEY(tenant_id,space_id) REFERENCES fabric.storage_rooms,
 CHECK(jsonb_typeof(periods)='object'),CHECK(jsonb_typeof(operations)='array')
);
CREATE TABLE fabric.storage_entities (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,class text NOT NULL CHECK(class IN
 ('source','knowledge','artifact','draft','live-file','checkpoint','summary','index','cache','ask','backup')),
 id uuid NOT NULL,revision fabric.safe_amount NOT NULL CHECK(revision>0),source_task_id uuid,
 PRIMARY KEY(tenant_id,space_id,class,id,revision),
 FOREIGN KEY(tenant_id,space_id) REFERENCES fabric.storage_rooms,
 FOREIGN KEY(tenant_id,space_id,source_task_id) REFERENCES fabric.tasks(tenant_id,space_id,task_id),
 CHECK(class<>'source' OR source_task_id IS NOT NULL)
);
CREATE TABLE fabric.storage_current_heads (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,class text NOT NULL,id uuid NOT NULL,
 revision fabric.safe_amount NOT NULL CHECK(revision>0),witness text NOT NULL CHECK(witness ~ '^sha256:[0-9a-f]{64}$'),
 key_id uuid NOT NULL,generation uuid NOT NULL,epoch fabric.safe_amount NOT NULL CHECK(epoch>0),accepted_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,space_id,class,id,revision),
 FOREIGN KEY(tenant_id,space_id,class,id,revision) REFERENCES fabric.storage_entities,
 CHECK(expires_at>accepted_at AND expires_at<'infinity'::timestamptz)
);
CREATE TABLE fabric.storage_tombstones (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,class text NOT NULL,id uuid NOT NULL,
 revision fabric.safe_amount NOT NULL CHECK(revision>0),epoch fabric.safe_amount NOT NULL CHECK(epoch>0),
 command_key uuid NOT NULL,at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,space_id,class,id,revision),
 FOREIGN KEY(tenant_id,space_id,class,id,revision) REFERENCES fabric.storage_entities
);
CREATE TABLE fabric.storage_restrictions (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,class text NOT NULL DEFAULT 'source' CHECK(class='source'),
 source_id uuid NOT NULL,source_revision fabric.safe_amount NOT NULL CHECK(source_revision>0),
 epoch fabric.safe_amount NOT NULL CHECK(epoch>0),kind text NOT NULL CHECK(kind IN('revoked','expired','deleted','superseded')),
 at timestamptz NOT NULL,PRIMARY KEY(tenant_id,space_id,source_id,source_revision,kind),
 FOREIGN KEY(tenant_id,space_id,class,source_id,source_revision) REFERENCES fabric.storage_entities
);
CREATE TABLE fabric.storage_commands (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 binding_digest text NOT NULL CHECK(binding_digest ~ '^sha256:[0-9a-f]{64}$'),receipt_id uuid NOT NULL,
 epoch fabric.safe_amount NOT NULL CHECK(epoch>0),at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),UNIQUE(tenant_id,space_id,receipt_id),
 FOREIGN KEY(tenant_id,space_id) REFERENCES fabric.storage_rooms,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES fabric.actors
);
CREATE TABLE fabric.storage_outbox (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,job_id uuid NOT NULL,actor_id uuid NOT NULL,
 command_key uuid NOT NULL,class text NOT NULL,target_id uuid NOT NULL,target_revision fabric.safe_amount NOT NULL,
 epoch fabric.safe_amount NOT NULL CHECK(epoch>0),at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,space_id,job_id),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_commands,
 FOREIGN KEY(tenant_id,space_id,class,target_id,target_revision) REFERENCES fabric.storage_entities
);
CREATE TABLE fabric.storage_authority_epoch (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,epoch fabric.safe_amount NOT NULL CHECK(epoch>0),
 anchor_id uuid NOT NULL,policy_revision fabric.safe_amount NOT NULL CHECK(policy_revision>0),
 control_digest text NOT NULL CHECK(control_digest ~ '^sha256:[0-9a-f]{64}$'),at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,space_id,epoch),UNIQUE(tenant_id,space_id,anchor_id),
 FOREIGN KEY(tenant_id,space_id,policy_revision) REFERENCES fabric.storage_policy
);
ALTER TABLE fabric.storage_current_heads ADD FOREIGN KEY(tenant_id,space_id,epoch)
 REFERENCES fabric.storage_authority_epoch DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE fabric.storage_tombstones ADD FOREIGN KEY(tenant_id,space_id,epoch)
 REFERENCES fabric.storage_authority_epoch DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE fabric.storage_restrictions ADD FOREIGN KEY(tenant_id,space_id,epoch)
 REFERENCES fabric.storage_authority_epoch DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE fabric.storage_commands ADD FOREIGN KEY(tenant_id,space_id,epoch)
 REFERENCES fabric.storage_authority_epoch DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE fabric.storage_outbox ADD FOREIGN KEY(tenant_id,space_id,epoch)
 REFERENCES fabric.storage_authority_epoch DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION fabric.storage_epoch_append_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE previous numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',NEW.tenant_id,NEW.space_id),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array('storage-epoch',NEW.tenant_id,NEW.space_id)::text,0));
 SELECT coalesce(max(epoch),0) INTO previous FROM fabric.storage_authority_epoch
 WHERE tenant_id=NEW.tenant_id AND space_id=NEW.space_id;
 IF NEW.epoch<>previous+1 THEN RAISE EXCEPTION 'storage epoch sequence denied' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
-- Fixed, bounded transport for the existing current-control digest. Invoker
-- rights and existing table RLS remain the authority; this installs no new
-- table privilege, scope assertion, caller SQL or mutating capability.
CREATE FUNCTION fabric.storage_current_controls(p_tenant uuid,p_space uuid,p_policy_revision numeric)
RETURNS TABLE(controls json,sharing_error json)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,fabric AS $$
DECLARE core json[];sharing json;error_code text;error_message text;error_detail text;error_hint text;error_context text;
BEGIN
 SELECT ARRAY[
  (SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM
   (SELECT kind FROM fabric.storage_rooms WHERE tenant_id=p_tenant AND space_id=p_space LIMIT 513) q),
  (SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM
   (SELECT revision::text AS revision,periods,operations FROM fabric.storage_policy
    WHERE tenant_id=p_tenant AND space_id=p_space AND revision=p_policy_revision LIMIT 513) q),
  (SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM
   (SELECT class,id,revision::text AS revision,witness,key_id,generation,epoch::text AS epoch,accepted_at,expires_at
    FROM fabric.storage_current_heads WHERE tenant_id=p_tenant AND space_id=p_space
    ORDER BY class,id,storage_current_heads.revision LIMIT 513) q),
  (SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM
   (SELECT class,id,revision::text AS revision,epoch::text AS epoch,command_key,at
    FROM fabric.storage_tombstones WHERE tenant_id=p_tenant AND space_id=p_space
    ORDER BY class,id,storage_tombstones.revision LIMIT 513) q),
  (SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM
   (SELECT source_id,source_revision::text AS source_revision,epoch::text AS epoch,kind,at
    FROM fabric.storage_restrictions WHERE tenant_id=p_tenant AND space_id=p_space
    ORDER BY source_id,storage_restrictions.source_revision,kind LIMIT 513) q),
  (SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM
   (SELECT actor_id,command_key,binding_digest,receipt_id,epoch::text AS epoch,at
    FROM fabric.storage_commands WHERE tenant_id=p_tenant AND space_id=p_space
    ORDER BY actor_id,command_key LIMIT 513) q),
  (SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM
   (SELECT job_id,actor_id,command_key,class,target_id,target_revision::text AS target_revision,epoch::text AS epoch,at
    FROM fabric.storage_outbox WHERE tenant_id=p_tenant AND space_id=p_space ORDER BY job_id LIMIT 513) q)
 ] INTO core;
 controls=json_build_array(core[1],core[2],core[3],core[4],core[5],core[6],core[7]);
 sharing_error=NULL;
 -- Sharing is optional until 0003 is installed. Its only dynamic statement is
 -- fixed text with typed bind parameters, so 0002 also works without the table.
 -- Defer errors so the client can reject oversized/nonfinite core controls
 -- first, exactly as the historical seven-projection then sharing sequence did.
 BEGIN
  IF to_regclass('fabric.storage_shares') IS NOT NULL THEN
   EXECUTE 'SELECT coalesce(json_agg(row_to_json(q)),''[]''::json) FROM
    (SELECT relation_id,revision::text AS revision,source_space_id,source_id,source_revision::text AS source_revision,
     source_task_id,status,source_epoch::text AS source_epoch,destination_epoch::text AS destination_epoch
     FROM fabric.storage_shares WHERE tenant_id=$1 AND destination_space_id=$2
     ORDER BY relation_id,storage_shares.revision LIMIT 513) q'
    INTO sharing USING p_tenant,p_space;
   controls=json_build_array(core[1],core[2],core[3],core[4],core[5],core[6],core[7],sharing);
  END IF;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_code=RETURNED_SQLSTATE,error_message=MESSAGE_TEXT,
   error_detail=PG_EXCEPTION_DETAIL,error_hint=PG_EXCEPTION_HINT,error_context=PG_EXCEPTION_CONTEXT;
  sharing_error=json_build_object('code',error_code,'message',error_message,'detail',error_detail,'hint',error_hint,'where',error_context);
 END;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION fabric.storage_current_controls(uuid,uuid,numeric) FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_current_controls(uuid,uuid,numeric) TO fabric_controller;
CREATE TRIGGER storage_epoch_append_guard BEFORE INSERT ON fabric.storage_authority_epoch
 FOR EACH ROW EXECUTE FUNCTION fabric.storage_epoch_append_guard();
REVOKE ALL ON FUNCTION fabric.storage_epoch_append_guard() FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['storage_rooms','storage_policy','storage_entities','storage_current_heads',
 'storage_tombstones','storage_restrictions','storage_commands','storage_outbox','storage_authority_epoch'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY storage_control_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
