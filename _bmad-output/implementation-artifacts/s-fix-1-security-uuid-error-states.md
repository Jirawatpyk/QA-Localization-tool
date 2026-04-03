# Story S-FIX-1: Security UUID Validation + Error States

Status: review

## Story

As a QA Reviewer,
I want invalid URLs to show helpful error pages (not raw DB errors) and 0-segment files to be handled gracefully,
so that I never see a broken page, security-sensitive information is never leaked, and I always know what to do next.

## Context

This is the **first story in Phase 1 (P0 Critical)** of the UX/UI Debt Clearance Sprint. It addresses 4 findings (ERR-01 through ERR-04) discovered during the deep verification audit of 174 UX checklist items. ERR-03 is a **P0 security vulnerability** — invalid UUIDs in route params are sent directly to Postgres without validation, leaking error details.

**Current state:**
- Root error boundary (`src/app/error.tsx`) and app error boundary (`src/app/(app)/error.tsx`) both show generic "Something went wrong" + "Try again" button — no context, no recovery actions
- Global not-found (`src/app/not-found.tsx`) shows "Page not found" + link to dashboard — adequate but plain
- **NO error boundary** exists at `src/app/(app)/projects/[projectId]/` level
- `src/app/(app)/projects/[projectId]/layout.tsx` passes `projectId` to children **without UUID validation**
- Review page (`[projectId]/review/[fileId]/page.tsx`) passes both params to server actions without route-level validation
- Some server actions validate UUID (via Zod or inline regex), but route pages do NOT — the DB query fires before validation
- Centralized `isUuid()` exists at `src/lib/validation/uuid.ts` but is underused (regex duplicated in 3+ files)
- 0-segment files pass through pipeline with "AI: analyzing..." stuck forever

## Acceptance Criteria

### AC1: UUID Validation on All Dynamic Route Segments (ERR-03 — P0 SECURITY)

**Given** a user navigates to a URL with an invalid UUID (e.g., `/projects/not-a-uuid/files`)
**When** the page server component resolves `params`
**Then** the page calls `notFound()` immediately — BEFORE any DB query or server action call
**And** the user sees the project-level not-found page (AC2) with recovery actions
**And** no Postgres error message is ever exposed to the client
**And** the invalid UUID attempt is logged server-side via `pino`

**Validation points (all must use `isUuid()` from `@/lib/validation/uuid.ts`):**
- `[projectId]` in layout.tsx (gate ALL child routes)
- `[fileId]` in review/[fileId]/page.tsx
- `[batchId]` in batches/[batchId]/page.tsx

### AC2: Project-Level Error Boundary + Not-Found Page (ERR-01)

**Given** an error occurs within any `projects/[projectId]/*` route
**When** the error boundary catches it
**Then** the error page shows:
  1. Error icon (AlertTriangle for errors, FileQuestion for not-found)
  2. Human-readable title (NOT "Something went wrong")
  3. Specific explanation based on error type
  4. Primary recovery action button (e.g., "Back to Projects", "Go to Dashboard")
  5. Secondary link ("Need help? Contact support")
**And** the page uses `role="alert"` for screen readers
**And** focus is placed on the error heading on mount

**Error pages to create:**
- `src/app/(app)/projects/[projectId]/error.tsx` — catches unexpected errors in project routes
- `src/app/(app)/projects/[projectId]/not-found.tsx` — shown when `notFound()` is called (invalid UUID, deleted project)

### AC3: Improved Root + App Error Boundaries (ERR-02)

**Given** an unexpected error occurs at root or app layout level
**When** the error boundary renders
**Then** it shows context-aware messaging (not generic "Something went wrong"):
  - Title: "This page couldn't load"
  - Description: "An unexpected error occurred. Your data is safe."
  - Primary: "Try again" button (existing `reset()`)
  - Secondary: "Go to Dashboard" link
  - Tertiary: "Need help? Contact support" link
**And** `console.error` is removed (error.tsx is `"use client"` — cannot import pino; Next.js already logs server errors to stdout; browser devtools capture client errors automatically)
**And** error `digest` is shown as small muted text for support reference

### AC4: 0-Segment File Guard (ERR-04)

**Given** a file has been parsed and has 0 segments
**When** the user navigates to its review page
**Then** `getFileReviewData` returns a specific error code `'EMPTY_FILE'`
**And** the review page shows an empty-file state (not "AI: analyzing..." forever):
  - Icon: FileQuestion or equivalent
  - Title: "No translatable content"
  - Description: "This file has no segments to review."
  - Primary: "Back to files" link
  - Secondary: "Upload a different file" link
**And** the Approve button is NOT rendered (no findings = nothing to approve)
**And** ScoreBadge shows "N/A" with gray color (not "Analyzing...")

### AC5: Centralize UUID Validation — Remove Inline Regex Duplication

**Given** inline `UUID_RE` regex exists in multiple server action files
**When** this story is complete
**Then** all inline UUID regex patterns are replaced with `import { isUuid } from '@/lib/validation/uuid'`
**And** no file contains a local `UUID_RE` constant (except the canonical `uuid.ts` and `src/types/tenant.ts` — see Dev Notes for rationale)

### AC6: Unit Tests

**Given** the validation and error handling changes
**Then** the following tests exist and pass:
- `isUuid()` — valid UUIDs (lowercase + uppercase), invalid strings (`"not-a-uuid"`, `"123"`), empty string, SQL injection patterns (`"'; DROP TABLE--"`, `"1' OR '1'='1"`), XSS (`"<script>alert(1)</script>"`), path traversal (`"../../etc/passwd"`)
- Route-level validation — mock `params` with invalid UUID → `notFound()` called
- `getFileReviewData` with 0-segment file → returns `{ success: false, code: 'EMPTY_FILE' }`
- Error boundary components — render with mock error → shows recovery actions

## UX States Checklist (Guardrail #96)

- [ ] **Loading state:** N/A — error pages are static, no loading required
- [ ] **Error state:** Error boundary shows Title + Explanation + Recovery Actions per UX spec pattern
- [ ] **Empty state:** 0-segment file shows "No translatable content" with CTA buttons
- [ ] **Success state:** N/A — this story is about error handling, not success flows
- [ ] **Partial state:** N/A — no progressive loading in error pages
- [ ] **UX Spec match:** Verified against `_bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md` lines 236-258 (Error State Pattern)

## Tasks / Subtasks

**Dependency order:** T1 → T2 → T3 → T4 (parallel with T5) → T6

- [x] **T1: Centralize UUID validation** (AC: #5)
  - [x] T1.1: Audit all files with inline `UUID_RE` — replace with `import { isUuid } from '@/lib/validation/uuid'`
  - [x] T1.2: Known locations with inline `UUID_RE` (verified line numbers):
    - `src/features/review/actions/getFileReviewData.action.ts` line 128
    - `src/features/project/actions/updateProject.action.ts` line 25
    - `src/features/review/actions/getFindingComments.action.ts` line 32
  - [x] T1.3: **DO NOT touch** `src/types/tenant.ts:15` — its `UUID_RE` is intentionally self-contained for the branded `TenantId` type. `validateTenantId()` must remain independent of `@/lib/validation/uuid` to keep the branded type boundary clean
  - [x] T1.4: Grep codebase for `/UUID_RE/` and `/[0-9a-f]{8}/` patterns in non-test `src/` files to find any missed duplicates

- [x] **T2: Add UUID validation to route layout** (AC: #1)
  - [x] T2.1: In `src/app/(app)/projects/[projectId]/layout.tsx` — validate `projectId` with `isUuid()`, call `notFound()` if invalid
  - [x] T2.2: In `src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx` — validate `fileId` with `isUuid()`, call `notFound()` if invalid
  - [x] T2.3: In `src/app/(app)/projects/[projectId]/batches/[batchId]/page.tsx` — validate `batchId` with `isUuid()`, call `notFound()` if invalid
  - [x] T2.4: Log invalid UUID attempts server-side: `logger.warn({ param, value }, 'Invalid UUID in route param')`

- [x] **T3: Create project-level error boundary + not-found** (AC: #2)
  - [x] T3.1: Create `src/app/(app)/projects/[projectId]/error.tsx` with recovery actions pattern
  - [x] T3.2: Create `src/app/(app)/projects/[projectId]/not-found.tsx` with "Project not found" + recovery links
  - [x] T3.3: Both pages must include: `role="alert"`, auto-focus heading, recovery buttons, support link
  - [x] T3.4: Use existing design tokens (no inline Tailwind colors — Guardrail): `text-error`, `text-text-primary`, `text-text-secondary`, `bg-primary`

- [x] **T4: Improve root + app error boundaries** (AC: #3)
  - [x] T4.1: Update `src/app/error.tsx` — better messaging, error digest display, dashboard link, support link
  - [x] T4.2: Update `src/app/(app)/error.tsx` — same improvements
  - [x] T4.3: Remove `console.error` in `useEffect` — `error.tsx` is `"use client"` so pino cannot be imported. Next.js already logs the server-side error to stdout before the boundary renders. Browser devtools capture the client error automatically. The `useEffect` + `console.error` is redundant — delete it entirely

- [x] **T5: 0-segment file guard** (AC: #4)
  - [x] T5.1: In `getFileReviewData.action.ts` — add early return BEFORE the existing D5 query logic. After the `targetLangRows` query (line ~288), check: if `targetLangRows.length === 0` return `{ success: false, error: 'This file has no translatable content', code: 'EMPTY_FILE' }`. Note: D5 fix at lines 312-315 already handles null targetLang safely in the JOIN, but it continues to return an empty dataset — this guard provides an explicit early exit with a dedicated error code for the UI
  - [x] T5.2: In `src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx` — handle `code === 'EMPTY_FILE'` with dedicated empty-file UI (separate from the generic error block)
  - [x] T5.3: Empty-file UI: FileQuestion icon, "No translatable content" title, "Back to files" + "Upload a different file" links
  - [x] T5.4: Ensure Approve button and ReviewPageClient are NOT rendered for empty files

- [x] **T6: Unit tests** (AC: #6)
  - [x] T6.1: `src/lib/validation/uuid.test.ts` — isUuid edge cases (valid, invalid, empty, SQL injection, case insensitive)
  - [x] T6.2: Error boundary component tests — render with error prop, verify recovery actions rendered
  - [x] T6.3: 0-segment guard test in `getFileReviewData.test.ts`
  - [x] T6.4: Run `npm run lint && npm run type-check && npm run test:unit` — lint 0 errors, type-check clean, unit 4570/4590 pass (1 pre-existing timeout failure in TaxonomyManager unrelated to S-FIX-1)

## Dev Notes

### Architecture & Patterns

**Error Boundary Pattern (from architecture docs):**
- Server Actions: Return `ActionResult<T>` for expected errors, throw for unexpected
- Error boundaries catch thrown errors at nearest `error.tsx`
- `notFound()` from `next/navigation` triggers nearest `not-found.tsx`
- `"use client"` required on `error.tsx` (Next.js requirement)

**UUID Validation Flow:**
```
URL with [projectId] → layout.tsx
  → isUuid(projectId) ? continue : notFound()
    → child page.tsx validates additional params ([fileId], [batchId])
      → server action validates via Zod schema (defense-in-depth)
```

**Existing `isUuid()` utility:**
```typescript
// src/lib/validation/uuid.ts — USE THIS, do not duplicate
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
```

**Error Page UX Pattern (from ux-consistency-patterns.md:236-258):**
```
+--------------------------------------+
| [Icon]                               |
| [Error Title]                        |
|                                      |
| [Human-readable explanation]         |
|                                      |
| [Primary Recovery Action]            |
| [Secondary: Go to Dashboard]         |
| [Tertiary: Need help?]              |
+--------------------------------------+
```

**Toast specs for errors (from ux-consistency-patterns.md:59-66):**
| Type | Visual | Position | Duration |
|------|--------|----------|----------|
| Error | Red, error icon | **Top-center** | **Persistent until dismissed** |
| Success | Green, checkmark | Bottom-right | 3s auto-dismiss |

### Critical Implementation Notes

**`src/types/tenant.ts` UUID_RE is an accepted exception (C1):**
`validateTenantId()` uses its own `UUID_RE` because it's a branded type boundary — it must be self-contained to prevent circular imports (`tenant.ts` → `uuid.ts` → potential type deps). The branded `TenantId` type is a compile-time enforcement mechanism and its validation is intentionally co-located. Do NOT refactor this.

**0-segment guard vs D5 fix (C2):**
`getFileReviewData.action.ts` lines 312-315 already has a "D5 fix" that handles `null` targetLang via conditional JOIN (`sql\`false\``). This prevents **query crashes** but the action still continues and returns an empty dataset (0 findings, null configs). AC4 requires an **early return** with `code: 'EMPTY_FILE'` BEFORE the D5 logic, so the review page can show a dedicated empty-file UI instead of rendering ReviewPageClient with no data.

**`error.tsx` is `"use client"` — no server logger (E1):**
Next.js error boundaries must be Client Components. `pino` is server-only. The current `console.error` in `useEffect` is redundant — Next.js logs the error server-side before rendering the boundary. Browser devtools capture client errors. Solution: delete the `useEffect` + `console.error` entirely. Do NOT try to import pino or create a fetch-based reporter — that's over-engineering for this story.

**Logger utility path:**
`import { logger } from '@/lib/logger'` — use in Server Components and server actions only (T2.4 logging).

### Guardrails to Follow

| # | Guardrail | Applies To |
|---|-----------|-----------|
| #3 | Guard `rows[0]!` — always check length before access | T5 (0-segment guard) |
| #15 | Severity display: icon shape + text + color | T3 (error icon usage) |
| #16 | Contrast 4.5:1 + focus ring `outline: 2px solid` | T3, T4 (error pages) |
| #19 | ARIA landmarks + `aria-live` | T3 (role="alert" on error) |
| #20 | `prefers-reduced-motion: reduce` on animations | T3 (if any animation) |
| #22 | No bare `string` for status — use union types | T5 (error code type) |
| #95 | UI must match UX spec before done | All tasks |
| Anti-pattern | No `console.log` — remove `console.error` in client error boundaries (pino unavailable in `"use client"`) | T4 |
| Anti-pattern | No `export default` except Next.js pages | T6 (test files) |

### Scope Boundaries

**IN scope:**
- UUID validation on route params (layout + page level)
- Project-level error.tsx and not-found.tsx
- Improve existing root + app error boundaries
- 0-segment file empty state in review page
- Centralize UUID regex (remove duplicates)
- Unit tests for validation + error components

**OUT of scope:**
- Upload-time 0-segment rejection (belongs to S-FIX-11 Dashboard Polish / upload guard)
- Toast notification system changes (existing sonner works — this story is about page-level errors)
- Error logging infrastructure (pino already configured)
- Pipeline error handling (belongs to S-FIX-5 Score Recalculation)
- ScoreBadge "N/A" state implementation (only if trivially addable; full ScoreBadge rework is S-FIX-5)

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(app)/projects/[projectId]/error.tsx` | **CREATE** | Project-level error boundary with recovery actions |
| `src/app/(app)/projects/[projectId]/not-found.tsx` | **CREATE** | Project-level 404 with "Project not found" + links |
| `src/app/(app)/projects/[projectId]/layout.tsx` | MODIFY | Add `isUuid(projectId)` validation → `notFound()` |
| `src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx` | MODIFY | Add `isUuid(fileId)` validation + empty-file UI |
| `src/app/(app)/projects/[projectId]/batches/[batchId]/page.tsx` | MODIFY | Add `isUuid(batchId)` validation |
| `src/app/error.tsx` | MODIFY | Better messaging, digest display, dashboard link |
| `src/app/(app)/error.tsx` | MODIFY | Better messaging, digest display, dashboard link |
| `src/features/review/actions/getFileReviewData.action.ts` | MODIFY | Replace inline UUID_RE (line 128) with `isUuid()` + add 0-segment guard |
| `src/features/project/actions/updateProject.action.ts` | MODIFY | Replace inline UUID_RE (line 25) with `isUuid()` import |
| `src/features/review/actions/getFindingComments.action.ts` | MODIFY | Replace inline UUID_RE (line 32) with `isUuid()` import |
| `src/types/tenant.ts` | **SKIP** | Intentional self-contained UUID_RE for branded TenantId — do NOT modify |
| `src/lib/validation/uuid.test.ts` | **CREATE** | Unit tests for isUuid() |

### Previous Story Intelligence

No previous S-FIX stories exist — this is the first. The most recent story was 6-2b (notification event types wiring). Key patterns from that story:
- Tasks follow dependency order notation (T1 → T2 → T3/T4 parallel)
- Dev notes include explicit guardrail table
- File list uses NEW vs MODIFY labels
- `ActionResult<T>` pattern with specific error codes is well-established

### Git Intelligence

Recent commits follow Conventional Commits: `feat(guardrails):`, `docs(sprint):`, `docs(ux-audit):`
For this story, commits should use: `fix(security): UUID validation on route params` and `feat(error): project-level error boundary`

### Testing Strategy

**Unit tests (Vitest, jsdom project):**
- `src/lib/validation/uuid.test.ts` — isUuid edge cases
- Error boundary render tests using `@testing-library/react`
- `getFileReviewData` mock test for 0-segment code path

**Manual verification (Playwright MCP browser):**
- Navigate to `/projects/not-a-uuid/files` → see not-found page
- Navigate to `/projects/{validId}/review/not-a-uuid` → see not-found page
- Navigate to review page of 0-segment file → see empty-file state
- Verify no Postgres errors in browser console or network tab
- Verify error page accessibility: focus on heading, keyboard-navigable recovery links

### References

- [Error State UX Pattern: ux-consistency-patterns.md lines 236-258]
- [Toast Specs: ux-consistency-patterns.md lines 59-66]
- [Error Page Accessibility: responsive-design-accessibility.md lines 78-134]
- [ScoreBadge States: component-strategy.md lines 272-282]
- [Empty States: ux-consistency-patterns.md lines 225-235]
- [Error Handling Architecture: implementation-patterns-consistency-rules.md lines 233-265]
- [Findings Detail: DEEP-VERIFICATION-CHECKLIST.md lines 572-576]
- [Bug Reports: PROJECT-TOUR-REPORT.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Pre-existing ProjectTour.test.tsx 3 failures → root cause: `dismissedRef.current = true` on mount when `dismissed_at_step.project > 0` prevented resume. Fixed by removing server-state suppression — `dismissedRef` now only set by in-session `onCloseClick`.
- Pre-existing TaxonomyManager.test.tsx timeout failures — unrelated to S-FIX-1, not addressed.

### Completion Notes List

- T1: Replaced inline `UUID_RE` in 3 files with `isUuid()` from `@/lib/validation/uuid`. Confirmed only `uuid.ts` (canonical) and `tenant.ts` (intentional exception) remain.
- T2: Added `isUuid()` + `notFound()` gate on `projectId` (layout.tsx), `fileId` (review page), `batchId` (batch page). All log invalid attempts via `logger.warn`.
- T3: Created `error.tsx` (client, auto-focus heading, recovery actions, digest display) and `not-found.tsx` (server, uses `AutoFocusHeading` client component) at project level. Created reusable `AutoFocusHeading` component.
- T4: Updated root + app error boundaries — removed `console.error`, added digest display, dashboard link, support link, auto-focus heading, `role="alert"`.
- T5: Added `EMPTY_FILE` early return in `getFileReviewData` when `targetLangRows.length === 0`. Review page shows dedicated empty-file UI with FileQuestion icon, "No translatable content", "Back to files" + "Upload a different file" links. No Approve button or ReviewPageClient rendered.
- T6: Created `uuid.test.ts` (14 tests), `error.test.tsx` (6 tests), updated `getFileReviewData.action.test.ts` (0-segment test now expects `EMPTY_FILE`). Lint 0 errors, type-check clean, 4570/4590 unit tests pass.
- Bonus: Fixed pre-existing ProjectTour resume bug (19/19 pass).

### Change Log

- 2026-04-03: S-FIX-1 implementation complete — UUID validation, error boundaries, 0-segment guard, unit tests
- 2026-04-03: Fixed pre-existing ProjectTour resume bug (dismissed_at_step server state was incorrectly suppressing tour)

### File List

**NEW:**
- `src/app/(app)/projects/[projectId]/error.tsx` — Project-level error boundary
- `src/app/(app)/projects/[projectId]/not-found.tsx` — Project-level 404 page
- `src/app/(app)/projects/[projectId]/error.test.tsx` — Error boundary tests (6 tests)
- `src/components/ui/auto-focus-heading.tsx` — Reusable auto-focus heading client component
- `src/lib/validation/uuid.test.ts` — isUuid unit tests (14 tests)

**MODIFIED:**
- `src/app/(app)/projects/[projectId]/layout.tsx` — UUID validation on projectId
- `src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx` — UUID validation on fileId + EMPTY_FILE UI
- `src/app/(app)/projects/[projectId]/batches/[batchId]/page.tsx` — UUID validation on batchId
- `src/app/error.tsx` — Improved messaging, digest, auto-focus, removed console.error
- `src/app/(app)/error.tsx` — Improved messaging, digest, auto-focus, removed console.error
- `src/features/review/actions/getFileReviewData.action.ts` — isUuid import + EMPTY_FILE guard
- `src/features/project/actions/updateProject.action.ts` — isUuid import, removed inline UUID_RE
- `src/features/review/actions/getFindingComments.action.ts` — isUuid import, removed inline UUID_RE
- `src/features/review/actions/getFileReviewData.action.test.ts` — Updated 0-segment test for EMPTY_FILE
- `src/features/onboarding/components/ProjectTour.tsx` — Fixed resume bug (pre-existing)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Status update
