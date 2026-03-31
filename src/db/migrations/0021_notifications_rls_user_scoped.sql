-- Guardrail #89: User-scoped SELECT on notifications
-- Replace existing tenant-only SELECT with user-scoped policy
-- Users can only see their own notifications within their tenant
-- Supabase Realtime respects RLS, so this also secures the Realtime channel

-- Drop existing tenant-only policies (from supabase/migrations/00001_rls_policies.sql)
DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON notifications;
DROP POLICY IF EXISTS "Tenant isolation: INSERT" ON notifications;
DROP POLICY IF EXISTS "Tenant isolation: UPDATE" ON notifications;

-- User-scoped SELECT: user sees only own notifications
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT TO authenticated
  USING (
    user_id = ((SELECT auth.jwt()) ->> 'sub')::uuid
    AND tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
  );

-- User-scoped UPDATE: user can mark own notifications as read / archive
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE TO authenticated
  USING (
    user_id = ((SELECT auth.jwt()) ->> 'sub')::uuid
    AND tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    user_id = ((SELECT auth.jwt()) ->> 'sub')::uuid
    AND tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
  );

-- INSERT is server-side only (service_role), no INSERT policy for authenticated users

-- Partial indexes for query performance (Guardrail #87)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_archive
  ON notifications (created_at)
  WHERE archived_at IS NULL;
