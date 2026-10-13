-- Additive maintenance admission. Rollback of the unapplied migration preserves
-- v24; after installation this history is forward-only. No content plaintext.
CREATE TABLE fabric.storage_maintenance_admissions (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,material_id uuid NOT NULL,
 builder text NOT NULL CHECK(builder IN('summary-v1','keywords-v1','cache-v1')),
 profile text NOT NULL CHECK(profile='local-deterministic-v1'),region text NOT NULL CHECK(region='local-fixture'),
 policy_digest text NOT NULL CHECK(policy_digest ~ '^sha256:[0-9a-f]{64}$'),plan_digest text NOT NULL CHECK(plan_digest ~ '^sha256:[0-9a-f]{64}$'),
 receipt_id uuid NOT NULL,session_id uuid NOT NULL,run_id uuid NOT NULL,native_revision fabric.safe_amount NOT NULL CHECK(native_revision>=0),
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),UNIQUE(tenant_id,space_id,receipt_id),
 FOREIGN KEY(tenant_id,space_id,receipt_id) REFERENCES fabric.model_resource_intervals(tenant_id,space_id,receipt_id),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_head_publications DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,space_id,session_id) REFERENCES fabric.model_sessions(tenant_id,space_id,session_id)
);
CREATE TABLE fabric.storage_maintenance_receipts (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,actor_id uuid NOT NULL,command_key uuid NOT NULL,
 class text NOT NULL CHECK(class IN('summary','index','cache')),id uuid NOT NULL,revision fabric.safe_amount NOT NULL,witness text NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),UNIQUE(tenant_id,space_id,class,id,revision),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key) REFERENCES fabric.storage_maintenance_admissions,
 FOREIGN KEY(tenant_id,space_id,class,id,revision,witness) REFERENCES fabric.storage_graph_nodes(tenant_id,space_id,class,id,revision,witness)
);
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['storage_maintenance_admissions','storage_maintenance_receipts'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY storage_control_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('CREATE TRIGGER storage_control_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
CREATE FUNCTION fabric.storage_admit_maintenance(k uuid,j jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();n fabric.model_sessions%ROWTYPE;i fabric.model_resource_intervals%ROWTYPE;b fabric.storage_service_resources%ROWTYPE;x xid;
BEGIN
 IF NOT fabric.service_scope(t,sp) OR NOT((fabric.controller_authority())->'grants' ?& ARRAY['storage:read','storage:write','storage:maintenance','task:write']) THEN RAISE EXCEPTION 'maintenance admission denied' USING ERRCODE='42501';END IF;
 SELECT * INTO n FROM fabric.model_sessions WHERE (tenant_id,space_id,session_id)=(t,sp,(j->>'sessionId')::uuid);
 SELECT * INTO i FROM fabric.model_resource_intervals WHERE (tenant_id,space_id,receipt_id)=(t,sp,(j->>'receiptId')::uuid);
 SELECT xmin INTO x FROM fabric.model_resource_intervals WHERE (tenant_id,space_id,receipt_id)=(t,sp,(j->>'receiptId')::uuid);
 SELECT * INTO b FROM fabric.storage_service_resources WHERE (tenant_id,space_id,resource_id)=(t,sp,i.resource_id);
 IF x IS DISTINCT FROM (txid_current()%4294967296)::text::xid OR i.category IS DISTINCT FROM 'service' OR i.origin_run_id IS DISTINCT FROM n.run_id
 OR b.purpose IS DISTINCT FROM 'maintenance' OR b.origin_run_id IS DISTINCT FROM n.run_id OR b.actor_id IS DISTINCT FROM a
 OR n.binding->>'purpose' IS DISTINCT FROM 'maintenance' OR n.binding->>'intent' IS DISTINCT FROM 'Ask' OR n.run_id IS DISTINCT FROM (j->>'runId')::uuid
 OR (SELECT revision FROM fabric.model_native_controls WHERE (tenant_id,space_id,session_id)=(t,sp,n.session_id)) IS DISTINCT FROM (j->>'nativeRevision')::numeric THEN RAISE EXCEPTION 'maintenance binding denied' USING ERRCODE='23514';END IF;
 INSERT INTO fabric.storage_maintenance_admissions VALUES(t,sp,a,k,(j->>'materialId')::uuid,j->>'builder',j->>'profile',j->>'region',j->>'policyDigest',j->>'planDigest',i.receipt_id,n.session_id,n.run_id,(j->>'nativeRevision')::numeric);
END $$;
CREATE FUNCTION fabric.storage_record_maintenance(k uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE t uuid:=fabric.current_tenant();sp uuid:=fabric.current_space();a uuid:=fabric.current_identity();p fabric.storage_head_publications%ROWTYPE;m fabric.storage_maintenance_admissions%ROWTYPE;x xid;
BEGIN
 IF NOT fabric.service_scope(t,sp) THEN RAISE EXCEPTION 'maintenance scope denied' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM fabric.storage_head_publications WHERE (tenant_id,space_id,actor_id,command_key)=(t,sp,a,k);
 SELECT xmin INTO x FROM fabric.storage_head_publications WHERE (tenant_id,space_id,actor_id,command_key)=(t,sp,a,k);
 SELECT * INTO m FROM fabric.storage_maintenance_admissions WHERE (tenant_id,space_id,actor_id,command_key)=(t,sp,a,k);
 IF x IS DISTINCT FROM (txid_current()%4294967296)::text::xid OR p.material_id IS DISTINCT FROM m.material_id
 OR p.class IS DISTINCT FROM (CASE m.builder WHEN 'summary-v1' THEN 'summary' WHEN 'keywords-v1' THEN 'index' WHEN 'cache-v1' THEN 'cache' END) THEN RAISE EXCEPTION 'maintenance publication denied' USING ERRCODE='23514';END IF;
 INSERT INTO fabric.storage_maintenance_receipts VALUES(t,sp,a,k,p.class,p.id,p.revision,p.witness);
END $$;
CREATE FUNCTION fabric.storage_maintenance_complete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM fabric.storage_maintenance_receipts r JOIN fabric.storage_head_publications p USING(tenant_id,space_id,actor_id,command_key)
 JOIN fabric.storage_epoch_publications e USING(tenant_id,space_id,actor_id,command_key)
 JOIN fabric.model_resource_intervals i ON (i.tenant_id,i.space_id,i.receipt_id)=(NEW.tenant_id,NEW.space_id,NEW.receipt_id)
 JOIN fabric.budget_reservations b ON (b.tenant_id,b.space_id,b.reservation_id)=(i.tenant_id,i.space_id,i.reservation_id)
 WHERE (r.tenant_id,r.space_id,r.actor_id,r.command_key)=(NEW.tenant_id,NEW.space_id,NEW.actor_id,NEW.command_key)
 AND (r.class,r.id,r.revision,r.witness)=(p.class,p.id,p.revision,p.witness) AND p.material_id=NEW.material_id AND e.session_id=NEW.session_id
 AND i.origin_run_id=NEW.run_id AND i.category='service' AND b.state='settled' AND b.reconciliation_receipt=i.record)
 THEN RAISE EXCEPTION 'incomplete maintenance result' USING ERRCODE='23514';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER storage_maintenance_required AFTER INSERT ON fabric.storage_maintenance_admissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fabric.storage_maintenance_complete();
REVOKE ALL ON FUNCTION fabric.storage_admit_maintenance(uuid,jsonb),fabric.storage_record_maintenance(uuid),fabric.storage_maintenance_complete() FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.storage_admit_maintenance(uuid,jsonb),fabric.storage_record_maintenance(uuid) TO fabric_controller;
