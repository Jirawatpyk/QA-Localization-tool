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

## Story 3.1 — AI Cost Control, Throttling, Model Pinning (2026-02-27)

**Audit date:** 2026-02-27
**Result:** 0 Critical / 0 High / 0 Medium / 0 Low — SECURE (full pass, all 10 files)

### New Table Confirmed Tenant-Scoped

- `ai_usage_logs` — `tenantId uuid notNull FK(tenants)` confirmed in schema. SELECT queries
  use `withTenant(aiUsageLogs.tenantId, tenantId)`. INSERT sets `tenantId: record.tenantId`
  in values object. Correct pattern throughout.

### New `projects` Columns Audited

- `aiBudgetMonthlyUsd` (nullable numeric) — NULL = unlimited budget
- `budgetAlertThresholdPct` (integer notNull default 80)
- `l2PinnedModel` / `l3PinnedModel` (nullable varchar) — NULL = system default

All SELECT/UPDATE queries on `projects` that touch these columns include `withTenant()`.

### Key Patterns Confirmed

**`checkProjectBudget(projectId, tenantId)`** — `tenantId` is a typed required parameter, always
sourced from the authenticated session in calling Server Actions. The function is `server-only`.
The two-query pattern (projects SELECT → aiUsageLogs SUM SELECT) applies `withTenant()` to both.

**`logAIUsage(record)`** — INSERT-only. Sets `tenantId: record.tenantId` in values. Non-fatal
DB failure pattern (catch + log). No WHERE clause needed on INSERT.

**`getModelForLayerWithFallback(layer, projectId, tenantId)`** — projects SELECT includes
`withTenant()`. NOTE: `runL2ForFile.ts` and `runL3ForFile.ts` currently call `getModelForLayer`
(static fallback) from `@/lib/ai/client`, NOT `getModelForLayerWithFallback`. This means
per-project model pinning is NOT yet applied at runtime. This is a feature gap, not a security
gap — the static default is safe.

**AI finding segment ID validation** — `runL2ForFile.ts` and `runL3ForFile.ts` both validate
AI-returned segmentIds against the `segmentIdSet` built from the tenant-scoped DB query before
inserting any finding. This prevents hallucinated cross-file or cross-tenant segment IDs from
being stored.

**AVAILABLE_MODELS allowlist in `updateModelPinning.action.ts`** — prevents arbitrary model
ID injection into the `projects.l2PinnedModel` / `projects.l3PinnedModel` DB columns.
Always validate model strings against this set before any DB write.

**`checkTenantBudget()` stub** — makes zero DB calls; always returns `hasQuota: true`.
Not a security concern. Legacy compat stub; callers should migrate to `checkProjectBudget()`.

### Files Audited

- `getFilesWordCount.action.ts` — segments SELECT: `withTenant()` + `inArray(fileIds)`. PASS.
- `getProjectAiBudget.action.ts` — projects SELECT: `withTenant()`. aiUsageLogs SELECT: `withTenant()`. PASS.
- `updateBudgetAlertThreshold.action.ts` — projects UPDATE: `withTenant()`. `.returning()` + `!updated` check. Audit log. PASS.
- `updateModelPinning.action.ts` — allowlist guard + projects UPDATE: `withTenant()`. `.returning()` + `!updated`. Audit log. PASS.
- `src/lib/ai/budget.ts` — checkProjectBudget: both queries use `withTenant()`. checkTenantBudget: zero DB. PASS.
- `src/lib/ai/costs.ts` — INSERT only; `tenantId` set in values. Non-fatal error handling. PASS.
- `src/lib/ai/providers.ts` — getModelForLayerWithFallback: projects SELECT uses `withTenant()`. PASS.
- `runL2ForFile.ts` — CAS UPDATE, segments SELECT, findings SELECT, findings DELETE (in tx), findings INSERT (values), file UPDATE, rollback UPDATE: all use `withTenant()` or explicit tenantId. PASS.
- `runL3ForFile.ts` — same 12-step pattern as runL2; all 7 DB ops confirmed. PASS.
- `startProcessing.action.ts` — files SELECT: 3-way filter (`withTenant` + projectId + inArray). projects UPDATE: `withTenant()`. tenantId injected into Inngest payload. PASS.
