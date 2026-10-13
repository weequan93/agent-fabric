-- Trusted same-tenant source-sharing admission and immutable original marker.
-- Prior migrations/functions/digest encodings remain unchanged.
CREATE FUNCTION fabric.storage_share_candidate(source_space uuid,target uuid,rev numeric) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();dest uuid:=fabric.current_space();s uuid;p numeric;
 audience jsonb;controls json[]:=ARRAY[]::json[];latest json;origin uuid;
BEGIN
 IF NOT fabric.service_scope(t,dest) OR source_space IS NULL OR source_space=dest THEN RETURN NULL;END IF;
 FOR s IN SELECT x FROM unnest(ARRAY[source_space,dest]) x ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,s),0));
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM fabric.storage_rooms WHERE tenant_id=t AND space_id=source_space AND kind IN('group','share'))
  OR NOT EXISTS(SELECT 1 FROM fabric.storage_rooms WHERE tenant_id=t AND space_id=dest AND kind IN('group','share')) THEN RETURN NULL;END IF;
 SELECT source_task_id INTO origin FROM fabric.storage_entities WHERE tenant_id=t AND space_id=source_space AND class='source' AND id=target AND revision=rev;
 IF origin IS NULL THEN RETURN NULL;END IF;
 audience:=fabric.identity_audience(source_space,dest,origin);
 IF audience IS NULL OR jsonb_array_length(audience)=0 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audience) x WHERE x->>'actorId'=fabric.current_identity()::text)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(audience) x WHERE (x->>'actorRevoked')::boolean IS DISTINCT FROM false OR (x->>'sourceRevoked')::boolean IS DISTINCT FROM false
  OR x->>'sourceRevision' IS NULL OR jsonb_typeof(x->'sourceGrants') IS DISTINCT FROM 'array' OR NOT(x->'sourceGrants' ? 'task:read'))
 OR NOT EXISTS(SELECT 1 FROM fabric.memberships WHERE tenant_id=t AND space_id=source_space AND actor_id=fabric.current_identity() AND revoked_at IS NULL AND grants ?& ARRAY['task:write','storage:share']) THEN RETURN NULL;END IF;
 s:=source_space;
 SELECT row_to_json(e) INTO latest FROM (SELECT epoch::text AS epoch,anchor_id,policy_revision::text AS policy_revision,control_digest FROM fabric.storage_authority_epoch WHERE tenant_id=t AND space_id=s ORDER BY storage_authority_epoch.epoch DESC LIMIT 1)e;
 IF latest IS NULL THEN RETURN NULL;END IF;p:=(latest->>'policy_revision')::numeric;
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT kind FROM fabric.storage_rooms WHERE tenant_id=t AND space_id=s LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT revision::text AS revision,periods,operations FROM fabric.storage_policy WHERE tenant_id=t AND space_id=s AND revision=p LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT class,id,revision::text AS revision,witness,key_id,generation,epoch::text AS epoch,accepted_at,expires_at FROM fabric.storage_current_heads WHERE tenant_id=t AND space_id=s ORDER BY class,id,storage_current_heads.revision LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT class,id,revision::text AS revision,epoch::text AS epoch,command_key,at FROM fabric.storage_tombstones WHERE tenant_id=t AND space_id=s ORDER BY class,id,storage_tombstones.revision LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT source_id,source_revision::text AS source_revision,epoch::text AS epoch,kind,at FROM fabric.storage_restrictions WHERE tenant_id=t AND space_id=s ORDER BY source_id,storage_restrictions.source_revision,kind LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT actor_id,command_key,binding_digest,receipt_id,epoch::text AS epoch,at FROM fabric.storage_commands WHERE tenant_id=t AND space_id=s ORDER BY actor_id,command_key LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT job_id,actor_id,command_key,class,target_id,target_revision::text AS target_revision,epoch::text AS epoch,at FROM fabric.storage_outbox WHERE tenant_id=t AND space_id=s ORDER BY job_id LIMIT 513)q));
 controls:=array_append(controls,(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT relation_id,revision::text AS revision,source_space_id,source_id,source_revision::text AS source_revision,source_task_id,status,source_epoch::text AS source_epoch,destination_epoch::text AS destination_epoch FROM fabric.storage_shares WHERE tenant_id=t AND destination_space_id=s ORDER BY relation_id,storage_shares.revision LIMIT 513)q));
 RETURN json_build_object('source_task_id',origin,'epoch',latest,'controls',array_to_json(controls));
END $$;
REVOKE ALL ON FUNCTION fabric.storage_share_candidate(uuid,uuid,numeric) FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_share_candidate(uuid,uuid,numeric) TO fabric_controller;
ALTER TABLE fabric.storage_shares ADD UNIQUE(tenant_id,destination_space_id,relation_id,revision,source_space_id,source_id,source_revision,source_task_id,status,source_epoch,destination_epoch);
CREATE TABLE fabric.storage_share_publications (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,material_id uuid NOT NULL,
 relation_id uuid NOT NULL,revision fabric.safe_amount NOT NULL CHECK(revision=1),source_space_id uuid NOT NULL,
 source_id uuid NOT NULL,source_revision fabric.safe_amount NOT NULL,source_task_id uuid NOT NULL,witness text NOT NULL,
 class text NOT NULL DEFAULT 'source' CHECK(class='source'),status text NOT NULL CHECK(status='active'),source_epoch fabric.safe_amount NOT NULL,destination_epoch fabric.safe_amount NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),UNIQUE(tenant_id,space_id,material_id),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_epoch_publications,
 FOREIGN KEY(tenant_id,space_id,relation_id,revision,source_space_id,source_id,source_revision,source_task_id,status,source_epoch,destination_epoch)
  REFERENCES fabric.storage_shares(tenant_id,destination_space_id,relation_id,revision,source_space_id,source_id,source_revision,source_task_id,status,source_epoch,destination_epoch),
 FOREIGN KEY(tenant_id,source_space_id,class,source_id,source_revision,witness)
  REFERENCES fabric.storage_current_heads(tenant_id,space_id,class,id,revision,witness)
);
ALTER TABLE fabric.storage_share_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_share_publications FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_share_publications USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_share_publications FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_share_publications FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_share_publications TO fabric_controller;
CREATE FUNCTION fabric.storage_publish_share(k uuid,b text,sid uuid,previous numeric,old_anchor uuid,new_anchor uuid,
 old_digest text,new_digest text,material uuid,relation uuid,source_space uuid,target uuid,rev numeric,w text,source_epoch numeric,expires timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();dest uuid:=fabric.current_space();a uuid:=fabric.current_identity();s uuid;
 e fabric.storage_authority_epoch%ROWTYPE;authority jsonb;admission jsonb;c json;h json;origin uuid;
BEGIN
 IF NOT fabric.service_scope(t,dest) OR source_space IS NULL OR source_space=dest THEN RAISE EXCEPTION 'storage share scope denied' USING ERRCODE='42501';END IF;
 FOR s IN SELECT x FROM unnest(ARRAY[source_space,dest]) x ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,s),0));
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["storage-epoch-original","%s","%s","%s","%s"]',t,dest,a,k),0));
 authority:=fabric.controller_authority();
 IF authority IS NULL OR jsonb_typeof(authority->'grants') IS DISTINCT FROM 'array'
 OR NOT(authority->'grants' ?& ARRAY['storage:maintenance','task:write','storage:share'])
 OR authority->>'lifecycle'<>'active' OR (authority->>'actorRevoked')::boolean OR (authority->>'payerRevoked')::boolean OR (authority->>'membershipRevoked')::boolean
 OR expires IS NULL OR NOT isfinite(expires) OR expires<=clock_timestamp() THEN RAISE EXCEPTION 'storage share authority denied' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM fabric.storage_authority_epoch WHERE tenant_id=t AND space_id=dest ORDER BY epoch DESC LIMIT 1;
 IF NOT FOUND OR e.epoch IS DISTINCT FROM previous OR e.anchor_id IS DISTINCT FROM old_anchor OR e.control_digest IS DISTINCT FROM old_digest THEN RAISE EXCEPTION 'storage share epoch stale' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM fabric.storage_policy WHERE tenant_id=t AND space_id=dest AND revision=e.policy_revision AND operations ?& ARRAY['maintenance','read','share']) THEN RAISE EXCEPTION 'storage share policy denied' USING ERRCODE='42501';END IF;
 c:=fabric.storage_share_candidate(source_space,target,rev);
 IF c IS NULL OR (c->'epoch'->>'epoch')::numeric IS DISTINCT FROM source_epoch THEN RAISE EXCEPTION 'storage share source denied' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM json_array_elements(c->'controls'->1) p WHERE (p->'operations')::jsonb @> '["read","share"]'::jsonb) THEN RAISE EXCEPTION 'storage share source policy denied' USING ERRCODE='42501';END IF;
 SELECT x INTO h FROM json_array_elements(c->'controls'->2) x WHERE x->>'class'='source' AND (x->>'id')::uuid=target ORDER BY (x->>'revision')::numeric DESC LIMIT 1;
 IF h IS NULL OR (h->>'revision')::numeric IS DISTINCT FROM rev OR h->>'witness' IS DISTINCT FROM w OR (h->>'expires_at')::timestamptz<=clock_timestamp()
 OR EXISTS(SELECT 1 FROM fabric.storage_tombstones WHERE tenant_id=t AND space_id=source_space AND class='source' AND id=target AND revision>=rev)
 OR EXISTS(SELECT 1 FROM fabric.storage_restrictions WHERE tenant_id=t AND space_id=source_space AND source_id=target AND source_revision=rev) THEN RAISE EXCEPTION 'storage share source stale' USING ERRCODE='23514';END IF;
 origin:=(c->>'source_task_id')::uuid;
 SELECT n.admission INTO admission FROM fabric.model_native_controls n JOIN fabric.model_sessions m USING(tenant_id,space_id,session_id)
 WHERE n.tenant_id=t AND n.space_id=dest AND n.session_id=sid AND m.binding->>'actorId'=a::text AND m.binding->>'intent'='Ask' AND m.binding->>'purpose'='maintenance';
 IF admission IS NULL OR admission->>'executionClass'<>'service' OR admission->>'resourceId' IS NOT NULL OR admission->>'computerCapability' IS NOT NULL
 OR (admission->>'targetEffect')::boolean OR (admission->>'approvalRequired')::boolean THEN RAISE EXCEPTION 'storage share native denied' USING ERRCODE='42501';END IF;
 INSERT INTO fabric.storage_shares VALUES(t,dest,relation,1,source_space,'source',target,rev,origin,'active',source_epoch,previous+1);
 INSERT INTO fabric.storage_authority_epoch VALUES(t,dest,previous+1,new_anchor,e.policy_revision,new_digest,clock_timestamp());
 INSERT INTO fabric.storage_epoch_publications VALUES(t,dest,a,k,b,sid,previous,previous+1,new_anchor,expires,clock_timestamp());
 INSERT INTO fabric.storage_share_publications VALUES(t,dest,a,k,material,relation,1,source_space,target,rev,origin,w,'source','active',source_epoch,previous+1);
END $$;
REVOKE ALL ON FUNCTION fabric.storage_publish_share(uuid,text,uuid,numeric,uuid,uuid,text,text,uuid,uuid,uuid,uuid,numeric,text,numeric,timestamptz) FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_publish_share(uuid,text,uuid,numeric,uuid,uuid,text,text,uuid,uuid,uuid,uuid,numeric,text,numeric,timestamptz) TO fabric_controller;
