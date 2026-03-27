-- Fix: back_translation_cache RLS policies from migration 0015 used wrong
-- current_setting() pattern. Replace with auth.jwt() + add missing DELETE policy.

-- Drop old (wrong) policies from migration 0015
DROP POLICY IF EXISTS "bt_cache_tenant_select" ON "back_translation_cache";
DROP POLICY IF EXISTS "bt_cache_tenant_insert" ON "back_translation_cache";
DROP POLICY IF EXISTS "bt_cache_tenant_update" ON "back_translation_cache";
-- Drop correct policies if already applied by Supabase migration 00025 (idempotent)
DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON "back_translation_cache";
DROP POLICY IF EXISTS "Tenant isolation: INSERT" ON "back_translation_cache";
DROP POLICY IF EXISTS "Tenant isolation: UPDATE" ON "back_translation_cache";
DROP POLICY IF EXISTS "Tenant isolation: DELETE" ON "back_translation_cache";
DROP POLICY IF EXISTS "service_role: cleanup expired" ON "back_translation_cache";

CREATE POLICY "Tenant isolation: SELECT" ON "back_translation_cache"
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON "back_translation_cache"
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON "back_translation_cache"
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON "back_translation_cache"
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "service_role: cleanup expired" ON "back_translation_cache"
  FOR DELETE TO service_role
  USING (true);
