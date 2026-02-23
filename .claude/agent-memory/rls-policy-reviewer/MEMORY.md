# RLS Policy Reviewer — Agent Memory

## JWT Claim Path (CRITICAL)

- All policies use top-level JWT claim: `((SELECT auth.jwt()) ->> 'tenant_id')::uuid`
- NOT `app_metadata` — the `custom_access_token_hook` injects `tenant_id` at root JWT level
- Subquery wrapper `(SELECT auth.jwt())` is intentional — per-query caching (94-99% faster)
- Source: `supabase/migrations/00001_rls_policies.sql` + `00003_custom_access_token_hook.sql`

## RLS Migration Files

- Main RLS policies: `supabase/migrations/00001_rls_policies.sql` (all tenant-scoped tables)
- Upload batches RLS: `supabase/migrations/00011_upload_batches_rls.sql`
- Severity configs fix: `supabase/migrations/00008_fix_severity_configs_rls.sql`
- Story 2.2 columns (no new RLS needed): `supabase/migrations/00013_story_2_2_segments_columns.sql`

## Tables — RLS Status

All tenant-scoped tables have RLS enabled via `00001_rls_policies.sql`.
CRUD coverage: SELECT/INSERT/UPDATE/DELETE policies on all main tables.

### Intentionally Global Tables (no tenant_id, read-only by authenticated)

- `taxonomy_definitions` — shared reference data, only service_role can write
- `severity_configs` (partially global) — SELECT open to all authenticated, writes tenant-scoped or NULL

### Special RLS Pattern: glossary_terms

- No direct `tenant_id` column — uses EXISTS subquery via parent `glossaries` table
- Pattern: `EXISTS (SELECT 1 FROM glossaries WHERE glossaries.id = glossary_terms.glossary_id AND glossaries.tenant_id = ...)`

## Policy Naming Convention

- Standard: `"Tenant isolation: SELECT"`, `"Tenant isolation: INSERT"`, etc.
- Exceptions: `"Read: all authenticated"`, `"Write: tenant-scoped"` (severity_configs)

## Key Principle: Adding Columns Does NOT Require New RLS Policies

- RLS operates at row level — existing policies automatically cover all columns in the row
- When Story 2.2 added 4 columns to `segments`, NO policy changes were needed
- Only need new RLS if: new TABLE added, or table previously had no RLS

## tenant_id Schema Pattern

- Always `uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' })`
- NOT NULL constraint at DB level prevents NULL bypass even if policy has a bug

## Drizzle Schema Files

- One file per table in `src/db/schema/`
- camelCase in TS (tenantId) maps to snake_case in DB (tenant_id)

## Links to Detail Files

- See `patterns.md` for architecture patterns (general project)
