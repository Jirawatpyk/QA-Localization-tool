-- Audit Logs: 3-Layer Immutability Protection
-- Layer 1: Application code — only INSERT (enforced in writeAuditLog helper)
-- Layer 2: RLS INSERT-only policy
-- Layer 3: DB trigger blocking UPDATE/DELETE

-- =============================================================================
-- Layer 2: RLS — INSERT only for audit_logs
-- =============================================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin can SELECT audit logs for their tenant
CREATE POLICY "Audit: SELECT for tenant" ON audit_logs
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- Any authenticated user can INSERT audit logs for their tenant
CREATE POLICY "Audit: INSERT only" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- NO UPDATE or DELETE policies — blocked at RLS level

-- =============================================================================
-- Layer 3: DB Trigger — blocks UPDATE/DELETE even for service_role
-- =============================================================================
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is immutable: % operations are not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_immutable_guard
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
