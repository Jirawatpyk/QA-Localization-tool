---
title: 'Rate Limit IP Hardening + createUser Compensation Retry'
type: 'bugfix'
created: '2026-03-26'
status: 'done'
baseline_commit: '36ea6ab'
context: ['CLAUDE.md (guardrail #13)']
---

# Rate Limit IP Hardening + createUser Compensation Retry

<frozen-after-approval>

## Intent

**Problem:** Two security gaps from adversarial review: (1) proxy rate limiting uses `x-forwarded-for` as primary IP source which is spoofable — should prefer `x-real-ip` set by Vercel/trusted proxy, (2) createUser compensation (delete orphaned auth user) has no retry and swallows errors — if compensation fails, orphaned user remains in Supabase Auth.

**Approach:** Swap IP header priority in proxy.ts to prefer `x-real-ip`. Add try-catch with retry (max 2 attempts) around compensation deleteUser call in createUser action, with logging on failure.

## Boundaries & Constraints

**Always:** Keep fail-open/fail-closed behavior unchanged. Log compensation failures.

**Ask First:** N/A

**Never:** Change rate limit config/thresholds. Add new dependencies. Change createUser happy path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vercel deployment | x-real-ip set by CDN | Uses x-real-ip for rate limiting | N/A |
| Non-Vercel / local | No x-real-ip, has x-forwarded-for | Falls back to x-forwarded-for | N/A |
| No IP headers | Neither header present | Falls back to 127.0.0.1 | N/A |
| Compensation success | DB fails, deleteUser succeeds | Orphan cleaned up | N/A |
| Compensation fail once | DB fails, deleteUser fails then succeeds | Retry succeeds, orphan cleaned | Log warning |
| Compensation fail twice | DB fails, deleteUser fails 2x | Return error, log orphan user ID | Log error with userId |

</frozen-after-approval>

## Code Map

- `src/proxy.ts:42-43` -- IP extraction for rate limiting
- `src/features/admin/actions/createUser.action.ts:79-82` -- compensation without retry

## Tasks & Acceptance

**Execution:**
- [ ] `src/proxy.ts:42-43` -- SWAP IP header priority: x-real-ip first, x-forwarded-for fallback
- [ ] `src/features/admin/actions/createUser.action.ts:79-82` -- ADD retry (max 2) + error logging for compensation deleteUser
- [ ] Update tests if existing

**Acceptance Criteria:**
- Given Vercel deployment with x-real-ip header, when rate limit checks IP, then x-real-ip value is used
- Given compensation failure on first attempt, when retry fires, then second attempt succeeds and orphan is cleaned
- Given compensation failure on both attempts, when retry exhausted, then error is logged with orphaned userId for manual cleanup

## Verification

**Commands:**
- `npm run type-check` -- expected: no errors
- `npm run lint` -- expected: no new errors
- `npx vitest run src/features/admin/actions/createUser.action.test.ts` -- expected: pass
