-- Fix: severity_configs INSERT/UPDATE policies allow any authenticated user
-- to write global rows (tenant_id IS NULL). Global configs should only be
-- writable by service_role (seeded via migrations), not authenticated users.

DROP POLICY IF EXISTS "Write: tenant-scoped" ON severity_configs;
DROP POLICY IF EXISTS "Update: tenant-scoped" ON severity_configs;

-- INSERT: tenant-scoped only (no NULL tenant writes)
CREATE POLICY "Write: tenant-scoped" ON severity_configs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- UPDATE: tenant-scoped only (no NULL tenant writes)
CREATE POLICY "Update: tenant-scoped" ON severity_configs
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

-- DELETE: tenant-scoped only
CREATE POLICY "Delete: tenant-scoped" ON severity_configs
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);
