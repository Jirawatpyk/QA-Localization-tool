# Deferred Work — Auth & Multi-tenancy Adversarial Review

**Source:** Adversarial Review (2026-03-26)
**Deferred by:** Quick Dev New workflow — split decision

## Deferred Goals

### ~~Goal D — Inngest Event tenantId Validation (Finding #5)~~ ✅ DONE (2026-03-26)
- Added Zod `.uuid()` validation on tenantId in processBatch, processFile, batchComplete
- NonRetriableError thrown on invalid tenantId

### ~~Goal H — Rate Limiting & Compensation (Findings #11, #13)~~ ✅ DONE (2026-03-26)
- #11: Swapped IP priority: x-real-ip first (Vercel-set, not spoofable), x-forwarded-for fallback
- #13: Added retry (max 2) + error logging for orphaned auth user compensation

### Goal F — Tenant Resource Limits (Finding #9)
- Add per-tenant user quota (e.g., max users per plan tier)
- New feature, requires schema + enforcement logic

### ~~Goal A Full — Architectural Tenant Isolation (Findings #1, #6)~~ ✅ DONE (2026-03-26)
- #1: ✅ DONE — Branded `TenantId` type enforces compile-time safety on `withTenant()` (commit `473f50e`, 69 files)
- #6: ✅ DONE — Denormalized tenant_id into glossaryTerms table + RLS + withTenant on all 15 query sites

### Goal C Remaining — Account Lockout (Finding #12)
- Per-account lockout after N failed login attempts (distributed IP protection)
- Requires Supabase Auth hook or custom middleware

### Goal A#3 — setupNewUser Rate Limit (Finding #3)
- Add rate limiting specific to setupNewUser server action
- Prevent tenant spam from leaked session cookies

## Deferred from Code Review (Step 4)

### ~~Idle Timeout UX Improvements (Review F4+F5)~~ ✅ DONE (2026-03-26)
- Added `visibilitychange` listener to pause/resume timer when tab hidden/visible
- Added warning toast at T-5 minutes before session expiry
- 5 tests covering: no-timeout, warning-at-25min, timeout-at-30min, activity-reset, background-tab-pause

## Deferred from: code review of story-5.3 (2026-03-30)

- ~~**F9:** Perf benchmark thresholds relaxed 7.5-50x from production targets (TD-TEST-011 tracked).~~ ✅ DONE — CI-only stricter thresholds via `process.env.CI` (render 5s, nav 500ms, action 5s, bulk 10s)
- **F10:** Keyboard `bindingsRegistry` module-level singleton doesn't reset on HMR — pre-existing architecture, not 5.3 regression. Consider React context or Zustand migration.
- ~~**F11:** `confirmNativeReview` notification self-notify guard.~~ ✅ DONE — `if (assignedBy !== userId)` guard on both confirm + override actions
- ~~**F12:** E2E `TA-01e` `waitForTimeout(2000)` flaky timing.~~ ✅ DONE — replaced with deterministic toast visibility wait

## Deferred from: code review of TD-A11Y-001 fix (2026-03-30)

- ~~**Cache error classification:**~~ ✅ DONE — `isFkViolation()` helper classifies PG error code `23503`. FK violations log warn + continue. Systemic errors (DB down, schema) re-throw to propagate.
- ~~**TA-14 perf threshold 60s:**~~ ✅ DONE — CI-only thresholds added (render 5s, nav 500ms, action 5s, bulk 10s). Dev mode keeps relaxed thresholds.

## ~~Deferred from: code review of story-6.1 (2026-03-31)~~ ✅ ALL FIXED (2026-04-01)

- ~~**FindingCommentThread mountedRef race:**~~ ✅ DONE — replaced mountedRef with per-effect `let cancelled` pattern
- ~~**FlagForNativeDialog mountedRef race:**~~ ✅ DONE — same per-effect cancelled pattern
- ~~**ReviewPageClient.onOverride no activeFinding guard:**~~ ✅ DONE — added `if (!activeFindingState) return` guard
- ~~**ReviewPageClient pattern detection toast duration:Infinity:**~~ ✅ DONE — capture toastId, dismiss on effect cleanup
- ~~**ReviewPageClient.executeNativeOverride undo action hardcoded 'reject':**~~ ✅ DONE — dynamic action based on newStatus
- ~~**ReviewPageClient.handleDeleteFinding snapshot race:**~~ ✅ DONE — capture snapshot BEFORE server call
- ~~**FileHistoryTable filter/pagination ARIA gaps:**~~ ✅ DONE — added aria-pressed + aria-current
- ~~**Notification fileName not sanitized:**~~ ✅ DONE — truncate to 80 chars in assignFile

## Deferred from: code review of story-6.2a (2026-04-01)

- **native_comment_added has no lookup mechanism:** returns null for navigation when projectId/fileId missing from metadata — spec defers to future story for assignmentId→projectId/fileId lookup
- **New notification types metadata shape TBD:** `analysis_complete`, `glossary_updated`, `auto_pass_triggered` declared but INSERT code not wired — deferred to Story 6-2b
