BEGIN;
-- Additive controller-owned records. No existing migration, ledger or role is replaced.
CREATE TABLE fabric.recovery_runs (
 tenant_id uuid NOT NULL, space_id uuid NOT NULL, run_id uuid NOT NULL, task_id uuid NOT NULL,
 binding jsonb NOT NULL, record jsonb NOT NULL, revision fabric.safe_amount NOT NULL,
 PRIMARY KEY(tenant_id,space_id,run_id),
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.runs,
 FOREIGN KEY(tenant_id,space_id,task_id) REFERENCES fabric.tasks
);
CREATE TABLE fabric.recovery_sessions (
 tenant_id uuid NOT NULL, space_id uuid NOT NULL, session_id uuid NOT NULL, run_id uuid NOT NULL,
 binding jsonb NOT NULL, record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,session_id),
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.recovery_runs DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE fabric.recovery_leases (
 tenant_id uuid NOT NULL, space_id uuid NOT NULL, lease_id uuid NOT NULL, run_id uuid NOT NULL,
 binding jsonb NOT NULL, record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,lease_id),
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.recovery_runs DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE fabric.recovery_operations (
 tenant_id uuid NOT NULL, space_id uuid NOT NULL, operation_id uuid NOT NULL, run_id uuid NOT NULL,
 binding jsonb NOT NULL, record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,space_id,operation_id),
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.recovery_runs DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX recovery_reservation_single_effect ON fabric.recovery_operations(tenant_id,space_id,(binding->>'budgetReservationId'));
CREATE TABLE fabric.recovery_results (
 tenant_id uuid NOT NULL, space_id uuid NOT NULL, run_id uuid NOT NULL,
 record jsonb NOT NULL, PRIMARY KEY(tenant_id,space_id,run_id),
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.recovery_runs DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE fabric.recovery_receipts (
 tenant_id uuid NOT NULL, space_id uuid NOT NULL, actor_id uuid NOT NULL, command_key uuid NOT NULL,
 command_id uuid NOT NULL, run_id uuid NOT NULL, payload_digest text NOT NULL,
 receipt jsonb NOT NULL, outbox_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,space_id,actor_id,command_key),
 UNIQUE(tenant_id,space_id,command_id), UNIQUE(tenant_id,space_id,outbox_id),
 UNIQUE(tenant_id,space_id,actor_id,command_key,run_id,outbox_id),
 FOREIGN KEY(tenant_id,space_id,run_id) REFERENCES fabric.recovery_runs DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE fabric.recovery_outbox (
 tenant_id uuid NOT NULL, space_id uuid NOT NULL, outbox_id uuid NOT NULL,
 actor_id uuid NOT NULL, command_key uuid NOT NULL, run_id uuid NOT NULL,
 kind text NOT NULL, payload jsonb NOT NULL, authority_revision fabric.safe_amount NOT NULL,
 completed_at timestamptz, PRIMARY KEY(tenant_id,space_id,outbox_id),
 UNIQUE(tenant_id,space_id,actor_id,command_key),
 UNIQUE(tenant_id,space_id,actor_id,command_key,run_id,outbox_id),
 FOREIGN KEY(tenant_id,space_id,actor_id,command_key,run_id,outbox_id) REFERENCES fabric.recovery_receipts(tenant_id,space_id,actor_id,command_key,run_id,outbox_id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE fabric.recovery_receipts ADD FOREIGN KEY(tenant_id,space_id,actor_id,command_key,run_id,outbox_id) REFERENCES fabric.recovery_outbox(tenant_id,space_id,actor_id,command_key,run_id,outbox_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TRIGGER recovery_immutable_receipt BEFORE UPDATE OR DELETE ON fabric.recovery_receipts FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change();
CREATE FUNCTION fabric.recovery_protect_outbox() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF (to_jsonb(NEW)-'completed_at') IS DISTINCT FROM (to_jsonb(OLD)-'completed_at') OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN RAISE EXCEPTION 'immutable recovery outbox event';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_recovery_outbox BEFORE UPDATE ON fabric.recovery_outbox FOR EACH ROW EXECUTE FUNCTION fabric.recovery_protect_outbox();
CREATE FUNCTION fabric.recovery_protect_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,fabric AS $$
BEGIN
 IF (to_jsonb(NEW)-'record'-'revision') IS DISTINCT FROM (to_jsonb(OLD)-'record'-'revision') THEN RAISE EXCEPTION 'immutable recovery binding';END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['recovery_runs','recovery_sessions','recovery_leases','recovery_operations'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_recovery_binding BEFORE UPDATE ON fabric.%I FOR EACH ROW EXECUTE FUNCTION fabric.recovery_protect_binding()',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['recovery_runs','recovery_sessions','recovery_leases','recovery_operations','recovery_results','recovery_receipts','recovery_outbox'] LOOP
  EXECUTE format('ALTER TABLE fabric.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE fabric.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY recovery_scope ON fabric.%I USING(fabric.service_scope(tenant_id,space_id)) WITH CHECK(fabric.service_scope(tenant_id,space_id))',n);
  EXECUTE format('REVOKE ALL ON fabric.%I FROM PUBLIC,fabric_worker,fabric_test_idp',n);
  EXECUTE format('GRANT SELECT,INSERT ON fabric.%I TO fabric_controller',n);
  IF n<>'recovery_receipts' THEN EXECUTE format('GRANT UPDATE ON fabric.%I TO fabric_controller',n);END IF;
 END LOOP;
END $$;
-- Fixed-query read helper: budget tables remain inaccessible to workers and the
-- recovery controller cannot mint or top up allowance/reservation authority.
CREATE FUNCTION fabric.recovery_budget_current(reservation uuid,run_value uuid,cost bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
DECLARE r fabric.budget_reservations%ROWTYPE; a fabric.budget_allowances%ROWTYPE; parent uuid; seen uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF current_setting('app.identity_verified',true) IS DISTINCT FROM 'true' OR cost<0 THEN RETURN false;END IF;
 SELECT * INTO r FROM fabric.budget_reservations WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND reservation_id=reservation FOR SHARE;
 IF NOT FOUND OR r.run_id<>run_value OR r.actor_id<>fabric.current_identity() OR r.state<>'active' OR r.amount-r.settled_amount<cost THEN RETURN false;END IF;
 parent:=r.allowance_id;
 WHILE parent IS NOT NULL LOOP
  IF parent=ANY(seen) OR cardinality(seen)>=64 THEN RETURN false;END IF;seen:=array_append(seen,parent);
  SELECT * INTO a FROM fabric.budget_allowances WHERE tenant_id=r.tenant_id AND space_id=r.space_id AND allowance_id=parent FOR SHARE;
  IF NOT FOUND OR a.payer_actor_id IS DISTINCT FROM (SELECT payer_actor_id FROM fabric.spaces WHERE tenant_id=r.tenant_id AND space_id=r.space_id) OR a.reserved<r.amount OR a.ceiling<a.reserved+a.settled THEN RETURN false;END IF;
  parent:=a.parent_allowance_id;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION fabric.recovery_budget_current(uuid,uuid,bigint),fabric.recovery_protect_binding(),fabric.recovery_protect_outbox() FROM PUBLIC,fabric_worker,fabric_test_idp;
GRANT EXECUTE ON FUNCTION fabric.recovery_budget_current(uuid,uuid,bigint) TO fabric_controller;
COMMIT;
