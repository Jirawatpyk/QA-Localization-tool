-- Story 5.2b: Role-Scoped RLS Policies for Native Reviewer Access
-- Guardrail #63: Atomic DROP+CREATE in single transaction
-- Guardrail #62: EXISTS subquery pattern for native-scoped policies
-- Guardrail #71: Enable RLS from migration day 1
--
-- JWT claims used:
--   ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
--   ((SELECT auth.jwt()) ->> 'user_role')  — 'admin' | 'qa_reviewer' | 'native_reviewer'
--   ((SELECT auth.jwt()) ->> 'sub')::uuid  — user ID

BEGIN;

-- =============================================================================
-- Section 0: ENABLE RLS on new tables (MUST be before policies)
-- =============================================================================
ALTER TABLE finding_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_comments ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Section 1: findings — Replace tenant-only SELECT/UPDATE with role-scoped
-- Keep existing INSERT + DELETE policies (pipeline + admin use)
-- =============================================================================
DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON findings;
DROP POLICY IF EXISTS "Tenant isolation: UPDATE" ON findings;

-- Admin + QA: full tenant access (same as before)
CREATE POLICY "findings_select_admin_qa" ON findings
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Native reviewer: only assigned findings via EXISTS
CREATE POLICY "findings_select_native" ON findings
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND EXISTS (
      SELECT 1 FROM finding_assignments fa
      WHERE fa.finding_id = findings.id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
        AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

-- Admin + QA: full tenant UPDATE
CREATE POLICY "findings_update_admin_qa" ON findings
  FOR UPDATE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  )
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Native reviewer: UPDATE only assigned findings (required for Story 5.2c confirm/override)
CREATE POLICY "findings_update_native" ON findings
  FOR UPDATE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND EXISTS (
      SELECT 1 FROM finding_assignments fa
      WHERE fa.finding_id = findings.id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
        AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  )
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND EXISTS (
      SELECT 1 FROM finding_assignments fa
      WHERE fa.finding_id = findings.id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
        AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

-- =============================================================================
-- Section 2: segments — Replace ALL tenant-only policies with role-scoped
-- Native reviewers must NOT modify segments (read-only via assigned findings)
-- Pipeline operations use service_role (bypasses RLS)
-- =============================================================================
DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON segments;
DROP POLICY IF EXISTS "Tenant isolation: INSERT" ON segments;
DROP POLICY IF EXISTS "Tenant isolation: UPDATE" ON segments;
DROP POLICY IF EXISTS "Tenant isolation: DELETE" ON segments;

-- Admin + QA: full tenant access
CREATE POLICY "segments_select_admin_qa" ON segments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Native reviewer: only segments linked to assigned findings via JOIN
-- Note: idx_findings_segment already exists (migration 00005) — no new index needed
CREATE POLICY "segments_select_native" ON segments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND EXISTS (
      SELECT 1 FROM findings f
      INNER JOIN finding_assignments fa ON fa.finding_id = f.id
      WHERE f.segment_id = segments.id
        AND f.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
        AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

-- Admin + QA: INSERT segments (pipeline uses service_role, not these policies)
CREATE POLICY "segments_insert_admin_qa" ON segments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Admin + QA: UPDATE segments
CREATE POLICY "segments_update_admin_qa" ON segments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  )
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Admin only: DELETE segments
CREATE POLICY "segments_delete_admin" ON segments
  FOR DELETE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'admin'
  );

-- =============================================================================
-- Section 3: review_actions — Replace ALL tenant-only policies with role-scoped
-- Native reviewer: SELECT + INSERT (on assigned findings only)
-- Admin + QA: full CRUD
-- =============================================================================
DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON review_actions;
DROP POLICY IF EXISTS "Tenant isolation: UPDATE" ON review_actions;
DROP POLICY IF EXISTS "Tenant isolation: DELETE" ON review_actions;

-- Admin + QA: full tenant SELECT
CREATE POLICY "review_actions_select_admin_qa" ON review_actions
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Native reviewer: SELECT only on assigned findings
CREATE POLICY "review_actions_select_native" ON review_actions
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND EXISTS (
      SELECT 1 FROM finding_assignments fa
      WHERE fa.finding_id = review_actions.finding_id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
        AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

-- Replace tenant-only INSERT with role-scoped (old policy allows all roles — too permissive)
DROP POLICY IF EXISTS "Tenant isolation: INSERT" ON review_actions;

-- Admin + QA: tenant-scoped INSERT
CREATE POLICY "review_actions_insert_admin_qa" ON review_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- G1 fix: Native reviewer INSERT on assigned findings (Story 5.2c confirm/override)
CREATE POLICY "review_actions_insert_native" ON review_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND EXISTS (
      SELECT 1 FROM finding_assignments fa
      WHERE fa.finding_id = review_actions.finding_id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
        AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

-- Admin + QA: UPDATE review_actions (audit trail corrections)
CREATE POLICY "review_actions_update_admin_qa" ON review_actions
  FOR UPDATE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  )
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Admin only: DELETE review_actions
CREATE POLICY "review_actions_delete_admin" ON review_actions
  FOR DELETE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'admin'
  );

-- =============================================================================
-- Section 4: finding_assignments — Role-scoped policies for new table
-- =============================================================================

-- Admin + QA: full tenant SELECT
CREATE POLICY "finding_assignments_select_admin_qa" ON finding_assignments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Native reviewer: SELECT own assignments only
CREATE POLICY "finding_assignments_select_native" ON finding_assignments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
  );

-- Admin + QA: INSERT (they create assignments)
CREATE POLICY "finding_assignments_insert" ON finding_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Admin + QA: UPDATE (full tenant scope)
CREATE POLICY "finding_assignments_update_admin_qa" ON finding_assignments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  )
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Native reviewer: UPDATE own assignments (WITH CHECK prevents reassignment)
CREATE POLICY "finding_assignments_update_native" ON finding_assignments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
  )
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
  );

-- Admin only: DELETE
CREATE POLICY "finding_assignments_delete" ON finding_assignments
  FOR DELETE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'admin'
  );

-- =============================================================================
-- Section 5: finding_comments — Role-scoped policies for new table
-- NO UPDATE policy (comments are immutable — AC2, RLS design N3)
-- =============================================================================

-- Admin + QA: full tenant SELECT
CREATE POLICY "finding_comments_select_admin_qa" ON finding_comments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Native reviewer: SELECT only comments on own assignments (G2 fix: tenant_id + finding_id check in EXISTS)
CREATE POLICY "finding_comments_select_native" ON finding_comments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND EXISTS (
      SELECT 1 FROM finding_assignments fa
      WHERE fa.id = finding_comments.finding_assignment_id
        AND fa.finding_id = finding_comments.finding_id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
        AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

-- Admin + QA: INSERT with author_id verification
CREATE POLICY "finding_comments_insert_admin_qa" ON finding_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
    AND author_id = ((SELECT auth.jwt()) ->> 'sub')::uuid
  );

-- Native reviewer: INSERT only on own assignments + author_id check + finding_id consistency
CREATE POLICY "finding_comments_insert_native" ON finding_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND author_id = ((SELECT auth.jwt()) ->> 'sub')::uuid
    AND EXISTS (
      SELECT 1 FROM finding_assignments fa
      WHERE fa.id = finding_comments.finding_assignment_id
        AND fa.finding_id = finding_comments.finding_id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
        AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

-- Admin only: DELETE
CREATE POLICY "finding_comments_delete" ON finding_comments
  FOR DELETE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'admin'
  );

-- =============================================================================
-- Section 6: Performance indexes (AC4, Guardrail #65)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_finding_assignments_finding_user
  ON finding_assignments (finding_id, assigned_to);

CREATE INDEX IF NOT EXISTS idx_finding_assignments_user_tenant
  ON finding_assignments (assigned_to, tenant_id);

CREATE INDEX IF NOT EXISTS idx_finding_comments_assignment
  ON finding_comments (finding_assignment_id);

CREATE INDEX IF NOT EXISTS idx_finding_comments_finding
  ON finding_comments (finding_id);

-- Note: idx_findings_segment on findings(segment_id) already exists (migration 00005)

-- =============================================================================
-- Section 7: Realtime — enable for live status updates (Story 5.2c)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'finding_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE finding_assignments;
  END IF;
END $$;

-- =============================================================================
-- Section 8: TD-DB-006 fix — orphan migration constraint
-- The orphan Drizzle migration 0014_typical_gauntlet.sql declared this constraint
-- but was never registered in _journal.json / never applied to DB.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_scores_file_tenant'
  ) THEN
    ALTER TABLE scores ADD CONSTRAINT uq_scores_file_tenant UNIQUE(file_id, tenant_id);
  END IF;
END $$;

COMMIT;
