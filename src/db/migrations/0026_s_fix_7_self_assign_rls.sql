-- S-FIX-7: Self-assignment RLS + Lock Visibility for Concurrent Review
-- Guardrail #63: Atomic DROP + CREATE migration (idempotent)
-- Guardrail #62-65: RLS scoped access, app-level + RLS double defense
--
-- Changes:
-- 1. Add INSERT policy for native_reviewer self-assignment (assigned_to = assigned_by = auth.uid())
-- 2. Replace own-only SELECT policy with tenant-wide SELECT for native_reviewer
--    (lock visibility — reviewer B must see reviewer A's lock for soft lock to work)

-- =============================================================================
-- Section 1: Self-assign INSERT policy for native_reviewer
-- native_reviewer can INSERT only where assigned_to = assigned_by = self
-- =============================================================================

DROP POLICY IF EXISTS "file_assignments_insert_self_assign" ON file_assignments;

CREATE POLICY "file_assignments_insert_self_assign" ON file_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
    AND assigned_by = ((SELECT auth.jwt()) ->> 'sub')::uuid
  );

-- =============================================================================
-- Section 2: Expand native_reviewer SELECT from own-only to tenant-wide
-- Reviewer B MUST see Reviewer A's lock for soft lock to function
-- qa_reviewer already has tenant-wide SELECT via _select_admin_qa — no change
-- =============================================================================

DROP POLICY IF EXISTS "file_assignments_select_native" ON file_assignments;

DROP POLICY IF EXISTS "file_assignments_select_reviewer_locks" ON file_assignments;

CREATE POLICY "file_assignments_select_reviewer_locks" ON file_assignments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
  );
