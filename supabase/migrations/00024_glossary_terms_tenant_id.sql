-- Story C: Denormalize tenant_id into glossary_terms for independent tenant isolation
-- Previously: isolation via EXISTS subquery through parent glossaries.tenant_id
-- Now: direct tenant_id column + RLS matching standard pattern

-- Step 1: Add nullable column first (backfill before NOT NULL)
ALTER TABLE glossary_terms ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT;

-- Step 2: Backfill from parent glossary
UPDATE glossary_terms
SET tenant_id = g.tenant_id
FROM glossaries g
WHERE glossary_terms.glossary_id = g.id
  AND glossary_terms.tenant_id IS NULL;

-- Step 3: Set NOT NULL after backfill
ALTER TABLE glossary_terms ALTER COLUMN tenant_id SET NOT NULL;

-- Step 4: Performance index
CREATE INDEX IF NOT EXISTS idx_glossary_terms_tenant ON glossary_terms(tenant_id);

-- Step 5: Drop old FK subquery RLS policies
DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON glossary_terms;
DROP POLICY IF EXISTS "Tenant isolation: INSERT" ON glossary_terms;
DROP POLICY IF EXISTS "Tenant isolation: UPDATE" ON glossary_terms;
DROP POLICY IF EXISTS "Tenant isolation: DELETE" ON glossary_terms;

-- Step 6: Create new direct-column RLS policies (standard pattern from 00001_rls_policies.sql)
CREATE POLICY "Tenant isolation: SELECT" ON glossary_terms
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: INSERT" ON glossary_terms
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: UPDATE" ON glossary_terms
  FOR UPDATE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);

CREATE POLICY "Tenant isolation: DELETE" ON glossary_terms
  FOR DELETE TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);
