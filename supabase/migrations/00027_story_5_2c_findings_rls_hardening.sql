-- Story 5.2c: TD-RLS-001 — findings INSERT/DELETE role-scoped policies
-- Guardrail #63: Atomic DROP+CREATE in single transaction
--
-- Previously: findings INSERT/DELETE used tenant-only isolation.
-- Now: findings INSERT restricted to admin + qa_reviewer, DELETE to admin only.
-- Pipeline uses service_role (bypasses RLS) — unaffected.
--
-- JWT claims used:
--   ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
--   ((SELECT auth.jwt()) ->> 'user_role')  — 'admin' | 'qa_reviewer' | 'native_reviewer'

BEGIN;

-- =============================================================================
-- Section 1: findings INSERT — restrict to admin + qa_reviewer
-- =============================================================================
DROP POLICY IF EXISTS "Tenant isolation: INSERT" ON findings;

CREATE POLICY "findings_insert_admin_qa" ON findings
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- =============================================================================
-- Section 2: findings DELETE — restrict to admin only
-- =============================================================================
DROP POLICY IF EXISTS "Tenant isolation: DELETE" ON findings;

CREATE POLICY "findings_delete_admin" ON findings
  FOR DELETE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'admin'
  );

COMMIT;
