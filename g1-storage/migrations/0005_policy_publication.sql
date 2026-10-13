-- An authenticated synthetic policy owner can only reduce authority/periods.
-- No existing owner/schema/function or historical policy is replaced.
CREATE TABLE fabric.storage_policy_changes (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 previous_policy_revision fabric.safe_amount NOT NULL,policy_revision fabric.safe_amount NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),UNIQUE(tenant_id,space_id,policy_revision),
 CHECK(policy_revision>previous_policy_revision),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_epoch_publications,
 FOREIGN KEY(tenant_id,space_id,previous_policy_revision) REFERENCES fabric.storage_policy,
 FOREIGN KEY(tenant_id,space_id,policy_revision) REFERENCES fabric.storage_policy
);
ALTER TABLE fabric.storage_policy_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_policy_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_control_scope ON fabric.storage_policy_changes
 USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.storage_policy_changes
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_policy_changes FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_policy_changes TO fabric_controller;
CREATE FUNCTION fabric.storage_reduce_policy(k uuid,b text,sid uuid,previous numeric,old_anchor uuid,
 new_anchor uuid,old_digest text,new_digest text,old_policy numeric,new_policy numeric,
 periods jsonb,operations jsonb,expires timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();
 e fabric.storage_authority_epoch%ROWTYPE;p fabric.storage_policy%ROWTYPE;authority jsonb;admission jsonb;
 classes text[]:=ARRAY['source','knowledge','artifact','draft','live-file','checkpoint','summary','index','cache','ask','backup'];
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'storage policy scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["storage-epoch-original","%s","%s","%s","%s"]',t,sp,a,k),0));
 authority:=fabric.controller_authority();
 IF authority IS NULL OR jsonb_typeof(authority->'grants')<>'array' OR NOT(authority->'grants' ? 'storage:maintenance')
  OR NOT(authority->'grants' ? 'task:write') OR NOT(authority->'grants' ? 'storage:policy-admin') OR authority->>'lifecycle'<>'active'
  OR (authority->>'actorRevoked')::boolean OR (authority->>'payerRevoked')::boolean OR (authority->>'membershipRevoked')::boolean
  OR expires IS NULL OR expires<=clock_timestamp() OR expires>='infinity'::timestamptz THEN
  RAISE EXCEPTION 'storage policy authority denied' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM fabric.storage_authority_epoch WHERE tenant_id=t AND space_id=sp ORDER BY epoch DESC LIMIT 1;
 IF NOT FOUND OR e.epoch IS DISTINCT FROM previous OR e.anchor_id IS DISTINCT FROM old_anchor OR e.control_digest IS DISTINCT FROM old_digest OR e.policy_revision IS DISTINCT FROM old_policy
  OR new_policy IS DISTINCT FROM (SELECT max(revision)+1 FROM fabric.storage_policy WHERE tenant_id=t AND space_id=sp) THEN
  RAISE EXCEPTION 'storage policy stale' USING ERRCODE='23514';END IF;
 SELECT * INTO p FROM fabric.storage_policy WHERE tenant_id=t AND space_id=sp AND revision=old_policy;
 IF NOT FOUND OR NOT(p.operations ? 'maintenance') OR jsonb_typeof(periods) IS DISTINCT FROM 'object'
  OR jsonb_typeof(operations) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'storage policy invalid' USING ERRCODE='23514';END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(periods))<>11 OR NOT(periods ?& classes)
  OR EXISTS(SELECT 1 FROM jsonb_each(periods) x WHERE jsonb_typeof(x.value)<>'number' OR x.value::text !~ '^[1-9][0-9]{0,4}$') THEN
  RAISE EXCEPTION 'storage policy periods invalid' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(periods) x WHERE (x.value::text)::numeric>86400
  OR (x.value::text)::numeric>(p.periods->>x.key)::numeric)
  OR NOT(operations ? 'maintenance') OR jsonb_array_length(operations)>7
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(operations) x WHERE jsonb_typeof(x.value)<>'string'
   OR NOT(p.operations @> jsonb_build_array(x.value)) OR NOT(x.value #>> '{}' =ANY(ARRAY['read','write','forget','backup','restore','maintenance','share'])))
  OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(operations))<>jsonb_array_length(operations)
  OR (periods=p.periods AND operations @> p.operations) THEN
  RAISE EXCEPTION 'storage policy expansion denied' USING ERRCODE='42501';END IF;
 SELECT c.admission INTO admission FROM fabric.model_native_controls c JOIN fabric.model_sessions s USING(tenant_id,space_id,session_id)
 WHERE c.tenant_id=t AND c.space_id=sp AND c.session_id=sid AND s.binding->>'actorId'=a::text
  AND s.binding->>'intent'='Ask' AND s.binding->>'purpose'='maintenance';
 IF admission IS NULL OR admission->>'executionClass'<>'service' OR admission->>'resourceId' IS NOT NULL
  OR admission->>'computerCapability' IS NOT NULL OR (admission->>'targetEffect')::boolean
  OR (admission->>'approvalRequired')::boolean THEN
  RAISE EXCEPTION 'storage policy native denied' USING ERRCODE='42501';END IF;
 INSERT INTO fabric.storage_policy VALUES(t,sp,new_policy,periods,operations);
 INSERT INTO fabric.storage_authority_epoch VALUES(t,sp,previous+1,new_anchor,new_policy,new_digest,clock_timestamp());
 INSERT INTO fabric.storage_epoch_publications VALUES(t,sp,a,k,b,sid,previous,previous+1,new_anchor,expires,clock_timestamp());
 INSERT INTO fabric.storage_policy_changes VALUES(t,sp,a,k,old_policy,new_policy);
END $$;
REVOKE ALL ON FUNCTION fabric.storage_reduce_policy(uuid,text,uuid,numeric,uuid,uuid,text,text,numeric,numeric,jsonb,jsonb,timestamptz)
 FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_reduce_policy(uuid,text,uuid,numeric,uuid,uuid,text,text,numeric,numeric,jsonb,jsonb,timestamptz) TO fabric_controller;
