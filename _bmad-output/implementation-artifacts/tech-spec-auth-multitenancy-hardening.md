---
title: 'Auth & Multi-tenancy Security Hardening — Quick Fixes'
type: 'bugfix'
created: '2026-03-26'
status: 'done'
baseline_commit: 'a712b4ba6f98785a856d9277bfac3e01b11aad79'
context: ['CLAUDE.md (guardrails #1-4, #41)', '_bmad-output/planning-artifacts/architecture/index.md']
---

# Auth & Multi-tenancy Security Hardening — Quick Fixes

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Adversarial review found 5 concrete security gaps: RLS policies using inconsistent JWT extraction (2 tables), LEFT JOIN bypassing `withTenant()` helper, JWT hook unsafe on multi-row edge case, Realtime subscription missing tenant filter, idle timeout too long (8h), and callback open redirect guard incomplete.

**Approach:** Fix each gap with minimal, targeted changes — new migration for RLS consistency, code-level fixes for withTenant/Realtime/timeout, SQL hook hardening, and stricter redirect validation.

## Boundaries & Constraints

**Always:** Use `withTenant()` helper for all tenant filtering. New migration must be additive (DROP POLICY + CREATE POLICY). Follow existing RLS pattern from `00001_rls_policies.sql`. Keep idle timeout configurable as a constant.

**Ask First:** If JWT hook change requires Supabase project restart or auth service restart.

**Never:** Modify existing migration files in place. Change RLS on tables not in scope. Add new dependencies. Touch setupNewUser flow.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| RLS: tenant A queries parity_reports | JWT has tenant_id=A | Returns only tenant A rows | N/A |
| JWT hook: user has 0 roles | No row in user_roles | role="none", tenant_id="none" | N/A |
| JWT hook: user has 2 roles (constraint dropped) | 2 rows in user_roles | Pick lowest privilege role (native_reviewer) | Log warning |
| Realtime: role update for user in tenant A | Subscription filter includes tenant_id | Only receives events for own tenant | N/A |
| Idle: no activity for 30 min | Timer expires | Sign out + redirect /login?reason=session_expired | N/A |
| Callback: next=///evil.com | Triple-slash path | Fallback to /dashboard | N/A |
| Callback: next=/dashboard | Valid path | Redirect to /dashboard | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/00015_story_2_7_schema.sql` -- RLS policies with old JWT pattern (read-only reference)
- `supabase/migrations/00018_fix_rls_jwt_pattern.sql` -- NEW: migration to fix RLS policies
- `supabase/migrations/00019_harden_jwt_hook.sql` -- NEW: migration to harden access token hook
- `src/app/(app)/projects/page.tsx` -- LEFT JOIN missing withTenant helper
- `src/features/admin/hooks/useRoleSync.ts` -- Realtime subscription missing tenant_id filter
- `src/features/admin/hooks/useIdleTimeout.ts` -- 8h idle timeout constant
- `src/app/(auth)/callback/route.ts` -- Open redirect validation

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/00018_fix_rls_jwt_pattern.sql` -- CREATE new migration: DROP+CREATE 4 RLS policies on parity_reports & missing_check_reports using `(SELECT auth.jwt())` pattern
- [ ] `supabase/migrations/00019_harden_jwt_hook.sql` -- CREATE new migration: replace `custom_access_token_hook` with multi-row safe version (ORDER BY role priority ASC, pick lowest privilege)
- [ ] `src/app/(app)/projects/page.tsx:38-41` -- REPLACE `eq(files.tenantId, currentUser.tenantId)` with `withTenant(files.tenantId, currentUser.tenantId)` in LEFT JOIN
- [ ] `src/features/admin/hooks/useRoleSync.ts:33` -- ADD `tenant_id` to Realtime subscription filter alongside user_id
- [ ] `src/features/admin/hooks/useIdleTimeout.ts:9` -- CHANGE idle timeout from 8h to 30min (1800000ms)
- [ ] `src/app/(auth)/callback/route.ts:11` -- HARDEN redirect validation: reject paths with backslash, triple+ slashes, or non-path characters

**Acceptance Criteria:**
- Given parity_reports/missing_check_reports RLS policies, when inspecting migration SQL, then all use `(SELECT auth.jwt())` pattern matching 00001_rls_policies.sql
- Given a user with hypothetical duplicate user_roles rows, when JWT hook fires, then the lowest-privilege role is selected
- Given projects page query, when LEFT JOIN executes, then `withTenant()` is used for tenant filtering (not raw eq)
- Given useRoleSync hook, when subscribing to Realtime, then filter includes both user_id AND tenant_id
- Given 30 minutes of inactivity, when timeout fires, then user is signed out
- Given callback with malicious `next` param (///evil.com, /\evil.com, /%0d%0aevil), when processing redirect, then falls back to /dashboard

## Verification

**Commands:**
- `npm run type-check` -- expected: no TypeScript errors
- `npm run lint` -- expected: no lint errors
- `npm run test:unit` -- expected: all tests pass
- `npx supabase db reset` -- expected: migrations apply without errors (if local Supabase running)
