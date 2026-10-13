-- Owned synthetic F05 extension. F04 functions, columns and grants are retained.
-- Enrollment is fixture-admin only; serving roles cannot mint logical resources.
LOCK TABLE fabric.model_computer_assignments,fabric.model_resource_bindings IN ACCESS EXCLUSIVE MODE;
CREATE TABLE fabric.storage_service_resources (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,resource_id uuid NOT NULL,
 owner_id uuid NOT NULL,generation fabric.safe_amount NOT NULL CHECK(generation>0),
 purpose text NOT NULL CHECK(purpose IN('ask','maintenance')),
 origin_run_id uuid NOT NULL,actor_id uuid NOT NULL,payer_id uuid NOT NULL,
 department_id uuid NOT NULL,allowance_id uuid NOT NULL,cost_center text NOT NULL,
 PRIMARY KEY(tenant_id,space_id,resource_id),UNIQUE(tenant_id,resource_id),
 FOREIGN KEY(tenant_id,space_id) REFERENCES fabric.spaces,
 FOREIGN KEY(tenant_id,space_id,origin_run_id) REFERENCES fabric.model_billing_bindings(tenant_id,space_id,run_id),
 FOREIGN KEY(tenant_id,space_id,allowance_id) REFERENCES fabric.model_allowance_metadata,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES fabric.actors,
 FOREIGN KEY(tenant_id,payer_id) REFERENCES fabric.actors
);
CREATE TABLE fabric.storage_resource_identities (
 tenant_id uuid NOT NULL,space_id uuid NOT NULL,resource_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('computer','logical-service')),
 PRIMARY KEY(tenant_id,space_id,resource_id),UNIQUE(tenant_id,resource_id),
 FOREIGN KEY(tenant_id,space_id) REFERENCES fabric.spaces
);
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['storage_service_resources','storage_resource_identities'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY storage_resource_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('CREATE TRIGGER storage_resource_immutable BEFORE UPDATE OR DELETE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT ON fabric.%I TO fabric_controller',n);
 END LOOP;
END $$;
CREATE FUNCTION fabric.storage_service_enrollment_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE b fabric.model_billing_bindings%ROWTYPE;
BEGIN
 SELECT * INTO b FROM fabric.model_billing_bindings WHERE (tenant_id,space_id,run_id)=(NEW.tenant_id,NEW.space_id,NEW.origin_run_id);
 IF NOT FOUND OR (b.actor_id,b.payer_id,b.department_id,b.leaf_allowance,b.cost_center) IS DISTINCT FROM
  (NEW.actor_id,NEW.payer_id,NEW.department_id,NEW.allowance_id,NEW.cost_center)
  OR b.record->>'intent' IS DISTINCT FROM 'Ask' OR b.record->>'category' IS DISTINCT FROM 'service'
  OR b.record->>'purpose' IS DISTINCT FROM (CASE NEW.purpose WHEN 'ask' THEN 'answer' ELSE 'maintenance' END)
  OR EXISTS(SELECT 1 FROM fabric.model_computer_assignments WHERE tenant_id=NEW.tenant_id AND resource_id=NEW.resource_id)
 THEN RAISE EXCEPTION 'storage service enrollment denied' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER storage_service_enrollment_guard BEFORE INSERT ON fabric.storage_service_resources
 FOR EACH ROW EXECUTE FUNCTION fabric.storage_service_enrollment_guard();
CREATE FUNCTION fabric.storage_resource_identity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE c boolean;s boolean;
BEGIN
 c:=EXISTS(SELECT 1 FROM fabric.model_computer_assignments WHERE (tenant_id,space_id,resource_id)=(NEW.tenant_id,NEW.space_id,NEW.resource_id));
 s:=EXISTS(SELECT 1 FROM fabric.storage_service_resources WHERE (tenant_id,space_id,resource_id)=(NEW.tenant_id,NEW.space_id,NEW.resource_id));
 IF c=s OR (NEW.kind='computer') IS DISTINCT FROM c THEN
  RAISE EXCEPTION 'storage resource subtype denied' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER storage_resource_identity_guard BEFORE INSERT ON fabric.storage_resource_identities
 FOR EACH ROW EXECUTE FUNCTION fabric.storage_resource_identity_guard();
CREATE FUNCTION fabric.storage_register_resource_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
BEGIN
 INSERT INTO fabric.storage_resource_identities VALUES(NEW.tenant_id,NEW.space_id,NEW.resource_id,
  CASE TG_TABLE_NAME WHEN 'model_computer_assignments' THEN 'computer' WHEN 'storage_service_resources' THEN 'logical-service' ELSE NULL END);
 RETURN NEW;
END $$;
CREATE TRIGGER storage_register_computer AFTER INSERT ON fabric.model_computer_assignments
 FOR EACH ROW EXECUTE FUNCTION fabric.storage_register_resource_identity();
CREATE TRIGGER storage_register_service AFTER INSERT ON fabric.storage_service_resources
 FOR EACH ROW EXECUTE FUNCTION fabric.storage_register_resource_identity();
-- Every legacy computer is registered exactly; no synthetic computer is created.
INSERT INTO fabric.storage_resource_identities SELECT tenant_id,space_id,resource_id,'computer' FROM fabric.model_computer_assignments;
DO $$ DECLARE n text;v text;cnt integer;BEGIN
 SELECT count(*),min(conname::text),min(pg_get_constraintdef(oid)) INTO cnt,n,v FROM pg_constraint
 WHERE conrelid='fabric.model_resource_bindings'::regclass AND contype='f' AND confrelid='fabric.model_computer_assignments'::regclass;
 IF cnt<>1 OR v<>'FOREIGN KEY (tenant_id, space_id, resource_id) REFERENCES fabric.model_computer_assignments(tenant_id, space_id, resource_id)' THEN
  RAISE EXCEPTION 'unexpected installed computer FK' USING ERRCODE='23514';END IF;
 EXECUTE format('ALTER TABLE fabric.model_resource_bindings DROP CONSTRAINT %I',n);
 ALTER TABLE fabric.model_resource_bindings ADD CONSTRAINT storage_resource_identity_fk
  FOREIGN KEY(tenant_id,space_id,resource_id) REFERENCES fabric.storage_resource_identities(tenant_id,space_id,resource_id);
END $$;
CREATE FUNCTION fabric.storage_resource_binding_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE k text;s fabric.storage_service_resources%ROWTYPE;
BEGIN
 SELECT kind INTO k FROM fabric.storage_resource_identities WHERE (tenant_id,space_id,resource_id)=(NEW.tenant_id,NEW.space_id,NEW.resource_id);
 IF k='computer' THEN
  IF NOT EXISTS(SELECT 1 FROM fabric.model_computer_assignments WHERE (tenant_id,space_id,resource_id)=(NEW.tenant_id,NEW.space_id,NEW.resource_id)) THEN
   RAISE EXCEPTION 'computer relation denied' USING ERRCODE='23514';END IF;
 ELSIF k='logical-service' THEN
  SELECT * INTO s FROM fabric.storage_service_resources WHERE (tenant_id,space_id,resource_id)=(NEW.tenant_id,NEW.space_id,NEW.resource_id);
  IF NOT FOUND OR (NEW.owner_id,NEW.generation,NEW.actor_id,NEW.payer_id,NEW.department_id,NEW.allowance_id,NEW.anchor_run_id,NEW.purpose,NEW.cost_center)
   IS DISTINCT FROM (s.owner_id,s.generation,s.actor_id,s.payer_id,s.department_id,s.allowance_id,s.origin_run_id,s.purpose,s.cost_center) THEN
   RAISE EXCEPTION 'service relation denied' USING ERRCODE='23514';END IF;
 ELSE RAISE EXCEPTION 'unknown resource subtype' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER storage_resource_binding_guard BEFORE INSERT ON fabric.model_resource_bindings
 FOR EACH ROW EXECUTE FUNCTION fabric.storage_resource_binding_guard();
CREATE FUNCTION fabric.storage_resource_category_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE s fabric.storage_service_resources%ROWTYPE;
BEGIN
 SELECT * INTO s FROM fabric.storage_service_resources WHERE (tenant_id,space_id,resource_id)=(NEW.tenant_id,NEW.space_id,NEW.resource_id);
 IF FOUND THEN
  IF NEW.category<>'service' THEN RAISE EXCEPTION 'service category denied' USING ERRCODE='23514';END IF;
  IF TG_TABLE_NAME='model_resource_intervals' THEN
   IF NEW.origin_run_id IS DISTINCT FROM s.origin_run_id OR NEW.record->>'category' IS DISTINCT FROM 'service'
    OR NEW.record->>'originRunId' IS DISTINCT FROM s.origin_run_id::text THEN
    RAISE EXCEPTION 'service origin denied' USING ERRCODE='23514';END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER storage_resource_rate_guard BEFORE INSERT ON fabric.model_resource_rates
 FOR EACH ROW EXECUTE FUNCTION fabric.storage_resource_category_guard();
CREATE TRIGGER storage_resource_interval_guard BEFORE INSERT ON fabric.model_resource_intervals
 FOR EACH ROW EXECUTE FUNCTION fabric.storage_resource_category_guard();
REVOKE ALL ON FUNCTION fabric.storage_service_enrollment_guard(),fabric.storage_resource_identity_guard(),
 fabric.storage_register_resource_identity(),fabric.storage_resource_binding_guard(),fabric.storage_resource_category_guard()
 FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp;
