-- The same installed owner cannot attribute one receipt/usage key twice across Spaces.
-- New indexes supplement (never replace) the original scoped composite relations.
CREATE UNIQUE INDEX model_usage_owner_receipt_once ON fabric.model_resolutions(tenant_id,owner_id,receipt_id);
CREATE UNIQUE INDEX model_usage_owner_key_once ON fabric.model_resolutions(tenant_id,owner_id,usage_key);
