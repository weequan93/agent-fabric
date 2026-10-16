-- Additive F06 queue only. No effect settlement, fence transfer or worker grants.
-- Applied in one admin transaction by migration.ts after owner/catalog validation.
CREATE TABLE fabric.runtime_assignments (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,assignment_id uuid NOT NULL,
 storage_binding_id uuid NOT NULL,computer_resource_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id),UNIQUE(tenant_id,space_id,assignment_id),
 FOREIGN KEY(tenant_id,space_id,assignment_id) REFERENCES fabric.computer_assignments,
 FOREIGN KEY(tenant_id,space_id,computer_resource_id) REFERENCES fabric.model_computer_assignments(tenant_id,space_id,resource_id)
);
CREATE TABLE fabric.runtime_resources (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,resource_id uuid NOT NULL,assignment_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('computer','canonical-file','canonical-tree','dependencies','browser-profile','desktop')),
 PRIMARY KEY(tenant_id,space_id,resource_id),UNIQUE(tenant_id,space_id,assignment_id,resource_id),
 FOREIGN KEY(tenant_id,space_id,assignment_id) REFERENCES fabric.runtime_assignments(tenant_id,space_id,assignment_id)
);
CREATE TABLE fabric.runtime_resource_aliases (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,alias_id uuid NOT NULL,resource_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,alias_id),
 FOREIGN KEY(tenant_id,space_id,resource_id) REFERENCES fabric.runtime_resources
);
CREATE TABLE fabric.runtime_queue_tickets (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,ticket_id uuid NOT NULL,actor_id uuid NOT NULL,payer_id uuid NOT NULL,
 original_key uuid NOT NULL,command_id uuid NOT NULL,request_digest text NOT NULL CHECK(request_digest ~ '^sha256:[a-f0-9]{64}$'),
 assignment_id uuid NOT NULL,task_id uuid NOT NULL,run_id uuid NOT NULL,
 sequence bigint GENERATED ALWAYS AS IDENTITY CHECK(sequence>0),request jsonb NOT NULL,receipt jsonb NOT NULL,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL CHECK(state IN('waiting','owned','cancelled','expired','released','reconciling')),
 cancel_requested boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,space_id,ticket_id),UNIQUE(tenant_id,space_id,ticket_id,assignment_id),
 UNIQUE(tenant_id,space_id,actor_id,original_key),UNIQUE(tenant_id,space_id,actor_id,command_id),UNIQUE(sequence),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES fabric.actors,
 FOREIGN KEY(tenant_id,payer_id) REFERENCES fabric.actors,
 FOREIGN KEY(tenant_id,space_id,task_id) REFERENCES fabric.tasks,
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.runs,
 FOREIGN KEY(tenant_id,space_id,assignment_id) REFERENCES fabric.runtime_assignments(tenant_id,space_id,assignment_id)
);
CREATE TABLE fabric.runtime_queue_resources (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,ticket_id uuid NOT NULL,assignment_id uuid NOT NULL,
 resource_id uuid NOT NULL,mode text NOT NULL CHECK(mode IN('read','write')),
 PRIMARY KEY(tenant_id,space_id,ticket_id,resource_id),
 FOREIGN KEY(tenant_id,space_id,ticket_id,assignment_id) REFERENCES fabric.runtime_queue_tickets(tenant_id,space_id,ticket_id,assignment_id),
 FOREIGN KEY(tenant_id,space_id,assignment_id,resource_id) REFERENCES fabric.runtime_resources(tenant_id,space_id,assignment_id,resource_id)
);
CREATE TABLE fabric.runtime_resource_owners (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,resource_id uuid NOT NULL,ticket_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,resource_id),
 FOREIGN KEY(tenant_id,space_id,ticket_id,resource_id) REFERENCES fabric.runtime_queue_resources(tenant_id,space_id,ticket_id,resource_id)
);
-- Conflict lookup starts at canonical resource, rather than at a ticket.
CREATE INDEX runtime_queue_resource_waiters ON fabric.runtime_queue_resources(tenant_id,space_id,resource_id,ticket_id);
CREATE INDEX runtime_queue_live_order ON fabric.runtime_queue_tickets(tenant_id,space_id,sequence)
 WHERE state IN('waiting','owned','reconciling');
-- One durable provider command/uncertain instance slot per immutable assignment.
-- No provisioning API exists in this migration or repository.
CREATE TABLE fabric.runtime_allocation_slots (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,assignment_id uuid NOT NULL,command_id uuid NOT NULL,
 provider_key uuid NOT NULL,state text NOT NULL CHECK(state IN('requested','unknown','observed')),
 instance_id uuid,PRIMARY KEY(tenant_id,space_id),UNIQUE(provider_key),
 FOREIGN KEY(tenant_id,space_id,assignment_id) REFERENCES fabric.runtime_assignments(tenant_id,space_id,assignment_id)
);
-- The original owners deliberately have no new UNIQUE key added to their
-- tables. Validate the Task/Run pairing through their existing scoped keys.
-- This also prevents a serving-role SQL bug from separating the immutable
-- request/receipt from the row on which the queue and its resource owners act.
CREATE FUNCTION fabric.runtime_queue_binding() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM fabric.tasks t JOIN fabric.runs r USING(tenant_id,space_id,task_id)
   JOIN fabric.spaces s USING(tenant_id,space_id)
   WHERE (t.tenant_id,t.space_id,t.task_id,r.run_id,t.actor_id,s.payer_actor_id)=
    (NEW.tenant_id,NEW.space_id,NEW.task_id,NEW.run_id,NEW.actor_id,NEW.payer_id))
 OR (NEW.request->>'schemaVersion'='1'
   AND NEW.request->>'commandId'=NEW.command_id::text
   AND NEW.request->>'idempotencyKey'=NEW.original_key::text
   AND NEW.request->'binding'=jsonb_build_object('tenantId',NEW.tenant_id,'spaceId',NEW.space_id,'taskId',NEW.task_id,'runId',NEW.run_id,
     'assignmentId',NEW.assignment_id,'storageBindingId',(SELECT storage_binding_id FROM fabric.runtime_assignments WHERE tenant_id=NEW.tenant_id AND space_id=NEW.space_id))
   AND NEW.request->>'expectedRevision'='0'
   AND (NEW.request->>'expiresAt')::timestamptz=NEW.expires_at
   AND jsonb_typeof(NEW.request->'resources')='array'
   AND jsonb_array_length(NEW.request->'resources') BETWEEN 1 AND 32
   AND NEW.receipt=jsonb_build_object('schemaVersion',1,'ticketId',NEW.ticket_id,'commandId',NEW.command_id,
     'originalKey',NEW.original_key,'requestDigest',NEW.request_digest,'initialState',NEW.state)
   AND NEW.state IN('waiting','owned')) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'runtime request/receipt or original Task/Run binding differs' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER runtime_queue_binding BEFORE INSERT ON fabric.runtime_queue_tickets
 FOR EACH ROW EXECUTE FUNCTION fabric.runtime_queue_binding();
CREATE FUNCTION fabric.runtime_queue_immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['state','cancel_requested']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','cancel_requested'])
 OR OLD.state IN('cancelled','expired','released') AND NEW IS DISTINCT FROM OLD
 OR OLD.cancel_requested AND NOT NEW.cancel_requested
 OR NEW.state IS DISTINCT FROM OLD.state AND NOT(
   OLD.state='waiting' AND NEW.state IN('owned','cancelled','expired') OR
   OLD.state='owned' AND NEW.state IN('reconciling','released') OR
   OLD.state='reconciling' AND NEW.state='released')
 THEN RAISE EXCEPTION 'immutable runtime command/binding or terminal ticket' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER runtime_queue_immutable BEFORE UPDATE OR DELETE ON fabric.runtime_queue_tickets
 FOR EACH ROW EXECUTE FUNCTION fabric.runtime_queue_immutable();
CREATE FUNCTION fabric.runtime_complete_owners() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,fabric AS $$
DECLARE t fabric.runtime_queue_tickets%ROWTYPE;tid uuid;sp uuid;k uuid;n bigint;owned bigint;expected_set jsonb;actual_set jsonb;
BEGIN
 IF TG_OP='DELETE' THEN tid:=OLD.tenant_id;sp:=OLD.space_id;k:=OLD.ticket_id;
 ELSE tid:=NEW.tenant_id;sp:=NEW.space_id;k:=NEW.ticket_id;END IF;
 SELECT * INTO t FROM fabric.runtime_queue_tickets WHERE (tenant_id,space_id,ticket_id)=(tid,sp,k);
 IF NOT FOUND THEN RAISE EXCEPTION 'runtime ticket absent' USING ERRCODE='23514';END IF;
 SELECT count(*) INTO n FROM fabric.runtime_queue_resources WHERE (tenant_id,space_id,ticket_id)=(tid,sp,k);
 SELECT count(*) INTO owned FROM fabric.runtime_resource_owners WHERE (tenant_id,space_id,ticket_id)=(tid,sp,k);
 IF n NOT BETWEEN 1 AND 33 OR (t.state IN('owned','reconciling') AND owned<>n)
 OR (t.state NOT IN('owned','reconciling') AND owned<>0)
 OR NOT EXISTS(SELECT 1 FROM fabric.runtime_queue_resources q JOIN fabric.runtime_resources r USING(tenant_id,space_id,resource_id)
   JOIN fabric.runtime_assignments a ON (a.tenant_id,a.space_id,a.assignment_id,a.computer_resource_id)=(q.tenant_id,q.space_id,q.assignment_id,q.resource_id)
   WHERE (q.tenant_id,q.space_id,q.ticket_id)=(tid,sp,k) AND r.kind='computer' AND q.mode='write')
 THEN RAISE EXCEPTION 'incomplete runtime resource owner set' USING ERRCODE='23514';END IF;
 -- Resolve every requested alias exactly once and compare the complete union
 -- with persisted resources. A partial set with matching owner counts is not
 -- sufficient. Shared-computer serialization remains present in that union.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(t.request->'resources') q
   WHERE (q->>'mode' IN('read','write')) IS DISTINCT FROM true OR
    (SELECT count(*) FROM (
      SELECT resource_id FROM fabric.runtime_resources WHERE tenant_id=tid AND space_id=sp AND assignment_id=t.assignment_id AND resource_id=(q->>'resourceId')::uuid
      UNION SELECT r.resource_id FROM fabric.runtime_resource_aliases a JOIN fabric.runtime_resources r USING(tenant_id,space_id,resource_id)
      WHERE a.tenant_id=tid AND a.space_id=sp AND r.assignment_id=t.assignment_id AND a.alias_id=(q->>'resourceId')::uuid
    ) resolved)<>1)
 THEN RAISE EXCEPTION 'unsupported or ambiguous runtime resource alias' USING ERRCODE='23514';END IF;
 WITH requested AS (
  SELECT computer_resource_id AS resource_id,'write'::text AS mode FROM fabric.runtime_assignments WHERE tenant_id=tid AND space_id=sp
  UNION ALL
  SELECT resolved.resource_id,q->>'mode' FROM jsonb_array_elements(t.request->'resources') q CROSS JOIN LATERAL (
   SELECT resource_id FROM fabric.runtime_resources WHERE tenant_id=tid AND space_id=sp AND assignment_id=t.assignment_id AND resource_id=(q->>'resourceId')::uuid
   UNION SELECT r.resource_id FROM fabric.runtime_resource_aliases a JOIN fabric.runtime_resources r USING(tenant_id,space_id,resource_id)
    WHERE a.tenant_id=tid AND a.space_id=sp AND r.assignment_id=t.assignment_id AND a.alias_id=(q->>'resourceId')::uuid
  ) resolved
 ), normalized AS (SELECT resource_id,CASE WHEN bool_or(mode='write') THEN 'write' ELSE 'read' END AS mode FROM requested GROUP BY resource_id)
 SELECT jsonb_agg(jsonb_build_object('resourceId',resource_id,'mode',mode) ORDER BY resource_id) INTO expected_set FROM normalized;
 SELECT jsonb_agg(jsonb_build_object('resourceId',resource_id,'mode',mode) ORDER BY resource_id) INTO actual_set
  FROM fabric.runtime_queue_resources WHERE (tenant_id,space_id,ticket_id)=(tid,sp,k);
 IF expected_set IS DISTINCT FROM actual_set THEN
  RAISE EXCEPTION 'runtime resource set differs from immutable request' USING ERRCODE='23514';END IF;
 -- Deferred trigger runs during actual COMMIT after original identity checks.
 -- Existing held ownership remains held when its request expires.
 IF TG_TABLE_NAME='runtime_queue_tickets' AND t.expires_at<=clock_timestamp() THEN
  IF TG_OP='INSERT' THEN RAISE EXCEPTION 'runtime admission expired before commit' USING ERRCODE='23514';END IF;
  IF TG_OP='UPDATE' AND OLD.state='waiting' AND NEW.state='owned' THEN
   RAISE EXCEPTION 'runtime acquisition expired before commit' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER runtime_complete_ticket AFTER INSERT OR UPDATE ON fabric.runtime_queue_tickets
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fabric.runtime_complete_owners();
CREATE CONSTRAINT TRIGGER runtime_complete_resource AFTER INSERT OR UPDATE OR DELETE ON fabric.runtime_queue_resources
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fabric.runtime_complete_owners();
CREATE CONSTRAINT TRIGGER runtime_complete_owner AFTER INSERT OR UPDATE OR DELETE ON fabric.runtime_resource_owners
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fabric.runtime_complete_owners();
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['runtime_assignments','runtime_resources','runtime_resource_aliases','runtime_queue_tickets','runtime_queue_resources','runtime_resource_owners','runtime_allocation_slots'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY runtime_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['runtime_assignments','runtime_resources','runtime_resource_aliases','runtime_queue_resources'] LOOP
  EXECUTE format('CREATE TRIGGER runtime_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
 END LOOP;
END $$;
-- Canonical catalog/assignment and allocation issuance are composition-root only.
GRANT INSERT,UPDATE ON fabric.runtime_queue_tickets TO fabric_controller;
GRANT INSERT ON fabric.runtime_queue_resources,fabric.runtime_resource_owners TO fabric_controller;
GRANT USAGE ON SEQUENCE fabric.runtime_queue_tickets_sequence_seq TO fabric_controller;
REVOKE ALL ON FUNCTION fabric.runtime_queue_binding(),fabric.runtime_queue_immutable(),fabric.runtime_complete_owners() FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
CREATE FUNCTION fabric.runtime_schema_ready(expected_digest text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
 SELECT count(*)=1 AND bool_and(version=1 AND digest=expected_digest) FROM public.fabric_runtime_migrations
$$;
REVOKE ALL ON FUNCTION fabric.runtime_schema_ready(text) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.runtime_schema_ready(text) TO fabric_controller;
