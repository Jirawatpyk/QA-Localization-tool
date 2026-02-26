# Tenant Isolation Patterns — Detailed Notes

## getCurrentUser() — The Tenant ID Source of Truth

- File: `src/lib/auth/getCurrentUser.ts`
- Uses `supabase.auth.getClaims()` — fast local JWT validation (~1ms, no network call)
- Extracts `tenant_id` from JWT claims injected by `custom_access_token_hook`
- Rejects if `tenantId === 'none'` or `role === 'none'` (replica lag guard)
- Wrapped in React `cache()` for request-level deduplication
- NEVER accept tenantId from request parameters — always use this function

## requireRole() — Write-path RBAC (M3 Pattern)

- File: `src/lib/auth/requireRole.ts`
- For reads: trusts JWT claims (fast)
- For writes: queries `user_roles` with `AND(userId, tenantId)` — prevents stale JWT attacks
- Always returns `currentUser` with verified `tenantId`

## withTenant() Helper

- File: `src/db/helpers/withTenant.ts`
- Simple wrapper: `eq(tenantIdColumn, tenantId)`
- MUST be used on every query per project convention
- Inconsistency: some Story 1.7 actions use raw `eq()` instead — flag as MEDIUM

## JOIN Isolation Rules

- For INNER JOIN: if child table's FK chain guarantees same tenant, a single `files.tenantId` filter suffices
- However, convention requires explicit `tenantId` filter on ALL joined tables
- Example gap: `getDashboardData` JOINs `projects` without `projects.tenantId` filter
- Best practice (from glossary actions): filter tenant on every table in JOIN

## Realtime Subscription Pattern

- Supabase Realtime channel filter only accepts ONE `filter` string
- Current pattern: `filter: 'user_id=eq.${userId}'`
- Gap: no tenant_id filter in Realtime subscription
- Defense: RLS must be the backstop — verify RLS policy exists on `notifications`
- Improvement: use compound filter `filter: 'user_id=eq.${userId}&tenant_id=eq.${tenantId}'`
  (Supabase supports AND in filter strings with `&`)

## setupNewUser Bootstrap Context

- Cannot use withTenant() because tenantId doesn't exist yet during first-time setup
- Uses Drizzle (DATABASE_URL direct) which bypasses RLS — documented intentionally
- Queries `userRoles` by `userId` alone — acceptable in bootstrap context
- After tenant is created, all subsequent operations must use tenantId

## users Table UPDATE Pattern

- `users.id` = Supabase Auth UID (UUID v4, globally unique across all tenants)
- UPDATE by `users.id` alone cannot touch another tenant's user row (no UUID collision possible)
- Still violates `withTenant()` convention — flag as MEDIUM for consistency

## Story 2.10 — Parity Verification Test Files (Integration Tests)

**Audit date:** 2026-02-26
**Result:** 0 Critical / 0 High / 0 Medium / 1 Low — SECURE

### Key Architecture Fact

`processFile()` in `ruleEngine.ts` is a pure in-memory function. It has no DB imports and
no Supabase calls. The `tenantId`/`projectId`/`fileId` on SegmentRecord are carried as metadata
for findings output but NEVER trigger a DB query in this path. Tenant isolation concerns in
integration tests are therefore limited to: (a) no hardcoded production tenant IDs, and
(b) no state bleed between test runs via shared mutable globals.

### Files Audited — All PASS

- `src/__tests__/integration/golden-corpus-parity.test.ts` — tenantId/projectId/fileId via
  faker.string.uuid() per beforeAll; per-file fileId refreshed each loop iteration.
- `src/__tests__/integration/clean-corpus-baseline.test.ts` — same pattern; fresh UUIDs per
  beforeAll; per-file fileId.
- `src/__tests__/integration/tier2-multilang-parity.test.ts` — shared tenantId/projectId across
  8 language dirs (intentional: same simulated project); per-file fileId.
- `src/features/pipeline/engine/__tests__/ruleEngine.perf.test.ts` — delegates to
  buildPerfSegments(); no DB access.
- `src/test/factories.ts` buildPerfSegments() — hardcoded deterministic UUIDs (intentional for
  reproducibility). LOW finding: strings are not valid UUID v4 format (wrong hex segment length).
  No security risk — zero DB path. Risk: Zod uuid() validation would reject these if ever applied.

### Low Finding — buildPerfSegments() Hardcoded IDs

```ts
// CURRENT (invalid UUID format — prefix causes wrong hex segment lengths)
const fileId = 'perf-test-file-00000000-0000-4000-8000-000000000001'
const tenantId = 'perf-test-tenant-0000000-0000-4000-8000-000000000003'

// RECOMMENDED (valid UUID v4 format, still deterministic)
const fileId = '00000000-0000-4000-8000-000000000001'
const tenantId = '00000000-0000-4000-8000-000000000003'
```

Segment IDs at line 500 (`perf-seg-${padded}-0000-4000-8000-000000000000`) also have
the same format issue — they are not valid UUID v4.

### Integration Test Isolation Pattern (no DB)

For pure in-memory engine tests:

1. Use faker.string.uuid() for tenantId/projectId — never hardcode production-like values.
2. Generate a fresh fileId per file in the loop (not shared across files).
3. Mock writeAuditLog + glossaryCache — prevents accidental DB writes.
4. processFile() has no DB — tenant fields on SegmentRecord are payload metadata only.
