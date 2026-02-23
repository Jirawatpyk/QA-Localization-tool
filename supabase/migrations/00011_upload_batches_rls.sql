-- RLS Policies for upload_batches table
-- Pattern: same tenant isolation as all other tenant-scoped tables
-- Performance: Uses (SELECT auth.jwt()) subquery wrapper for per-query caching

-- =============================================================================
-- UPLOAD_BATCHES
-- =============================================================================
ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation: SELECT" ON upload_batches
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON upload_batches
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON upload_batches
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON upload_batches
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);
