BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fabric_controller') THEN CREATE ROLE fabric_controller NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fabric_worker') THEN CREATE ROLE fabric_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('fabric_controller','fabric_worker') AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole)) THEN RAISE EXCEPTION 'existing privileged role incompatible'; END IF;
END $$;
REVOKE ALL ON SCHEMA fabric FROM fabric_worker;
REVOKE ALL ON ALL TABLES IN SCHEMA fabric FROM fabric_worker;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fabric FROM fabric_worker;
GRANT USAGE ON SCHEMA fabric TO fabric_controller;
GRANT SELECT, INSERT ON fabric.authority_mutations TO fabric_controller;
GRANT SELECT, INSERT, UPDATE ON fabric.tasks, fabric.task_revisions, fabric.runs, fabric.run_events, fabric.commands, fabric.outbox TO fabric_controller;
GRANT EXECUTE ON FUNCTION fabric.current_tenant(),fabric.current_space(),fabric.current_identity(),fabric.service_scope(uuid,uuid) TO fabric_controller;
-- app.* are TRUSTED SERVICE assertions, not credentials. Workers never receive connections/grants.
-- A fixed-query helper permits current payer checks despite actors' self-only RLS.
-- Shared row locks make authority revocations serialize with the entire transaction.
CREATE FUNCTION fabric.controller_authority() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, fabric AS $$
DECLARE s fabric.spaces%ROWTYPE; m fabric.memberships%ROWTYPE; a fabric.actors%ROWTYPE; p fabric.actors%ROWTYPE;
 t uuid := fabric.current_tenant(); sp uuid := fabric.current_space(); act uuid := fabric.current_identity();
BEGIN
 IF current_setting('app.identity_verified',true) IS DISTINCT FROM 'true' OR t IS NULL OR sp IS NULL OR act IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO s FROM fabric.spaces WHERE tenant_id=t AND space_id=sp FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO m FROM fabric.memberships WHERE tenant_id=t AND space_id=sp AND actor_id=act FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- Stable actor order avoids deadlocks when payer and acting identities differ.
 PERFORM 1 FROM fabric.actors WHERE tenant_id=t AND actor_id IN (act,s.payer_actor_id) ORDER BY actor_id FOR SHARE;
 SELECT * INTO a FROM fabric.actors WHERE tenant_id=t AND actor_id=act;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO p FROM fabric.actors WHERE tenant_id=t AND actor_id=s.payer_actor_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('tenantId',t,'spaceId',sp,'actorId',act,'payerId',s.payer_actor_id,'authorityRevision',s.authority_revision,
 'membershipRevision',m.revision,'grants',m.grants,'actorRevoked',a.revoked_at IS NOT NULL,'payerRevoked',p.revoked_at IS NOT NULL,
 'membershipRevoked',m.revoked_at IS NOT NULL,'lifecycle',s.lifecycle);
END $$;
REVOKE ALL ON FUNCTION fabric.controller_authority() FROM PUBLIC,fabric_worker;
GRANT EXECUTE ON FUNCTION fabric.controller_authority() TO fabric_controller;
COMMIT;
