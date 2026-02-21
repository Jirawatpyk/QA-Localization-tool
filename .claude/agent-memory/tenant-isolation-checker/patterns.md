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
