-- Independent immutable preferences, attached to the installed native origin.
-- No second session owner, authority grant, descriptive payload or budget copy.
CREATE TABLE fabric.storage_query_controls (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,
 session_id uuid NOT NULL,task_id uuid NOT NULL,run_id uuid NOT NULL,
 revision fabric.safe_amount NOT NULL CHECK(revision>0),command_key uuid NOT NULL,
 expected_revision fabric.safe_amount NOT NULL,command_expires_at timestamptz NOT NULL,
 controls jsonb NOT NULL,accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,space_id,actor_id,session_id,revision),
 UNIQUE(tenant_id,space_id,actor_id,command_key),
 CHECK(revision=expected_revision+1),
 CHECK(isfinite(command_expires_at) AND isfinite(accepted_at) AND command_expires_at>accepted_at),
 CHECK(jsonb_typeof(controls)='object' AND controls ?& ARRAY['attachments','olderRecall','saveReusable']
  AND controls-ARRAY['attachments','olderRecall','saveReusable']='{}'::jsonb
  AND jsonb_typeof(controls->'attachments')='boolean' AND jsonb_typeof(controls->'olderRecall')='boolean'
  AND jsonb_typeof(controls->'saveReusable')='boolean'),
 FOREIGN KEY(tenant_id,space_id,session_id,task_id,run_id)
  REFERENCES fabric.model_sessions(tenant_id,space_id,session_id,task_id,run_id),
 FOREIGN KEY(tenant_id,space_id,task_id) REFERENCES fabric.tasks(tenant_id,space_id,task_id),
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.runs(tenant_id,space_id,run_id)
);
ALTER TABLE fabric.storage_query_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_query_controls FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_query_controls
 USING(fabric.service_scope(tenant_id,space_id) AND actor_id=fabric.current_identity())
 WITH CHECK(fabric.service_scope(tenant_id,space_id) AND actor_id=fabric.current_identity());
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_query_controls
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_query_controls FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_query_controls TO fabric_controller;
CREATE FUNCTION fabric.storage_set_query_controls(session_arg uuid,k uuid,expected numeric,expires timestamptz,flags jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 n fabric.model_sessions%ROWTYPE;admission jsonb;binding jsonb;prior numeric;old fabric.storage_query_controls%ROWTYPE;auth jsonb;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'query controls scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 auth:=fabric.controller_authority();
 IF auth IS NULL OR NOT(auth->'grants' ?& ARRAY['storage:read','task:read','task:write'])
  OR NOT isfinite(expires) OR expires<=clock_timestamp() OR expected<0 THEN
  RAISE EXCEPTION 'query controls admission denied' USING ERRCODE='42501';END IF;
 SELECT * INTO n FROM fabric.model_sessions WHERE tenant_id=t AND space_id=sp AND session_id=session_arg;
 SELECT c.admission INTO admission FROM fabric.model_native_controls c WHERE c.tenant_id=t AND c.space_id=sp AND c.session_id=session_arg;
 IF n.binding->>'actorId' IS DISTINCT FROM a::text OR n.binding->>'intent' IS DISTINCT FROM 'Ask'
  OR n.binding->>'purpose' IS DISTINCT FROM 'answer' OR admission->>'executionClass' IS DISTINCT FROM 'service'
  OR admission->'resourceId' IS DISTINCT FROM 'null'::jsonb OR admission->'computerCapability' IS DISTINCT FROM 'null'::jsonb
  OR admission->'targetEffect' IS DISTINCT FROM 'false'::jsonb OR admission->'approvalRequired' IS DISTINCT FROM 'false'::jsonb THEN
  RAISE EXCEPTION 'query controls native denied' USING ERRCODE='42501';END IF;
 PERFORM fabric.model_recovery_current(n.run_id,false);
 binding:=fabric.model_current(n.run_id,NULL,false);
 IF binding->'record' IS DISTINCT FROM n.binding OR EXISTS(SELECT 1 FROM fabric.recovery_task_controls c
  WHERE c.tenant_id=t AND c.space_id=sp AND c.task_id=n.task_id AND c.blocked) THEN
  RAISE EXCEPTION 'query controls stale native' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(flags) IS DISTINCT FROM 'object' OR NOT(flags ?& ARRAY['attachments','olderRecall','saveReusable'])
  OR flags-ARRAY['attachments','olderRecall','saveReusable']<>'{}'::jsonb
  OR jsonb_typeof(flags->'attachments') IS DISTINCT FROM 'boolean' OR jsonb_typeof(flags->'olderRecall') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(flags->'saveReusable') IS DISTINCT FROM 'boolean' THEN
  RAISE EXCEPTION 'query controls flags denied' USING ERRCODE='23514';END IF;
 SELECT * INTO old FROM fabric.storage_query_controls WHERE tenant_id=t AND space_id=sp AND actor_id=a AND command_key=k;
 IF FOUND THEN
  IF old.session_id IS DISTINCT FROM session_arg OR old.expected_revision IS DISTINCT FROM expected
   OR old.command_expires_at IS DISTINCT FROM expires OR old.controls IS DISTINCT FROM flags
   OR old.task_id IS DISTINCT FROM n.task_id OR old.run_id IS DISTINCT FROM n.run_id THEN
   RAISE EXCEPTION 'query controls original conflict' USING ERRCODE='23505';END IF;
  RETURN;
 END IF;
 SELECT coalesce(max(revision),0) INTO prior FROM fabric.storage_query_controls WHERE tenant_id=t AND space_id=sp AND actor_id=a AND session_id=session_arg;
 IF prior IS DISTINCT FROM expected THEN RAISE EXCEPTION 'query controls stale revision' USING ERRCODE='40001';END IF;
 INSERT INTO fabric.storage_query_controls(tenant_id,space_id,actor_id,session_id,task_id,run_id,revision,command_key,expected_revision,command_expires_at,controls)
 VALUES(t,sp,a,session_arg,n.task_id,n.run_id,expected+1,k,expected,expires,flags);
 PERFORM fabric.model_recovery_current(n.run_id,false);
 IF (fabric.model_current(n.run_id,NULL,false))->'record' IS DISTINCT FROM n.binding THEN
  RAISE EXCEPTION 'query controls native changed' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION fabric.storage_set_query_controls(uuid,uuid,numeric,timestamptz,jsonb) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_set_query_controls(uuid,uuid,numeric,timestamptz,jsonb) TO fabric_controller;
