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

- ~~**native_comment_added has no lookup mechanism:**~~ ✅ DONE (Story 6.2b) — metadata now includes projectId + fileId from findingAssignments SELECT
- ~~**New notification types metadata shape TBD:**~~ ✅ DONE (Story 6.2b) — all 3 types wired with INSERT calls + metadata contracts

## ~~Deferred from: code review of story-6.2b (2026-04-02)~~ ✅ ALL FIXED (2026-04-02)

- ~~**D1: `addFindingComment` admin commenter notifies only 1 of 2 other parties**~~ ✅ DONE — Set-based recipient collection: notifies all parties (assignedTo + assignedBy) except the commenter. Handles admin as 3rd actor correctly.
- ~~**D2: `revalidateTag(\`glossary-null\`)` when `glossary.projectId` is null**~~ ✅ DONE — Added `if (projectId)` guard in createTerm, updateTerm, deleteTerm before calling revalidateTag.

## Deferred from: UI tour bugfix review (2026-04-03)

- ~~**FileHistoryTable: link shown for unprocessed files**~~ ✅ DONE — Gate link on `L1_COMPLETED_STATUSES` (l1_completed, l2_processing, l2_completed, l3_processing, l3_completed, ai_partial). Files in uploaded/parsing/parsed/l1_processing/failed status render as plain text instead of link.

## ~~Deferred from: code review of s-fix-1 (2026-04-03)~~ ✅ ALL FIXED (2026-04-03)

- ~~**W1: Error boundary UI duplicated 4 times (DRY)**~~ ✅ DONE — Extracted `ErrorPageContent` shared component, refactored all 4 error/not-found pages
- ~~**W2: Batch page missing `connection()` call**~~ ✅ DONE — Added `await connection()` for consistency
- ~~**W3: Error codes use inline strings codebase-wide**~~ ✅ DONE — Created `ActionErrorCode` union type at `@/types/actionErrorCode.ts`, updated `ActionResult`
- ~~**W4: `support@example.com` placeholder**~~ ✅ DONE — Centralized to `SUPPORT_EMAIL` constant in `@/lib/constants.ts`
- ~~**W5: No `error.tsx` at review/batch route level**~~ ✅ DONE — Created `review/[fileId]/error.tsx` + `batches/[batchId]/error.tsx`

## ~~Deferred from: code review of s-fix-2 (2026-04-03)~~ ✅ ALL FIXED (2026-04-03)

- ~~**D1: DragOverlay tooltip with tabIndex=0 during keyboard drag**~~ ✅ DONE — `tabIndex={readOnly ? -1 : 0}` removes focusability from DragOverlay clone
- ~~**D2: Unsaved draft lost when switching Edit to another row**~~ ✅ DONE — `startEdit()` detects dirty draft and shows toast.info before switching

## Deferred from: code review of s-fix-3 (2026-04-04)

- ~~**D1: Notification Bell fallback button missing disabled state**~~ ✅ DONE — Applied same `opacity-50 cursor-not-allowed disabled` pattern as User menu fallback

## Deferred from: code review of s-fix-4 (2026-04-04)

- ~~**D1: `max-w-[1400px]` in app layout constrains review page at wide viewports**~~ ✅ DONE — Added `has-[[data-review-layout]]:max-w-none` on wrapper + `data-review-layout` attribute on review layout
- ~~**D2: `DetailPanel` component + `ui.store` dead code cleanup**~~ ✅ DONE — Deleted `detail-panel.tsx`, removed `detailPanelOpen`/`toggleDetailPanel`/`setDetailPanelOpen` from ui.store + tests + setup
- ~~**D3: `'tablet'` naming in layoutMode conflicts with UX spec terminology**~~ ✅ DONE — Renamed to `'compact'` in LayoutMode type, getLayoutMode, ReviewPageClient, and all tests

## Deferred from: code review of s-fix-14 (2026-04-05) — ALL RESOLVED (same session)

- ~~**D1: No optimistic-lock on concurrent admin edits**~~ ✅ DONE — `updateUserLanguagesSchema` accepts optional `previousLanguages` snapshot; server returns `CONFLICT` on mismatch. `LanguagePairEditor` sends pre-click snapshot. 4 new tests.
- ~~**D2: Auto-suggest tie-break strict `<`**~~ ✅ DONE — removed redundant comparison; SQL `ORDER BY workload` provides deterministic tie-break, first matched row always auto-suggested. Test updated.
- ~~**D3: `CommandEmpty` cmdk behavior**~~ ✅ DONE — moved `EmptyReviewerState` out of cmdk's `Command`/`CommandEmpty` into sibling conditional that renders unconditionally when no matches.
- ~~**D4: Empty-tenant dead-end**~~ ✅ DONE — added guidance text linking to `Projects → Settings` in both `NewUserLanguageChips` and `LanguagePairEditor` empty states.
- ~~**D5: Max-20 boundary test**~~ ✅ DONE — covered by P10 (`accepts exactly 20`, `rejects 21`).
- ~~**D6: Position-based insert assertions**~~ ✅ DONE — `__table` sentinels via `vi.hoisted()` + `findInsert(calls, tableName)` helper replaces `insertCalls[0]` / `insertCalls[length-1]`.
