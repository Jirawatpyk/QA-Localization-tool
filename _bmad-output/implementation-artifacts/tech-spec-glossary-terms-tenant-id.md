---
title: 'glossaryTerms tenant_id Denormalization'
type: 'refactor'
created: '2026-03-26'
status: 'done'
baseline_commit: '473f50e'
context: ['_bmad-output/planning-artifacts/research/technical-compile-time-tenant-isolation-research-2026-03-26.md']
---

# glossaryTerms tenant_id Denormalization

<frozen-after-approval>

## Intent

**Problem:** glossaryTerms table has no tenant_id column — isolation depends on FK subquery through parent glossaries table. If glossary reassigned or bug nullifies glossaries.tenant_id, all terms escape tenant isolation.

**Approach:** Add tenant_id column to glossaryTerms, backfill from parent glossary, add direct RLS policy, update queries to use withTenant() on glossaryTerms directly.

## Boundaries & Constraints

**Always:** Backfill in transaction. Add NOT NULL after backfill. Keep FK to glossaries (data integrity).

**Ask First:** N/A

**Never:** Remove existing glossaries.tenant_id FK join — keep as defense-in-depth where already present.

</frozen-after-approval>

## Code Map

- `supabase/migrations/00024_glossary_terms_tenant_id.sql` -- NEW migration
- `src/db/schema/glossaryTerms.ts` -- Add tenantId column
- `src/db/schema/relations.ts` -- Update relations if needed
- 10 query files -- Add withTenant(glossaryTerms.tenantId, tenantId)

## Tasks & Acceptance

**Execution:**
- [ ] Migration: add column + backfill + NOT NULL + RLS + index
- [ ] Schema: add tenantId to glossaryTerms Drizzle schema
- [ ] Queries: add withTenant on glossaryTerms across all 10 query files
- [ ] Tests: verify type-check + existing tests pass

**Acceptance Criteria:**
- Given glossaryTerms table, when inspecting schema, then tenant_id UUID NOT NULL column exists with FK to tenants
- Given RLS policy on glossaryTerms, when authenticated user queries, then only own tenant's terms returned
- Given all glossary queries, when inspecting code, then withTenant(glossaryTerms.tenantId) is present

## Verification

**Commands:**
- `npm run type-check` -- expected: no errors
- `npm run test:unit` -- expected: all pass
- `npx supabase migration up --local` -- expected: migration applies
