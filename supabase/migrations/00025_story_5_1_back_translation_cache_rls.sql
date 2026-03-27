-- Story 5.1: back_translation_cache RLS policies
-- Fix: Drizzle migration 0015 used wrong current_setting() pattern.
-- Replace with standard auth.jwt() pattern + add missing DELETE policy.

ALTER TABLE back_translation_cache ENABLE ROW LEVEL SECURITY;

-- Drop incorrect policies from Drizzle migration
DROP POLICY IF EXISTS "bt_cache_tenant_select" ON back_translation_cache;
DROP POLICY IF EXISTS "bt_cache_tenant_insert" ON back_translation_cache;
DROP POLICY IF EXISTS "bt_cache_tenant_update" ON back_translation_cache;

-- Correct policies using auth.jwt() pattern
CREATE POLICY "Tenant isolation: SELECT" ON back_translation_cache
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON back_translation_cache
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON back_translation_cache
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON back_translation_cache
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- Allow service_role to DELETE expired entries (TTL cron cleanup via Inngest)
CREATE POLICY "service_role: cleanup expired" ON back_translation_cache
  FOR DELETE TO service_role
  USING (true);
