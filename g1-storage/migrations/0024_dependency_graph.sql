-- Forward-only dependency owner. No canonical content/control rows are rewritten.
CREATE TABLE fabric.storage_graph_nodes (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,class text NOT NULL CHECK(class IN('source','knowledge','artifact','draft','summary','index','cache','ask')),
 id uuid NOT NULL,revision fabric.safe_amount NOT NULL CHECK(revision>0),witness text NOT NULL CHECK(witness ~ '^sha256:[0-9a-f]{64}$'),
 source_task_id uuid NOT NULL,key_id uuid NOT NULL,generation uuid NOT NULL,expires_at timestamptz NOT NULL,
 backing_class text,backing_id uuid,backing_revision fabric.safe_amount NOT NULL,backing_witness text,
 ask_id uuid,dependency_count integer NOT NULL CHECK(dependency_count BETWEEN 0 AND 64),dependency_digest text NOT NULL,
 PRIMARY KEY(tenant_id,space_id,class,id,revision),UNIQUE(tenant_id,space_id,class,id,revision,witness),
 CHECK(isfinite(expires_at)),CHECK(dependency_digest ~ '^sha256:[0-9a-f]{64}$'),
 CHECK((class='ask' AND ask_id=id AND backing_class IS NULL AND backing_id IS NULL AND backing_witness IS NULL AND revision=1)
 OR (class<>'ask' AND ask_id IS NULL AND backing_class IS NOT NULL AND backing_id IS NOT NULL AND backing_witness IS NOT NULL)),
 CHECK(class NOT IN('summary','index','cache','knowledge','draft') OR dependency_count>0),
 FOREIGN KEY(tenant_id,space_id,backing_class,backing_id,backing_revision) REFERENCES fabric.storage_current_heads(tenant_id,space_id,class,id,revision),
 FOREIGN KEY(tenant_id,space_id,ask_id) REFERENCES fabric.storage_ask_receipts(tenant_id,space_id,id)
);
CREATE TABLE fabric.storage_graph_edges (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,child_class text NOT NULL,child_id uuid NOT NULL,child_revision fabric.safe_amount NOT NULL,child_witness text NOT NULL,
 parent_class text NOT NULL,parent_id uuid NOT NULL,parent_revision fabric.safe_amount NOT NULL,parent_witness text NOT NULL,
 PRIMARY KEY(tenant_id,space_id,child_class,child_id,child_revision,parent_class,parent_id,parent_revision),
 FOREIGN KEY(tenant_id,space_id,child_class,child_id,child_revision,child_witness) REFERENCES fabric.storage_graph_nodes(tenant_id,space_id,class,id,revision,witness),
 FOREIGN KEY(tenant_id,space_id,parent_class,parent_id,parent_revision,parent_witness) REFERENCES fabric.storage_graph_nodes(tenant_id,space_id,class,id,revision,witness),
 CHECK(ROW(child_class,child_id,child_revision)<>ROW(parent_class,parent_id,parent_revision))
);
CREATE INDEX storage_graph_descendants ON fabric.storage_graph_edges(tenant_id,space_id,parent_class,parent_id,parent_revision,child_class,child_id,child_revision);
CREATE TABLE fabric.storage_graph_payloads (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,class text NOT NULL CHECK(class IN('summary','index','cache')),id uuid NOT NULL,revision fabric.safe_amount NOT NULL,
 witness text NOT NULL,envelope text NOT NULL CHECK(octet_length(envelope)<=1500000),
 PRIMARY KEY(tenant_id,space_id,class,id,revision),
 FOREIGN KEY(tenant_id,space_id,class,id,revision,witness) REFERENCES fabric.storage_graph_nodes(tenant_id,space_id,class,id,revision,witness)
);
CREATE TABLE fabric.storage_graph_ask_extras (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,ask_id uuid NOT NULL,parent_class text NOT NULL CHECK(parent_class IN('index','cache')),
 parent_id uuid NOT NULL,parent_revision fabric.safe_amount NOT NULL,parent_witness text NOT NULL,
 PRIMARY KEY(tenant_id,space_id,ask_id,parent_class,parent_id,parent_revision),
 FOREIGN KEY(tenant_id,space_id,ask_id) REFERENCES fabric.storage_ask_receipts,
 FOREIGN KEY(tenant_id,space_id,parent_class,parent_id,parent_revision,parent_witness) REFERENCES fabric.storage_graph_nodes(tenant_id,space_id,class,id,revision,witness)
);
CREATE TABLE fabric.storage_graph_events (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 reason text NOT NULL CHECK(reason IN('restriction','correction','source-revocation')),
 class text NOT NULL,id uuid NOT NULL,revision fabric.safe_amount NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_epoch_publications
);
CREATE TABLE fabric.storage_graph_jobs (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 job_id uuid NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status='pending'),
 class text NOT NULL,id uuid NOT NULL,revision fabric.safe_amount NOT NULL,witness text NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key,class,id,revision),UNIQUE(tenant_id,space_id,job_id),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_graph_events,
 FOREIGN KEY(tenant_id,space_id,class,id,revision,witness) REFERENCES fabric.storage_graph_nodes(tenant_id,space_id,class,id,revision,witness)
);
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['storage_graph_nodes','storage_graph_edges','storage_graph_payloads','storage_graph_ask_extras','storage_graph_events','storage_graph_jobs'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY storage_control_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
CREATE FUNCTION fabric.storage_graph_dependencies(t uuid,sp uuid,cl text,target uuid,rev numeric) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('class',parent_class,'id',parent_id,'revision',parent_revision,'witness',parent_witness)
 ORDER BY parent_class,parent_id,parent_revision),'[]'::jsonb) FROM fabric.storage_graph_edges
 WHERE tenant_id=t AND space_id=sp AND child_class=cl AND child_id=target AND child_revision=rev
$$;
-- UNION visits each exact vertex once: cycles and diamonds cannot expand paths
-- exponentially. LIMIT513 detects overflow before any payload lookup/decrypt.
CREATE FUNCTION fabric.storage_graph_closure(cl text,target uuid,rev numeric,w text,descendants boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();refs jsonb;remaining jsonb;ready jsonb;n jsonb;deps jsonb;level integer:=0;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'graph scope denied' USING ERRCODE='42501';END IF;
 WITH RECURSIVE reach(class,id,revision,witness) AS (
  SELECT cl,target,rev,w UNION
  SELECT CASE WHEN descendants THEN e.child_class ELSE e.parent_class END,
   CASE WHEN descendants THEN e.child_id ELSE e.parent_id END,CASE WHEN descendants THEN e.child_revision ELSE e.parent_revision END,
   CASE WHEN descendants THEN e.child_witness ELSE e.parent_witness END
  FROM reach r JOIN fabric.storage_graph_edges e ON e.tenant_id=t AND e.space_id=sp
   AND (CASE WHEN descendants THEN e.parent_class ELSE e.child_class END)=r.class
   AND (CASE WHEN descendants THEN e.parent_id ELSE e.child_id END)=r.id
   AND (CASE WHEN descendants THEN e.parent_revision ELSE e.child_revision END)=r.revision
 ) SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) INTO refs FROM (SELECT * FROM reach LIMIT 513) r;
 IF jsonb_array_length(refs)>512 THEN RAISE EXCEPTION 'graph node bound' USING ERRCODE='23514';END IF;
 FOR n IN SELECT value FROM jsonb_array_elements(refs) LOOP
  deps:=fabric.storage_graph_dependencies(t,sp,n->>'class',(n->>'id')::uuid,(n->>'revision')::numeric);
  IF NOT EXISTS(SELECT 1 FROM fabric.storage_graph_nodes g WHERE (g.tenant_id,g.space_id,g.class,g.id,g.revision,g.witness)
   =(t,sp,n->>'class',(n->>'id')::uuid,(n->>'revision')::numeric,n->>'witness')
   AND g.dependency_count=jsonb_array_length(deps)
   AND g.dependency_digest='sha256:'||encode(sha256(convert_to(deps::text,'UTF8')),'hex')) THEN
   RAISE EXCEPTION 'graph missing or corrupt inventory' USING ERRCODE='23514';END IF;
 END LOOP;
 remaining:=refs;
 WHILE jsonb_array_length(remaining)>0 LOOP
  SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO ready FROM jsonb_array_elements(remaining) r
  WHERE NOT EXISTS(SELECT 1 FROM fabric.storage_graph_edges e JOIN jsonb_array_elements(remaining) p
   ON (e.parent_class,e.parent_id,e.parent_revision)=(p->>'class',(p->>'id')::uuid,(p->>'revision')::numeric)
   WHERE (e.tenant_id,e.space_id,e.child_class,e.child_id,e.child_revision)=(t,sp,r->>'class',(r->>'id')::uuid,(r->>'revision')::numeric));
  IF jsonb_array_length(ready)=0 OR level>16 THEN RAISE EXCEPTION 'graph cycle or depth bound' USING ERRCODE='23514';END IF;
  SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO remaining FROM jsonb_array_elements(remaining) r WHERE NOT ready @> jsonb_build_array(r);
  level:=level+1;
 END LOOP;
 RETURN refs;
END $$;
CREATE FUNCTION fabric.storage_graph_add(n jsonb,deps jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();d jsonb;sorted jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(elem.value ORDER BY elem.value->>'class',elem.value->>'id',(elem.value->>'revision')::numeric),'[]'::jsonb) INTO sorted FROM jsonb_array_elements(deps) elem(value);
 IF jsonb_array_length(sorted)>64 THEN RAISE EXCEPTION 'graph dependency bound' USING ERRCODE='23514';END IF;
 INSERT INTO fabric.storage_graph_nodes VALUES(t,sp,n->>'class',(n->>'id')::uuid,(n->>'revision')::numeric,n->>'witness',
 (n->>'task')::uuid,(n->>'key')::uuid,(n->>'generation')::uuid,(n->>'expires')::timestamptz,
 n->>'backingClass',(n->>'backingId')::uuid,(n->>'backingRevision')::numeric,n->>'backingWitness',(n->>'askId')::uuid,
 jsonb_array_length(sorted),'sha256:'||encode(sha256(convert_to(sorted::text,'UTF8')),'hex'));
 FOR d IN SELECT value FROM jsonb_array_elements(sorted) LOOP
  INSERT INTO fabric.storage_graph_edges VALUES(t,sp,n->>'class',(n->>'id')::uuid,(n->>'revision')::numeric,n->>'witness',d->>'class',(d->>'id')::uuid,(d->>'revision')::numeric,d->>'witness');
 END LOOP;
 PERFORM fabric.storage_graph_closure(n->>'class',(n->>'id')::uuid,(n->>'revision')::numeric,n->>'witness');
END $$;
-- Enroll only exact rows admitted by the installed canonical owners. Readers of
-- graph content fail closed when a legacy/missing graph has not been enrolled.
CREATE FUNCTION fabric.storage_graph_canonical_node() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE n jsonb;deps jsonb:='[]';a fabric.storage_artifact_versions%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='storage_sources' THEN
  n:=jsonb_build_object('class','source','id',NEW.source_id,'revision',NEW.revision,'witness',NEW.witness,'task',NEW.source_task_id,'key',NEW.key_id,'generation',NEW.generation,'expires',NEW.expires_at,'backingClass','source','backingId',NEW.source_id,'backingRevision',NEW.revision,'backingWitness',NEW.witness);
 ELSIF TG_TABLE_NAME='storage_knowledge_revisions' THEN
  n:=jsonb_build_object('class','knowledge','id',NEW.id,'revision',NEW.revision,'witness',NEW.witness,'task',NEW.source_task_id,'key',NEW.key_id,'generation',NEW.generation,'expires',NEW.expires_at,'backingClass','knowledge','backingId',NEW.id,'backingRevision',NEW.revision,'backingWitness',NEW.witness);
  deps:=jsonb_build_array(jsonb_build_object('class','source','id',NEW.source_id,'revision',NEW.source_revision,'witness',NEW.source_witness));
 ELSIF TG_TABLE_NAME='storage_artifact_versions' THEN
  n:=jsonb_build_object('class','artifact','id',NEW.id,'revision',NEW.revision,'witness',NEW.witness,'task',NEW.source_task_id,'key',NEW.key_id,'generation',NEW.generation,'expires',NEW.expires_at,'backingClass','artifact','backingId',NEW.id,'backingRevision',NEW.revision,'backingWitness',NEW.witness);
  IF NEW.source_id IS NOT NULL THEN deps:=jsonb_build_array(jsonb_build_object('class','source','id',NEW.source_id,'revision',NEW.source_revision,'witness',NEW.source_witness));END IF;
 ELSIF TG_TABLE_NAME='storage_volume_versions' THEN
  IF NEW.kind<>'draft' THEN RETURN NULL;END IF;
  SELECT * INTO a FROM fabric.storage_artifact_versions WHERE (tenant_id,space_id,id)=(NEW.tenant_id,NEW.space_id,NEW.artifact_id);
  n:=jsonb_build_object('class','draft','id',NEW.id,'revision',NEW.revision,'witness',NEW.index_witness,'task',NEW.task_id,'key',a.key_id,'generation',a.generation,'expires',NEW.expires_at,'backingClass','artifact','backingId',a.id,'backingRevision',a.revision,'backingWitness',a.witness);
  deps:=jsonb_build_array(jsonb_build_object('class','artifact','id',a.id,'revision',a.revision,'witness',a.witness));
 END IF;
 PERFORM fabric.storage_graph_add(n,deps);RETURN NULL;
END $$;
CREATE TRIGGER storage_graph_source AFTER INSERT ON fabric.storage_sources FOR EACH ROW EXECUTE FUNCTION fabric.storage_graph_canonical_node();
CREATE TRIGGER storage_graph_knowledge AFTER INSERT ON fabric.storage_knowledge_revisions FOR EACH ROW EXECUTE FUNCTION fabric.storage_graph_canonical_node();
CREATE TRIGGER storage_graph_artifact AFTER INSERT ON fabric.storage_artifact_versions FOR EACH ROW EXECUTE FUNCTION fabric.storage_graph_canonical_node();
CREATE TRIGGER storage_graph_draft AFTER INSERT ON fabric.storage_volume_versions FOR EACH ROW EXECUTE FUNCTION fabric.storage_graph_canonical_node();
-- Legacy canonical inventories are enrolled below without rewriting their bodies.
CREATE FUNCTION fabric.storage_graph_register_derived(k uuid,e text,deps jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();p fabric.storage_head_publications%ROWTYPE;x xid;j jsonb;
BEGIN
 IF NOT fabric.service_scope(t,sp) OR NOT((fabric.controller_authority())->'grants' ?& ARRAY['storage:write','storage:maintenance','task:write']) THEN RAISE EXCEPTION 'graph admission denied' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM fabric.storage_head_publications WHERE (tenant_id,space_id,actor_id,command_key)=(t,sp,a,k);
 SELECT xmin INTO x FROM fabric.storage_head_publications WHERE (tenant_id,space_id,actor_id,command_key)=(t,sp,a,k);
 IF x IS DISTINCT FROM (txid_current()%4294967296)::text::xid OR p.class NOT IN('summary','index','cache') OR jsonb_array_length(deps)=0
 OR p.witness IS DISTINCT FROM 'sha256:'||encode(sha256(convert_to(e,'UTF8')),'hex') THEN RAISE EXCEPTION 'graph publication denied' USING ERRCODE='23514';END IF;
 j:=e::jsonb;
 IF j->>'tenantId' IS DISTINCT FROM t::text OR j->>'spaceId' IS DISTINCT FROM sp::text OR j->>'class' IS DISTINCT FROM p.class
 OR j->>'id' IS DISTINCT FROM p.id::text OR (j->>'revision')::numeric IS DISTINCT FROM p.revision OR j->>'generation' IS DISTINCT FROM p.generation::text OR j->>'keyId' IS DISTINCT FROM p.key_id::text THEN RAISE EXCEPTION 'graph cipher binding denied' USING ERRCODE='23514';END IF;
 PERFORM fabric.storage_graph_add(jsonb_build_object('class',p.class,'id',p.id,'revision',p.revision,'witness',p.witness,'task',p.source_task_id,'key',p.key_id,'generation',p.generation,'expires',p.expires_at,'backingClass',p.class,'backingId',p.id,'backingRevision',p.revision,'backingWitness',p.witness),deps);
 INSERT INTO fabric.storage_graph_payloads VALUES(t,sp,p.class,p.id,p.revision,p.witness,e);
END $$;
CREATE FUNCTION fabric.storage_graph_bind_ask_cache(target uuid,deps jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();x xid;d jsonb;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'graph ask scope denied' USING ERRCODE='42501';END IF;
 SELECT xmin INTO x FROM fabric.storage_ask_receipts WHERE tenant_id=t AND space_id=sp AND id=target AND actor_id=fabric.current_identity();
 IF x IS DISTINCT FROM (txid_current()%4294967296)::text::xid OR jsonb_array_length(deps)>64 THEN RAISE EXCEPTION 'graph ask transaction denied' USING ERRCODE='23514';END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(deps) LOOP
  PERFORM fabric.storage_graph_closure(d->>'class',(d->>'id')::uuid,(d->>'revision')::numeric,d->>'witness');
  INSERT INTO fabric.storage_graph_ask_extras VALUES(t,sp,target,d->>'class',(d->>'id')::uuid,(d->>'revision')::numeric,d->>'witness');
 END LOOP;
END $$;
CREATE FUNCTION fabric.storage_graph_ask_node() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE deps jsonb;w text;
BEGIN
 SELECT coalesce(jsonb_agg(d ORDER BY d->>'class',d->>'id'),'[]') INTO deps FROM (
 SELECT jsonb_build_object('class','knowledge','id',knowledge_id,'revision',knowledge_revision,'witness',knowledge_witness) AS d FROM fabric.storage_ask_dependencies WHERE (tenant_id,space_id,ask_id)=(NEW.tenant_id,NEW.space_id,NEW.id)
 UNION ALL SELECT jsonb_build_object('class',parent_class,'id',parent_id,'revision',parent_revision,'witness',parent_witness) FROM fabric.storage_graph_ask_extras WHERE (tenant_id,space_id,ask_id)=(NEW.tenant_id,NEW.space_id,NEW.id)) ds;
 w:='sha256:'||encode(sha256(convert_to(NEW.envelope::text,'UTF8')),'hex');
 PERFORM fabric.storage_graph_add(jsonb_build_object('class','ask','id',NEW.id,'revision',1,'witness',w,'task',NEW.task_id,'key',NEW.key_id,'generation',NEW.generation,'expires',NEW.expires_at,'askId',NEW.id,'backingRevision',1),deps);RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER storage_graph_ask AFTER INSERT ON fabric.storage_ask_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fabric.storage_graph_ask_node();
-- Exact durable job set is committed with its originating restrictive/corrective
-- publication. No retry, lease, worker admission or completed erasure is implied.
CREATE FUNCTION fabric.storage_graph_restriction_jobs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE cl text;target uuid;rev numeric;reason_arg text;w text;refs jsonb;n jsonb;
BEGIN
 IF TG_TABLE_NAME='storage_forget_work' THEN cl:=NEW.class;target:=NEW.id;rev:=NEW.revision;reason_arg:='restriction';
 ELSIF TG_TABLE_NAME='storage_source_revocations' THEN cl:='source';target:=NEW.source_id;rev:=NEW.source_revision;reason_arg:='source-revocation';
 ELSE cl:='knowledge';target:=NEW.id;rev:=NEW.previous_revision;reason_arg:='correction';END IF;
 INSERT INTO fabric.storage_graph_events VALUES(NEW.tenant_id,NEW.space_id,NEW.actor_id,NEW.command_key,reason_arg,cl,target,rev);
 SELECT witness INTO w FROM fabric.storage_graph_nodes WHERE (tenant_id,space_id,class,id,revision)=(NEW.tenant_id,NEW.space_id,cl,target,rev);
 IF w IS NULL THEN RETURN NULL;END IF;
 refs:=fabric.storage_graph_closure(cl,target,rev,w,true);
 FOR n IN SELECT value FROM jsonb_array_elements(refs) LOOP
  IF (n->>'class',(n->>'id')::uuid,(n->>'revision')::numeric)<>(cl,target,rev) THEN
   INSERT INTO fabric.storage_graph_jobs VALUES(NEW.tenant_id,NEW.space_id,NEW.actor_id,NEW.command_key,gen_random_uuid(),'pending',n->>'class',(n->>'id')::uuid,(n->>'revision')::numeric,n->>'witness');
  END IF;
 END LOOP;RETURN NULL;
END $$;
CREATE TRIGGER storage_graph_forget AFTER INSERT ON fabric.storage_forget_work FOR EACH ROW EXECUTE FUNCTION fabric.storage_graph_restriction_jobs();
CREATE TRIGGER storage_graph_revoke AFTER INSERT ON fabric.storage_source_revocations FOR EACH ROW EXECUTE FUNCTION fabric.storage_graph_restriction_jobs();
CREATE TRIGGER storage_graph_correct AFTER INSERT ON fabric.storage_knowledge_corrections FOR EACH ROW EXECUTE FUNCTION fabric.storage_graph_restriction_jobs();
REVOKE ALL ON FUNCTION fabric.storage_graph_dependencies(uuid,uuid,text,uuid,numeric),fabric.storage_graph_add(jsonb,jsonb),fabric.storage_graph_canonical_node(),fabric.storage_graph_ask_node(),fabric.storage_graph_restriction_jobs() FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
REVOKE ALL ON FUNCTION fabric.storage_graph_closure(text,uuid,numeric,text,boolean),fabric.storage_graph_register_derived(uuid,text,jsonb),fabric.storage_graph_bind_ask_cache(uuid,jsonb) FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_graph_closure(text,uuid,numeric,text,boolean),fabric.storage_graph_register_derived(uuid,text,jsonb),fabric.storage_graph_bind_ask_cache(uuid,jsonb) TO fabric_controller;

-- Additive metadata enrollment of already accepted canonical history. The
-- dependency guard still applies current heads/status/audience before serving.
DO $$ DECLARE r record;n jsonb;deps jsonb;BEGIN
 FOR r IN
  SELECT 0 AS rank,tenant_id,space_id,actor_id,'source'::text AS class,source_id AS id,revision,witness,source_task_id,key_id,generation,expires_at,NULL::uuid AS source_id,NULL::numeric AS source_revision,NULL::text AS source_witness FROM fabric.storage_sources
  UNION ALL SELECT 1,tenant_id,space_id,actor_id,'knowledge',id,revision,witness,source_task_id,key_id,generation,expires_at,source_id,source_revision,source_witness FROM fabric.storage_knowledge_revisions
  UNION ALL SELECT 2,tenant_id,space_id,actor_id,'artifact',id,revision,witness,source_task_id,key_id,generation,expires_at,source_id,source_revision,source_witness FROM fabric.storage_artifact_versions
  ORDER BY rank,id,revision
 LOOP
  PERFORM set_config('app.tenant_id',r.tenant_id::text,true);PERFORM set_config('app.space_id',r.space_id::text,true);PERFORM set_config('app.actor_id',r.actor_id::text,true);PERFORM set_config('app.identity_verified','true',true);
  n:=jsonb_build_object('class',r.class,'id',r.id,'revision',r.revision,'witness',r.witness,'task',r.source_task_id,'key',r.key_id,'generation',r.generation,'expires',r.expires_at,'backingClass',r.class,'backingId',r.id,'backingRevision',r.revision,'backingWitness',r.witness);
  deps:=CASE WHEN r.source_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('class','source','id',r.source_id,'revision',r.source_revision,'witness',r.source_witness)) END;
  PERFORM fabric.storage_graph_add(n,deps);
 END LOOP;
 FOR r IN SELECT v.*,a.key_id,a.generation,a.revision AS ar,a.witness AS aw FROM fabric.storage_volume_versions v JOIN fabric.storage_artifact_versions a ON (a.tenant_id,a.space_id,a.id)=(v.tenant_id,v.space_id,v.artifact_id) WHERE v.kind='draft' ORDER BY v.id,v.revision LOOP
  PERFORM set_config('app.tenant_id',r.tenant_id::text,true);PERFORM set_config('app.space_id',r.space_id::text,true);PERFORM set_config('app.actor_id',r.actor_id::text,true);
  PERFORM fabric.storage_graph_add(jsonb_build_object('class','draft','id',r.id,'revision',r.revision,'witness',r.index_witness,'task',r.task_id,'key',r.key_id,'generation',r.generation,'expires',r.expires_at,'backingClass','artifact','backingId',r.artifact_id,'backingRevision',r.ar,'backingWitness',r.aw),jsonb_build_array(jsonb_build_object('class','artifact','id',r.artifact_id,'revision',r.ar,'witness',r.aw)));
 END LOOP;
 FOR r IN SELECT * FROM fabric.storage_ask_receipts ORDER BY id LOOP
  PERFORM set_config('app.tenant_id',r.tenant_id::text,true);PERFORM set_config('app.space_id',r.space_id::text,true);PERFORM set_config('app.actor_id',r.actor_id::text,true);
  SELECT coalesce(jsonb_agg(jsonb_build_object('class','knowledge','id',knowledge_id,'revision',knowledge_revision,'witness',knowledge_witness)),'[]'::jsonb) INTO deps FROM fabric.storage_ask_dependencies WHERE (tenant_id,space_id,ask_id)=(r.tenant_id,r.space_id,r.id);
  PERFORM fabric.storage_graph_add(jsonb_build_object('class','ask','id',r.id,'revision',1,'witness','sha256:'||encode(sha256(convert_to(r.envelope::text,'UTF8')),'hex'),'task',r.task_id,'key',r.key_id,'generation',r.generation,'expires',r.expires_at,'askId',r.id,'backingRevision',1),deps);
 END LOOP;
END $$;

-- Exact backing controls are enforced even for direct trusted SQL callers.
ALTER TABLE fabric.storage_current_heads ADD UNIQUE(tenant_id,space_id,class,id,revision,witness,key_id,generation,expires_at);
ALTER TABLE fabric.storage_ask_receipts ADD UNIQUE(tenant_id,space_id,id,task_id,key_id,generation,expires_at);
ALTER TABLE fabric.storage_graph_nodes ADD FOREIGN KEY(tenant_id,space_id,backing_class,backing_id,backing_revision,backing_witness,key_id,generation,expires_at)
 REFERENCES fabric.storage_current_heads(tenant_id,space_id,class,id,revision,witness,key_id,generation,expires_at);
ALTER TABLE fabric.storage_graph_nodes ADD FOREIGN KEY(tenant_id,space_id,backing_class,backing_id,backing_revision,source_task_id)
 REFERENCES fabric.storage_entities(tenant_id,space_id,class,id,revision,source_task_id);
ALTER TABLE fabric.storage_graph_nodes ADD FOREIGN KEY(tenant_id,space_id,ask_id,source_task_id,key_id,generation,expires_at)
 REFERENCES fabric.storage_ask_receipts(tenant_id,space_id,id,task_id,key_id,generation,expires_at);
ALTER TABLE fabric.storage_graph_nodes ADD CHECK(class='ask' OR (class='draft' AND backing_class='artifact')
 OR (class=backing_class AND id=backing_id AND revision=backing_revision AND witness=backing_witness));
CREATE FUNCTION fabric.storage_graph_require_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE refs jsonb;w text;actual jsonb;expected jsonb;
BEGIN
 IF TG_TABLE_NAME='storage_graph_nodes' THEN
  IF NEW.class IN('summary','index','cache') AND NOT EXISTS(SELECT 1 FROM fabric.storage_graph_payloads WHERE (tenant_id,space_id,class,id,revision,witness)=(NEW.tenant_id,NEW.space_id,NEW.class,NEW.id,NEW.revision,NEW.witness)) THEN RAISE EXCEPTION 'graph payload incomplete' USING ERRCODE='23514';END IF;
 ELSE
  IF NOT(
   (NEW.reason='restriction' AND EXISTS(SELECT 1 FROM fabric.storage_forget_work WHERE (tenant_id,space_id,actor_id,command_key,class,id,revision)=(NEW.tenant_id,NEW.space_id,NEW.actor_id,NEW.command_key,NEW.class,NEW.id,NEW.revision)))
   OR (NEW.reason='source-revocation' AND NEW.class='source' AND EXISTS(SELECT 1 FROM fabric.storage_source_revocations WHERE (tenant_id,space_id,actor_id,command_key,source_id,source_revision)=(NEW.tenant_id,NEW.space_id,NEW.actor_id,NEW.command_key,NEW.id,NEW.revision)))
   OR (NEW.reason='correction' AND NEW.class='knowledge' AND EXISTS(SELECT 1 FROM fabric.storage_knowledge_corrections WHERE (tenant_id,space_id,actor_id,command_key,id,previous_revision)=(NEW.tenant_id,NEW.space_id,NEW.actor_id,NEW.command_key,NEW.id,NEW.revision)))) THEN RAISE EXCEPTION 'graph event origin denied' USING ERRCODE='23514';END IF;
  SELECT witness INTO w FROM fabric.storage_graph_nodes WHERE (tenant_id,space_id,class,id,revision)=(NEW.tenant_id,NEW.space_id,NEW.class,NEW.id,NEW.revision);
  IF w IS NOT NULL THEN
   refs:=fabric.storage_graph_closure(NEW.class,NEW.id,NEW.revision,w,true);
   SELECT coalesce(jsonb_agg(r ORDER BY r->>'class',r->>'id',(r->>'revision')::numeric),'[]') INTO expected FROM jsonb_array_elements(refs) r
    WHERE (r->>'class',(r->>'id')::uuid,(r->>'revision')::numeric)<>(NEW.class,NEW.id,NEW.revision);
   SELECT coalesce(jsonb_agg(jsonb_build_object('class',class,'id',id,'revision',revision,'witness',witness) ORDER BY class,id,revision),'[]') INTO actual FROM fabric.storage_graph_jobs WHERE (tenant_id,space_id,actor_id,command_key)=(NEW.tenant_id,NEW.space_id,NEW.actor_id,NEW.command_key);
   IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'graph jobs incomplete' USING ERRCODE='23514';END IF;
  END IF;
 END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER storage_graph_payload_complete AFTER INSERT ON fabric.storage_graph_nodes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fabric.storage_graph_require_complete();
CREATE CONSTRAINT TRIGGER storage_graph_jobs_complete AFTER INSERT ON fabric.storage_graph_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fabric.storage_graph_require_complete();
REVOKE ALL ON FUNCTION fabric.storage_graph_require_complete() FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
