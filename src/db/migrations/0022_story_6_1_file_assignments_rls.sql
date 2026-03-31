-- Story 6.1: File Assignment RLS Policies + Realtime Publication
-- Guardrail #62: EXISTS subquery pattern (not needed here — direct column check)
-- Guardrail #63: Atomic DROP + CREATE migration
-- Guardrail #65: Composite index on file_assignments

-- =============================================================================
-- Section 1: Drop existing tenant-only RLS policies (from 00001_rls_policies.sql)
-- Replace with role-scoped policies per AC5
-- =============================================================================

DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON file_assignments;
DROP POLICY IF EXISTS "Tenant isolation: INSERT" ON file_assignments;
DROP POLICY IF EXISTS "Tenant isolation: UPDATE" ON file_assignments;
DROP POLICY IF EXISTS "Tenant isolation: DELETE" ON file_assignments;

-- =============================================================================
-- Section 2: Role-scoped RLS policies for file_assignments
-- Pattern: matches finding_assignments from 00026_story_5_2b
-- =============================================================================

-- Drop new policies if re-running (idempotent)
DROP POLICY IF EXISTS "file_assignments_select_admin_qa" ON file_assignments;
DROP POLICY IF EXISTS "file_assignments_select_native" ON file_assignments;
DROP POLICY IF EXISTS "file_assignments_insert_admin_qa" ON file_assignments;
DROP POLICY IF EXISTS "file_assignments_update_admin_qa" ON file_assignments;
DROP POLICY IF EXISTS "file_assignments_update_assigned" ON file_assignments;
DROP POLICY IF EXISTS "file_assignments_delete_admin" ON file_assignments;

-- Admin + QA: full tenant SELECT
CREATE POLICY "file_assignments_select_admin_qa" ON file_assignments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Native reviewer: SELECT own assignments only
CREATE POLICY "file_assignments_select_native" ON file_assignments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
  );

-- Admin + QA: INSERT (they create/reassign assignments)
CREATE POLICY "file_assignments_insert_admin_qa" ON file_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Admin + QA: UPDATE (full tenant scope — status changes, takeover)
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

-- Assigned reviewer: UPDATE own assignment (status transitions + heartbeat)
-- Allowed transitions: assigned→in_progress, in_progress→completed, in_progress→assigned (release)
-- Cannot change: assigned_to, assigned_by, tenant_id, project_id, file_id
CREATE POLICY "file_assignments_update_assigned" ON file_assignments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
  )
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
    AND status IN ('assigned', 'in_progress', 'completed')
  );

-- Admin only: DELETE assignments
CREATE POLICY "file_assignments_delete_admin" ON file_assignments
  FOR DELETE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'admin'
  );

-- =============================================================================
-- Section 3: Realtime publication (Guardrail: DO $$ IF NOT EXISTS $$ pattern)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'file_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE file_assignments;
  END IF;
END $$;

-- =============================================================================
-- Section 4: Performance index (Guardrail #84)
-- idx on (project_id, status) for workload queries and queue listing
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_file_assignments_project_status
  ON file_assignments (project_id, status);
