-- Additive, forward-only fenced retry. Canonical heads, immutable original jobs
-- and ciphertext are never updated. Every mutation is monotonic control metadata.
ALTER TABLE fabric.storage_graph_jobs ADD UNIQUE(tenant_id,space_id,job_id,actor_id,command_key,class,id,revision,witness);
ALTER TABLE fabric.storage_graph_jobs ADD UNIQUE(tenant_id,space_id,job_id,actor_id);
ALTER TABLE fabric.storage_graph_jobs ADD UNIQUE(tenant_id,space_id,job_id,class,id,revision,witness);
CREATE TABLE fabric.storage_propagation_leases (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,job_id uuid NOT NULL,lease_id uuid NOT NULL,
 actor_id uuid NOT NULL,worker_id uuid NOT NULL,session_id uuid NOT NULL,
 attempt integer NOT NULL CHECK(attempt BETWEEN 1 AND 1000000),leased_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,space_id,lease_id),UNIQUE(tenant_id,space_id,job_id,attempt),
 UNIQUE(tenant_id,space_id,job_id,lease_id),
 FOREIGN KEY(tenant_id,space_id,job_id,actor_id) REFERENCES fabric.storage_graph_jobs(tenant_id,space_id,job_id,actor_id),
 CHECK(isfinite(leased_at) AND isfinite(expires_at) AND expires_at>leased_at AND expires_at<=leased_at+interval '30 seconds')
);
CREATE INDEX storage_propagation_current_lease ON fabric.storage_propagation_leases(tenant_id,space_id,job_id,attempt DESC);
CREATE TABLE fabric.storage_graph_invalidations (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,class text NOT NULL,id uuid NOT NULL,revision fabric.safe_amount NOT NULL,witness text NOT NULL,
 job_id uuid NOT NULL,lease_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,at timestamptz NOT NULL CHECK(isfinite(at)),
 PRIMARY KEY(tenant_id,space_id,class,id,revision),
 UNIQUE(tenant_id,space_id,class,id,revision,witness),
 FOREIGN KEY(tenant_id,space_id,job_id,lease_id) REFERENCES fabric.storage_propagation_leases(tenant_id,space_id,job_id,lease_id),
 FOREIGN KEY(tenant_id,space_id,job_id,actor_id,command_key,class,id,revision,witness)
 REFERENCES fabric.storage_graph_jobs(tenant_id,space_id,job_id,actor_id,command_key,class,id,revision,witness)
);
CREATE TABLE fabric.storage_propagation_results (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,job_id uuid NOT NULL,lease_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN('invalidated','already-invalidated','obsolete')),at timestamptz NOT NULL CHECK(isfinite(at)),
 invalidated_class text,invalidated_id uuid,invalidated_revision fabric.safe_amount,invalidated_witness text,
 PRIMARY KEY(tenant_id,space_id,job_id),
 FOREIGN KEY(tenant_id,space_id,job_id,invalidated_class,invalidated_id,invalidated_revision,invalidated_witness)
 REFERENCES fabric.storage_graph_jobs(tenant_id,space_id,job_id,class,id,revision,witness),
 FOREIGN KEY(tenant_id,space_id,job_id,lease_id) REFERENCES fabric.storage_propagation_leases(tenant_id,space_id,job_id,lease_id),
 FOREIGN KEY(tenant_id,space_id,invalidated_class,invalidated_id,invalidated_revision,invalidated_witness)
 REFERENCES fabric.storage_graph_invalidations(tenant_id,space_id,class,id,revision,witness),
 CHECK((outcome='obsolete' AND invalidated_class IS NULL AND invalidated_id IS NULL AND invalidated_revision IS NULL AND invalidated_witness IS NULL)
 OR (outcome<>'obsolete' AND invalidated_class IS NOT NULL AND invalidated_id IS NOT NULL AND invalidated_revision IS NOT NULL AND invalidated_witness IS NOT NULL))
);
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['storage_propagation_leases','storage_graph_invalidations','storage_propagation_results'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY storage_control_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
-- Validate durable origin afresh; neither an old lease nor a free-form target
-- grants authority. No origin is inferred from worker-supplied content.
CREATE FUNCTION fabric.storage_propagation_origin(k uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE e fabric.storage_graph_events%ROWTYPE;t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
BEGIN
 IF NOT fabric.service_scope(t,sp) OR NOT((fabric.controller_authority())->'grants' ?& ARRAY['storage:maintenance','task:write']) THEN RAISE EXCEPTION 'retry scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 SELECT * INTO e FROM fabric.storage_graph_events WHERE (tenant_id,space_id,actor_id,command_key)=(t,sp,a,k);
 IF e.command_key IS NULL OR NOT(
  (e.reason='restriction' AND EXISTS(SELECT 1 FROM fabric.storage_forget_work w JOIN fabric.storage_tombstones d USING(tenant_id,space_id,class,id,revision)
   WHERE (w.tenant_id,w.space_id,w.actor_id,w.command_key,w.class,w.id,w.revision)=(t,sp,a,k,e.class,e.id,e.revision) AND d.command_key=k))
  OR (e.reason='source-revocation' AND EXISTS(SELECT 1 FROM fabric.storage_source_revocations r JOIN fabric.storage_restrictions d USING(tenant_id,space_id,source_id,source_revision)
   WHERE (r.tenant_id,r.space_id,r.actor_id,r.command_key,r.source_id,r.source_revision)=(t,sp,a,k,e.id,e.revision)))
  OR (e.reason='correction' AND EXISTS(SELECT 1 FROM fabric.storage_knowledge_corrections c JOIN fabric.storage_current_heads h
   ON (h.tenant_id,h.space_id,h.class,h.id,h.revision)=(c.tenant_id,c.space_id,'knowledge',c.id,c.revision)
   WHERE (c.tenant_id,c.space_id,c.actor_id,c.command_key,c.id,c.previous_revision)=(t,sp,a,k,e.id,e.revision))))
 THEN RAISE EXCEPTION 'retry origin denied' USING ERRCODE='23514';END IF;
END $$;
CREATE FUNCTION fabric.storage_propagation_claim(k uuid,worker uuid,session uuid,duration_ms integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();j fabric.storage_graph_jobs%ROWTYPE;
 token uuid:=gen_random_uuid();n integer;at timestamptz;
BEGIN
 PERFORM fabric.storage_propagation_origin(k);
 IF duration_ms NOT BETWEEN 100 AND 30000 OR worker IS NULL OR session IS NULL THEN RAISE EXCEPTION 'retry lease bound' USING ERRCODE='23514';END IF;
 SELECT x.* INTO j FROM fabric.storage_graph_jobs x
 WHERE (x.tenant_id,x.space_id,x.actor_id,x.command_key)=(t,sp,a,k)
 AND NOT EXISTS(SELECT 1 FROM fabric.storage_propagation_results r WHERE (r.tenant_id,r.space_id,r.job_id)=(t,sp,x.job_id))
 AND NOT EXISTS(SELECT 1 FROM fabric.storage_propagation_leases l WHERE (l.tenant_id,l.space_id,l.job_id)=(t,sp,x.job_id) AND l.expires_at>clock_timestamp())
 ORDER BY x.class,x.id,x.revision LIMIT 1 FOR UPDATE OF x SKIP LOCKED;
 IF j.job_id IS NULL THEN RETURN NULL;END IF;
 SELECT coalesce(max(attempt),0)+1 INTO n FROM fabric.storage_propagation_leases WHERE (tenant_id,space_id,job_id)=(t,sp,j.job_id);
 at:=clock_timestamp();INSERT INTO fabric.storage_propagation_leases VALUES(t,sp,j.job_id,token,a,worker,session,n,at,at+duration_ms*interval '1 millisecond');
 RETURN token;
END $$;
CREATE FUNCTION fabric.storage_propagation_complete(target uuid,token uuid,worker uuid,session uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();j fabric.storage_graph_jobs%ROWTYPE;
 l fabric.storage_propagation_leases%ROWTYPE;n fabric.storage_graph_nodes%ROWTYPE;e fabric.storage_graph_events%ROWTYPE;refs jsonb;outcome_arg text;obsolete boolean;at timestamptz;
BEGIN
 SELECT * INTO j FROM fabric.storage_graph_jobs WHERE (tenant_id,space_id,job_id,actor_id)=(t,sp,target,a) FOR UPDATE;
 IF j.job_id IS NULL THEN RAISE EXCEPTION 'retry job denied' USING ERRCODE='42501';END IF;
 PERFORM fabric.storage_propagation_origin(j.command_key);
 SELECT * INTO l FROM fabric.storage_propagation_leases WHERE (tenant_id,space_id,job_id,lease_id,actor_id,worker_id,session_id)=(t,sp,target,token,a,worker,session);
 IF l.lease_id IS NULL THEN RAISE EXCEPTION 'retry token denied' USING ERRCODE='42501';END IF;
 SELECT outcome INTO outcome_arg FROM fabric.storage_propagation_results WHERE (tenant_id,space_id,job_id,lease_id)=(t,sp,target,token);
 IF outcome_arg IS NOT NULL THEN RETURN outcome_arg;END IF;
 IF l.expires_at<=clock_timestamp() OR EXISTS(SELECT 1 FROM fabric.storage_propagation_leases newer WHERE (newer.tenant_id,newer.space_id,newer.job_id)=(t,sp,target) AND newer.attempt>l.attempt)
 OR EXISTS(SELECT 1 FROM fabric.storage_propagation_results r WHERE (r.tenant_id,r.space_id,r.job_id)=(t,sp,target)) THEN RAISE EXCEPTION 'retry lease fenced' USING ERRCODE='23514';END IF;
 SELECT * INTO n FROM fabric.storage_graph_nodes WHERE (tenant_id,space_id,class,id,revision,witness)=(t,sp,j.class,j.id,j.revision,j.witness);
 SELECT * INTO e FROM fabric.storage_graph_events WHERE (tenant_id,space_id,actor_id,command_key)=(t,sp,a,j.command_key);
 refs:=fabric.storage_graph_closure(j.class,j.id,j.revision,j.witness);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(refs) r WHERE (r->>'class',(r->>'id')::uuid,(r->>'revision')::numeric)=(e.class,e.id,e.revision)) THEN RAISE EXCEPTION 'retry ancestry denied' USING ERRCODE='23514';END IF;
 obsolete:=n.expires_at<=clock_timestamp() OR
  (n.class<>'ask' AND NOT EXISTS(SELECT 1 FROM fabric.storage_current_heads h WHERE (h.tenant_id,h.space_id,h.class,h.id,h.revision,h.witness)=(t,sp,n.backing_class,n.backing_id,n.backing_revision,n.backing_witness)
   AND NOT EXISTS(SELECT 1 FROM fabric.storage_current_heads newer WHERE (newer.tenant_id,newer.space_id,newer.class,newer.id)=(t,sp,n.backing_class,n.backing_id) AND newer.revision>n.backing_revision))) OR
  (n.class='draft' AND EXISTS(SELECT 1 FROM fabric.storage_volume_versions v WHERE (v.tenant_id,v.space_id,v.kind,v.id)=(t,sp,'draft',n.id) AND v.revision>n.revision)) OR
  EXISTS(SELECT 1 FROM fabric.storage_tombstones d WHERE (d.tenant_id,d.space_id,d.class,d.id)=(t,sp,n.backing_class,n.backing_id) AND d.revision>=n.backing_revision) OR
  EXISTS(SELECT 1 FROM fabric.storage_restrictions d WHERE n.class='source' AND (d.tenant_id,d.space_id,d.source_id,d.source_revision)=(t,sp,n.id,n.revision));
 at:=clock_timestamp();
 IF obsolete THEN outcome_arg:='obsolete';
 ELSE
  INSERT INTO fabric.storage_graph_invalidations VALUES(t,sp,j.class,j.id,j.revision,j.witness,target,token,a,j.command_key,at) ON CONFLICT DO NOTHING;
  outcome_arg:=CASE WHEN FOUND THEN 'invalidated' ELSE 'already-invalidated' END;
 END IF;
 INSERT INTO fabric.storage_propagation_results VALUES(t,sp,target,token,outcome_arg,at,
  CASE WHEN obsolete THEN NULL ELSE j.class END,CASE WHEN obsolete THEN NULL ELSE j.id END,
  CASE WHEN obsolete THEN NULL ELSE j.revision END,CASE WHEN obsolete THEN NULL ELSE j.witness END);
 RETURN outcome_arg;
END $$;
-- An invalidation cannot survive an unacknowledged partial transaction.
CREATE FUNCTION fabric.storage_propagation_require_result() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM fabric.storage_propagation_results r WHERE (r.tenant_id,r.space_id,r.job_id,r.lease_id,r.outcome)=(NEW.tenant_id,NEW.space_id,NEW.job_id,NEW.lease_id,'invalidated'))
 THEN RAISE EXCEPTION 'retry progress incomplete' USING ERRCODE='23514';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER storage_propagation_complete_invalidation AFTER INSERT ON fabric.storage_graph_invalidations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fabric.storage_propagation_require_result();
REVOKE ALL ON FUNCTION fabric.storage_propagation_origin(uuid),fabric.storage_propagation_claim(uuid,uuid,uuid,integer),fabric.storage_propagation_complete(uuid,uuid,uuid,uuid),fabric.storage_propagation_require_result() FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_propagation_claim(uuid,uuid,uuid,integer),fabric.storage_propagation_complete(uuid,uuid,uuid,uuid) TO fabric_controller;
