-- Accepted-head controls; no payload/save or descendant-completion claim.
-- Preserve historical migrations and digest encoding. Exact marker FKs bind all
-- material controls and installed Task lineage outside restorable generations.
ALTER TABLE fabric.storage_entities ADD UNIQUE(tenant_id,space_id,class,id,revision,source_task_id);
ALTER TABLE fabric.storage_current_heads ADD UNIQUE(tenant_id,space_id,class,id,revision,witness);
ALTER TABLE fabric.storage_current_heads ADD UNIQUE(tenant_id,space_id,class,id,revision,witness,key_id,generation,epoch,accepted_at,expires_at);
CREATE TABLE fabric.storage_head_publications (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,material_id uuid NOT NULL,
 class text NOT NULL,id uuid NOT NULL,revision fabric.safe_amount NOT NULL,source_task_id uuid NOT NULL,
 witness text NOT NULL,key_id uuid NOT NULL,generation uuid NOT NULL,epoch fabric.safe_amount NOT NULL,
 accepted_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,expected_revision fabric.safe_amount,expected_witness text,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),UNIQUE(tenant_id,space_id,material_id),UNIQUE(tenant_id,space_id,class,id,revision),
 CHECK((expected_revision IS NULL AND expected_witness IS NULL AND revision=1)
  OR(expected_revision IS NOT NULL AND expected_witness IS NOT NULL AND expected_revision>0 AND revision=expected_revision+1)),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_epoch_publications,
 FOREIGN KEY(tenant_id,space_id,class,id,revision,source_task_id) REFERENCES fabric.storage_entities(tenant_id,space_id,class,id,revision,source_task_id),
 FOREIGN KEY(tenant_id,space_id,class,id,revision,witness,key_id,generation,epoch,accepted_at,expires_at)
  REFERENCES fabric.storage_current_heads(tenant_id,space_id,class,id,revision,witness,key_id,generation,epoch,accepted_at,expires_at),
 FOREIGN KEY(tenant_id,space_id,class,id,expected_revision,expected_witness)
  REFERENCES fabric.storage_current_heads(tenant_id,space_id,class,id,revision,witness)
);
ALTER TABLE fabric.storage_head_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_head_publications FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_head_publications
 USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_head_publications
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_head_publications FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_head_publications TO fabric_controller;
CREATE FUNCTION fabric.storage_publish_head(k uuid,b text,sid uuid,previous numeric,old_anchor uuid,new_anchor uuid,
 old_digest text,new_digest text,material_id uuid,m jsonb,expected jsonb,recorded timestamptz,expires timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 e fabric.storage_authority_epoch%ROWTYPE;h fabric.storage_current_heads%ROWTYPE;authority jsonb;admission jsonb;
 cl text;target uuid;rev numeric;task uuid;w text;kid uuid;gen uuid;deadline timestamptz;old_rev numeric;old_w text;period numeric;audience jsonb;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'storage head scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["storage-epoch-original","%s","%s","%s","%s"]',t,sp,a,k),0));
 authority:=fabric.controller_authority();
 IF authority IS NULL OR jsonb_typeof(authority->'grants') IS DISTINCT FROM 'array'
  OR NOT(authority->'grants' ?& ARRAY['storage:maintenance','task:write','storage:write'])
  OR authority->>'lifecycle'<>'active' OR (authority->>'actorRevoked')::boolean
  OR (authority->>'payerRevoked')::boolean OR (authority->>'membershipRevoked')::boolean
  OR expires IS NULL OR expires<=clock_timestamp() OR NOT isfinite(expires)
  OR recorded IS NULL OR NOT isfinite(recorded) OR recorded>clock_timestamp() THEN
  RAISE EXCEPTION 'storage head authority denied' USING ERRCODE='42501';END IF;
 IF m IS NULL OR jsonb_typeof(m) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(m))<>10
  OR NOT(m ?& ARRAY['tenantId','spaceId','class','id','revision','witness','keyId','generation','sourceTaskId','expiresAt']) THEN
  RAISE EXCEPTION 'storage head material denied' USING ERRCODE='23514';END IF;
 -- HeadMaterial has ten fields. Fail closed for any absent/extra/null controls.
 IF (m->>'tenantId')::uuid IS DISTINCT FROM t OR (m->>'spaceId')::uuid IS DISTINCT FROM sp THEN
  RAISE EXCEPTION 'storage head material scope denied' USING ERRCODE='42501';END IF;
 cl:=m->>'class';target:=(m->>'id')::uuid;rev:=(m->>'revision')::numeric;task:=(m->>'sourceTaskId')::uuid;
 w:=m->>'witness';kid:=(m->>'keyId')::uuid;gen:=(m->>'generation')::uuid;deadline:=(m->>'expiresAt')::timestamptz;
 IF cl IS NULL OR cl NOT IN('source','knowledge','artifact','draft','live-file','checkpoint','summary','index','cache','ask','backup')
  OR target IS NULL OR rev IS NULL OR rev<1 OR rev<>trunc(rev) OR rev>9007199254740991 OR task IS NULL OR w IS NULL OR w!~'^sha256:[0-9a-f]{64}$'
  OR kid IS NULL OR gen IS NULL OR deadline IS NULL OR NOT isfinite(deadline) OR deadline<=clock_timestamp() OR deadline<=recorded THEN
  RAISE EXCEPTION 'storage head material values denied' USING ERRCODE='23514';END IF;
 SELECT * INTO e FROM fabric.storage_authority_epoch WHERE tenant_id=t AND space_id=sp ORDER BY epoch DESC LIMIT 1;
 IF NOT FOUND OR e.epoch IS DISTINCT FROM previous OR e.anchor_id IS DISTINCT FROM old_anchor OR e.control_digest IS DISTINCT FROM old_digest THEN
  RAISE EXCEPTION 'storage head epoch stale' USING ERRCODE='23514';END IF;
 SELECT (p.periods->>cl)::numeric INTO period FROM fabric.storage_policy p WHERE p.tenant_id=t AND p.space_id=sp AND p.revision=e.policy_revision AND p.operations ?& ARRAY['maintenance','write','read'];
 IF NOT FOUND OR period IS NULL OR period<=0 OR period>86400 OR deadline>recorded+period*interval '1 second' THEN
  RAISE EXCEPTION 'storage head retention denied' USING ERRCODE='23514';END IF;
 SELECT * INTO h FROM fabric.storage_current_heads WHERE tenant_id=t AND space_id=sp AND class=cl AND id=target ORDER BY storage_current_heads.revision DESC LIMIT 1;
 IF expected IS NULL OR expected='null'::jsonb THEN
  IF FOUND OR rev<>1 OR EXISTS(SELECT 1 FROM fabric.storage_entities x WHERE (x.tenant_id,x.space_id,x.class,x.id)=(t,sp,cl,target)) THEN
   RAISE EXCEPTION 'storage head initial revision denied' USING ERRCODE='23514';END IF;
 ELSE
  IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(expected))<>4
   OR NOT(expected ?& ARRAY['class','id','revision','witness']) OR expected->>'class' IS DISTINCT FROM cl OR (expected->>'id')::uuid IS DISTINCT FROM target THEN
   RAISE EXCEPTION 'storage head expected denied' USING ERRCODE='23514';END IF;
  old_rev:=(expected->>'revision')::numeric;old_w:=expected->>'witness';
  IF h.id IS NULL OR h.revision IS DISTINCT FROM old_rev OR h.witness IS DISTINCT FROM old_w OR rev IS DISTINCT FROM old_rev+1 OR h.expires_at<=clock_timestamp()
   OR EXISTS(SELECT 1 FROM fabric.storage_restrictions r WHERE cl='source' AND (r.tenant_id,r.space_id,r.source_id,r.source_revision)=(t,sp,target,old_rev)) THEN
   RAISE EXCEPTION 'storage head stale revision denied' USING ERRCODE='23514';END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM fabric.storage_tombstones d WHERE (d.tenant_id,d.space_id,d.class,d.id)=(t,sp,cl,target)) THEN
  RAISE EXCEPTION 'storage head tombstone denied' USING ERRCODE='23514';END IF;
 audience:=fabric.identity_audience(sp,sp,task);
 IF audience IS NULL OR jsonb_typeof(audience) IS DISTINCT FROM 'array' OR jsonb_array_length(audience)<1
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(audience) x WHERE (x->>'actorRevoked')::boolean IS DISTINCT FROM false OR (x->>'sourceRevoked')::boolean IS DISTINCT FROM false OR jsonb_typeof(x->'sourceGrants') IS DISTINCT FROM 'array' OR NOT(x->'sourceGrants' ? 'task:read'))
  OR NOT EXISTS(SELECT 1 FROM fabric.tasks x WHERE (x.tenant_id,x.space_id,x.task_id)=(t,sp,task)) THEN
  RAISE EXCEPTION 'storage head lineage denied' USING ERRCODE='42501';END IF;
 SELECT c.admission INTO admission FROM fabric.model_native_controls c JOIN fabric.model_sessions s USING(tenant_id,space_id,session_id)
 WHERE c.tenant_id=t AND c.space_id=sp AND c.session_id=sid AND s.binding->>'actorId'=a::text
  AND s.binding->>'intent'='Ask' AND s.binding->>'purpose'='maintenance';
 IF admission IS NULL OR admission->>'executionClass'<>'service' OR admission->>'resourceId' IS NOT NULL
  OR admission->>'computerCapability' IS NOT NULL OR (admission->>'targetEffect')::boolean OR (admission->>'approvalRequired')::boolean THEN
  RAISE EXCEPTION 'storage head native denied' USING ERRCODE='42501';END IF;
 INSERT INTO fabric.storage_entities VALUES(t,sp,cl,target,rev,task);
 INSERT INTO fabric.storage_current_heads VALUES(t,sp,cl,target,rev,w,kid,gen,previous+1,recorded,deadline);
 INSERT INTO fabric.storage_authority_epoch VALUES(t,sp,previous+1,new_anchor,e.policy_revision,new_digest,clock_timestamp());
 INSERT INTO fabric.storage_epoch_publications VALUES(t,sp,a,k,b,sid,previous,previous+1,new_anchor,expires,clock_timestamp());
 INSERT INTO fabric.storage_head_publications VALUES(t,sp,a,k,material_id,cl,target,rev,task,w,kid,gen,previous+1,recorded,deadline,old_rev,old_w);
END $$;
REVOKE ALL ON FUNCTION fabric.storage_publish_head(uuid,text,uuid,numeric,uuid,uuid,text,text,uuid,jsonb,jsonb,timestamptz,timestamptz)
 FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_publish_head(uuid,text,uuid,numeric,uuid,uuid,text,text,uuid,jsonb,jsonb,timestamptz,timestamptz) TO fabric_controller;

-- Preserve v1's definition and historical migration bytes. Its epoch text alias
-- sorted lexically (9 before10). New serving uses numeric current-epoch ordering;
-- control field order/encoding and historical digests are unchanged.
CREATE FUNCTION fabric.storage_shared_controls_v2(relation uuid) RETURNS json
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
 RETURN json_build_object('relation',row_to_json(r),'epoch',latest,'controls',array_to_json(controls));
END $$;
REVOKE ALL ON FUNCTION fabric.storage_shared_controls_v2(uuid) FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_shared_controls_v2(uuid) TO fabric_controller;
