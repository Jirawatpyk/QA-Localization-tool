-- Fix: parity_reports & missing_check_reports RLS policies use old current_setting() pattern
-- Migrating to (SELECT auth.jwt()) subquery pattern for consistency + per-query caching (94-99% faster)
-- Reference: 00001_rls_policies.sql

-- =============================================================================
-- PARITY_REPORTS: Replace 2 policies (SELECT, INSERT) + add UPDATE, DELETE
-- =============================================================================

DROP POLICY IF EXISTS "parity_reports_tenant_isolation_select" ON parity_reports;
DROP POLICY IF EXISTS "parity_reports_tenant_isolation_insert" ON parity_reports;

CREATE POLICY "Tenant isolation: SELECT" ON parity_reports
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON parity_reports
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON parity_reports
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON parity_reports
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- =============================================================================
-- MISSING_CHECK_REPORTS: Replace 2 policies (SELECT, INSERT) + add UPDATE, DELETE
-- =============================================================================

DROP POLICY IF EXISTS "missing_check_reports_tenant_isolation_select" ON missing_check_reports;
DROP POLICY IF EXISTS "missing_check_reports_tenant_isolation_insert" ON missing_check_reports;

CREATE POLICY "Tenant isolation: SELECT" ON missing_check_reports
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON missing_check_reports
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON missing_check_reports
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON missing_check_reports
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);
