---
title: 'Branded TenantId Type for Compile-time Tenant Isolation'
type: 'refactor'
created: '2026-03-26'
status: 'in-progress'
baseline_commit: 'a4da3e9'
context: ['_bmad-output/planning-artifacts/research/technical-compile-time-tenant-isolation-research-2026-03-26.md']
---

# Branded TenantId Type for Compile-time Tenant Isolation

<frozen-after-approval>

## Intent

**Problem:** `withTenant()` accepts `string` — any string passes type check, including wrong IDs or empty strings. No compile-time enforcement prevents passing a projectId where tenantId is expected.

**Approach:** Create branded `TenantId` type that can only be produced through validated paths (requireRole, getCurrentUser, Zod transform). Update `withTenant()` to require `TenantId` parameter. All 67+ Server Actions inherit the brand automatically via `requireRole()` return type.

## Boundaries & Constraints

**Always:** Backward compatible — no runtime behavior change. Only type-level enforcement.

**Ask First:** N/A

**Never:** Change query logic. Add runtime validation beyond what exists. Touch RLS or migrations.

</frozen-after-approval>

## Code Map

- `src/types/tenant.ts` -- NEW: TenantId branded type + helpers
- `src/db/helpers/withTenant.ts` -- Change parameter type to TenantId
- `src/lib/auth/getCurrentUser.ts` -- Change CurrentUser.tenantId to TenantId
- `src/lib/auth/requireRole.ts` -- Change RequireRoleResult.tenantId to TenantId
- `src/types/pipeline.ts` -- Add .transform() to Zod schemas
- `src/test/factories.ts` -- Add asTenantId() helper, update factory functions

## Tasks & Acceptance

**Execution:**
- [ ] `src/types/tenant.ts` -- CREATE branded TenantId type + validateTenantId + asTenantId helpers
- [ ] `src/db/helpers/withTenant.ts` -- CHANGE tenantId param from string to TenantId
- [ ] `src/lib/auth/getCurrentUser.ts` -- CHANGE CurrentUser.tenantId type to TenantId
- [ ] `src/lib/auth/requireRole.ts` -- CHANGE RequireRoleResult.tenantId type to TenantId
- [ ] `src/types/pipeline.ts` -- ADD .transform(validateTenantId) to Zod schemas
- [ ] `src/test/factories.ts` -- ADD asTenantId helper, update tenantId generation
- [ ] Fix all resulting TS errors across codebase

**Acceptance Criteria:**
- Given withTenant(col, "raw-string"), when tsc runs, then compile error (string not assignable to TenantId)
- Given requireRole() return, when destructuring tenantId, then type is TenantId (no cast needed)
- Given Inngest event parsed by Zod, when accessing tenantId, then type is TenantId
- Given npm run type-check, when all changes applied, then zero TS errors
- Given npm run test:unit, when all tests pass, then zero regressions

## Verification

**Commands:**
- `npm run type-check` -- expected: no errors
- `npm run lint` -- expected: no new errors
- `npm run test:unit` -- expected: all pass
