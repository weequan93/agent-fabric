-- Explicit trusted same-tenant sharing controls; excluded from content restore.
-- Only the owned enrollment fixture writes these tables in this slice.
ALTER TABLE fabric.storage_entities ADD UNIQUE(tenant_id,space_id,class,id,revision,source_task_id);
CREATE TABLE fabric.storage_shares (
 tenant_id uuid NOT NULL,destination_space_id uuid NOT NULL,relation_id uuid NOT NULL,
 revision fabric.safe_amount NOT NULL CHECK(revision>0),source_space_id uuid NOT NULL,
 class text NOT NULL DEFAULT 'source' CHECK(class='source'),source_id uuid NOT NULL,
 source_revision fabric.safe_amount NOT NULL CHECK(source_revision>0),source_task_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN('active','revoked')),
 source_epoch fabric.safe_amount NOT NULL CHECK(source_epoch>0),destination_epoch fabric.safe_amount NOT NULL CHECK(destination_epoch>0),
 PRIMARY KEY(tenant_id,destination_space_id,relation_id,revision),CHECK(source_space_id<>destination_space_id),
 FOREIGN KEY(tenant_id,source_space_id,class,source_id,source_revision,source_task_id)
  REFERENCES fabric.storage_entities(tenant_id,space_id,class,id,revision,source_task_id),
 FOREIGN KEY(tenant_id,destination_space_id) REFERENCES fabric.storage_rooms(tenant_id,space_id),
 FOREIGN KEY(tenant_id,source_space_id,source_epoch) REFERENCES fabric.storage_authority_epoch DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,destination_space_id,destination_epoch) REFERENCES fabric.storage_authority_epoch DEFERRABLE INITIALLY DEFERRED
);
CREATE FUNCTION fabric.storage_share_append_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE s uuid;previous fabric.storage_shares%ROWTYPE;
BEGIN
 FOR s IN SELECT x FROM unnest(ARRAY[NEW.source_space_id,NEW.destination_space_id]) x ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',NEW.tenant_id,s),0));
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM fabric.storage_rooms WHERE tenant_id=NEW.tenant_id AND space_id=NEW.source_space_id AND kind IN('group','share'))
 OR NOT EXISTS(SELECT 1 FROM fabric.storage_rooms WHERE tenant_id=NEW.tenant_id AND space_id=NEW.destination_space_id AND kind IN('group','share'))
 THEN RAISE EXCEPTION 'unsupported sharing room' USING ERRCODE='23514';END IF;
 SELECT * INTO previous FROM fabric.storage_shares WHERE tenant_id=NEW.tenant_id AND destination_space_id=NEW.destination_space_id AND relation_id=NEW.relation_id ORDER BY revision DESC LIMIT 1;
 IF (NOT FOUND AND (NEW.revision<>1 OR NEW.status<>'active')) OR
 (FOUND AND (NEW.revision<>previous.revision+1 OR previous.status='revoked' OR NEW.status<>'revoked'
 OR (NEW.source_space_id,NEW.class,NEW.source_id,NEW.source_revision,NEW.source_task_id)
 IS DISTINCT FROM (previous.source_space_id,previous.class,previous.source_id,previous.source_revision,previous.source_task_id)))
 THEN RAISE EXCEPTION 'sharing binding or sequence denied' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER storage_share_append_guard BEFORE INSERT ON fabric.storage_shares FOR EACH ROW EXECUTE FUNCTION fabric.storage_share_append_guard();
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_shares FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
ALTER TABLE fabric.storage_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_shares FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_share_destination_scope ON fabric.storage_shares
 USING(fabric.service_scope(tenant_id,destination_space_id)) WITH CHECK(fabric.service_scope(tenant_id,destination_space_id));
REVOKE ALL ON fabric.storage_shares FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_shares TO fabric_controller;
-- Narrow opaque control bridge. It does not change the caller's GUCs, grant
-- source-table access, return content, or accept a caller-selected source scope.
-- The unchanged F02 audience function locks every member and both payers.
CREATE FUNCTION fabric.storage_shared_controls(relation uuid) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE r fabric.storage_shares%ROWTYPE;t uuid:=fabric.current_tenant();s uuid;p numeric;
 audience jsonb;controls json[]:=ARRAY[]::json[];latest json;
BEGIN
 IF current_setting('app.identity_verified',true) IS DISTINCT FROM 'true' OR t IS NULL OR fabric.current_identity() IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO r FROM fabric.storage_shares WHERE tenant_id=t AND destination_space_id=fabric.current_space() AND relation_id=relation ORDER BY revision DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 FOR s IN SELECT x FROM unnest(ARRAY[r.source_space_id,r.destination_space_id]) x ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,s),0));
 END LOOP;
 -- The binding is immutable across revisions; reload status after the wait.
 SELECT * INTO r FROM fabric.storage_shares WHERE tenant_id=t AND destination_space_id=fabric.current_space() AND relation_id=relation ORDER BY revision DESC LIMIT 1;
 IF r.status<>'active' THEN RETURN NULL;END IF;
 audience:=fabric.identity_audience(r.source_space_id,r.destination_space_id,r.source_task_id);
 IF audience IS NULL OR jsonb_array_length(audience)=0 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audience) a WHERE a->>'actorId'=fabric.current_identity()::text)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(audience) a WHERE (a->>'actorRevoked')::boolean OR (a->>'sourceRevoked')::boolean
 OR a->>'sourceRevision' IS NULL OR jsonb_typeof(a->'sourceGrants') IS DISTINCT FROM 'array' OR NOT (a->'sourceGrants' ? 'task:read')) THEN RETURN NULL;END IF;
 s:=r.source_space_id;
 SELECT row_to_json(e) INTO latest FROM (SELECT epoch::text AS epoch,anchor_id,policy_revision::text AS policy_revision,control_digest FROM fabric.storage_authority_epoch WHERE tenant_id=t AND space_id=s ORDER BY epoch DESC LIMIT 1)e;
 IF latest IS NULL THEN RETURN NULL;END IF;p:=(latest->>'policy_revision')::numeric;
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT kind FROM fabric.storage_rooms WHERE tenant_id=t AND space_id=s LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT revision::text AS revision,periods,operations FROM fabric.storage_policy WHERE tenant_id=t AND space_id=s AND revision=p LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT class,id,revision::text AS revision,witness,key_id,generation,epoch::text AS epoch,accepted_at,expires_at FROM fabric.storage_current_heads WHERE tenant_id=t AND space_id=s ORDER BY class,id,storage_current_heads.revision LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT class,id,revision::text AS revision,epoch::text AS epoch,command_key,at FROM fabric.storage_tombstones WHERE tenant_id=t AND space_id=s ORDER BY class,id,storage_tombstones.revision LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT source_id,source_revision::text AS source_revision,epoch::text AS epoch,kind,at FROM fabric.storage_restrictions WHERE tenant_id=t AND space_id=s ORDER BY source_id,storage_restrictions.source_revision,kind LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT actor_id,command_key,binding_digest,receipt_id,epoch::text AS epoch,at FROM fabric.storage_commands WHERE tenant_id=t AND space_id=s ORDER BY actor_id,command_key LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT job_id,actor_id,command_key,class,target_id,target_revision::text AS target_revision,epoch::text AS epoch,at FROM fabric.storage_outbox WHERE tenant_id=t AND space_id=s ORDER BY job_id LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT relation_id,revision::text AS revision,source_space_id,source_id,source_revision::text AS source_revision,source_task_id,status,source_epoch::text AS source_epoch,destination_epoch::text AS destination_epoch FROM fabric.storage_shares WHERE tenant_id=t AND destination_space_id=s ORDER BY relation_id,storage_shares.revision LIMIT 513)q));
 RETURN json_build_object('relation',row_to_json(r),'epoch',latest,'controls',array_to_json(controls));
END $$;
REVOKE ALL ON FUNCTION fabric.storage_share_append_guard(),fabric.storage_shared_controls(uuid) FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_shared_controls(uuid) TO fabric_controller;
