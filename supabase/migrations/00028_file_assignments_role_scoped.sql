-- Story 5.2c CR-M6: file_assignments INSERT/UPDATE/DELETE role-scoped policies
-- Guardrail #63: Atomic DROP+CREATE in single transaction
--
-- Previously: file_assignments had tenant-only CRUD policies (from 00001).
-- Now: INSERT/UPDATE restricted to admin + qa_reviewer, DELETE to admin only.
-- SELECT remains tenant-scoped (native_reviewer needs to see their own assignments).
-- NOTE: native_reviewer excluded from write operations — assignments are created
-- by QA reviewers/admins, not by native reviewers themselves.

BEGIN;

-- Section 1: file_assignments INSERT — restrict to admin + qa_reviewer
DROP POLICY IF EXISTS "Tenant isolation: INSERT" ON file_assignments;

CREATE POLICY "file_assignments_insert_admin_qa" ON file_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Section 2: file_assignments UPDATE — restrict to admin + qa_reviewer
DROP POLICY IF EXISTS "Tenant isolation: UPDATE" ON file_assignments;

CREATE POLICY "file_assignments_update_admin_qa" ON file_assignments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  )
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Section 3: file_assignments DELETE — restrict to admin only
DROP POLICY IF EXISTS "Tenant isolation: DELETE" ON file_assignments;

CREATE POLICY "file_assignments_delete_admin" ON file_assignments
  FOR DELETE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'admin'
  );

COMMIT;
