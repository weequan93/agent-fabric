-- Opaque current full-audience admissions beside encrypted answer/manifest.
-- No titles, source text, queries, answers or key material are duplicated here.
CREATE TABLE fabric.storage_ask_disclosure_admissions (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,ask_id uuid NOT NULL,
 envelope_digest text NOT NULL CHECK(envelope_digest ~ '^sha256:[0-9a-f]{64}$'),
 audiences jsonb NOT NULL CHECK(jsonb_typeof(audiences)='array' AND jsonb_array_length(audiences)<=65 AND octet_length(audiences::text)<=1048576),
 PRIMARY KEY(tenant_id,space_id,ask_id),
 FOREIGN KEY(tenant_id,space_id,ask_id) REFERENCES fabric.storage_ask_receipts
);
ALTER TABLE fabric.storage_ask_disclosure_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric.storage_ask_disclosure_admissions FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_disclosure_scope ON fabric.storage_ask_disclosure_admissions
 USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id));
CREATE TRIGGER storage_disclosure_immutable BEFORE UPDATE OR DELETE ON fabric.storage_ask_disclosure_admissions
 FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
REVOKE ALL ON fabric.storage_ask_disclosure_admissions FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT SELECT ON fabric.storage_ask_disclosure_admissions TO fabric_controller;
CREATE FUNCTION fabric.storage_ask_current_audiences(ask uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();r fabric.storage_ask_receipts%ROWTYPE;result jsonb;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'disclosure scope denied' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM fabric.storage_ask_receipts WHERE tenant_id=t AND space_id=sp AND id=ask AND actor_id=fabric.current_identity();
 IF NOT FOUND THEN RAISE EXCEPTION 'disclosure origin denied' USING ERRCODE='42501';END IF;
 SELECT jsonb_agg(jsonb_build_object('taskId',task_id,'audience',fabric.identity_audience(sp,sp,task_id)) ORDER BY task_id)
 INTO result FROM (SELECT r.task_id UNION SELECT k.source_task_id FROM fabric.storage_ask_dependencies d JOIN fabric.storage_knowledge_revisions k
 ON(k.tenant_id,k.space_id,k.id,k.revision)=(d.tenant_id,d.space_id,d.knowledge_id,d.knowledge_revision)
 WHERE d.tenant_id=t AND d.space_id=sp AND d.ask_id=ask) tasks;
 RETURN result;
END $$;
CREATE FUNCTION fabric.storage_admit_ask_disclosure(ask uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();r fabric.storage_ask_receipts%ROWTYPE;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'disclosure scope denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(format('["recovery-space-barrier","%s","%s"]',t,sp),0));
 SELECT * INTO r FROM fabric.storage_ask_receipts WHERE tenant_id=t AND space_id=sp AND id=ask AND actor_id=fabric.current_identity();
 IF NOT FOUND OR r.xmin::text IS DISTINCT FROM pg_current_xact_id()::text THEN
  RAISE EXCEPTION 'disclosure fresh publication denied' USING ERRCODE='42501';END IF;
 INSERT INTO fabric.storage_ask_disclosure_admissions VALUES(t,sp,ask,'sha256:'||encode(sha256(convert_to(r.envelope::text,'UTF8')),'hex'),fabric.storage_ask_current_audiences(ask));
END $$;
REVOKE ALL ON FUNCTION fabric.storage_ask_current_audiences(uuid),fabric.storage_admit_ask_disclosure(uuid) FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_ask_current_audiences(uuid),fabric.storage_admit_ask_disclosure(uuid) TO fabric_controller;
