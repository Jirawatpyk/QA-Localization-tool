# Story 5.2c Native Reviewer Workflow CR R1-R3

## R1 (2026-03-28)

**Findings:** 1C / 5H / 7M / 5L

### Critical (fixed)

- C1: `flagForNative.action.ts:128` — jsonb containment used `fileId` (UUID) instead of target language

### High (fixed in R2 code)

- H1: 3 actions return hardcoded findingMeta defaults
- H2: getFindingComments no Zod UUID validation
- H3: startNativeReview no Zod UUID validation
- H4: addFindingComment role hierarchy too restrictive
- H5: Q9 missing projectId filter (asymmetric query)

---

## R2 (2026-03-29) — Initial R2 scan

**Findings:** 0C / 4H / 5M / 5L

- H1: confirmNativeReview + overrideNativeReview NOT wired
- H2: FindingDetailContent missing assignmentId/flaggerComment props
- H3: getFindingComments unbounded query
- H4: getFindingComments bare string param
- FIXED IN SUBSEQUENT CODE CHANGES

---

## R3 (2026-03-29) — Full re-review after R2 fixes

**Findings:** 0C / 3H / 5M / 4L

### HIGH

- **H1:** `ReviewPageClient.tsx:876` — `currentState.findingsMap.get(id)` uses stale flat field (TD-ARCH-002 violation). Should use `getStoreFileState(currentState, fileId).findingsMap.get(id)`
- **H2:** `confirmNativeReview.action.ts:89-91` + `overrideNativeReview.action.ts:89-91` — Missing `eq(findings.projectId, projectId)` in finding detail query (Guardrail #14 asymmetric with flagForNative)
- **H3:** `ReviewPageClient.tsx:478,1440` — Native override hardcoded to `'accepted'`, no status picker. AC3 specifies Accept/Reject choice. No TD entry.

### MEDIUM

- **M1:** `startNativeReview.action.ts:20-21` — No UUID validation for `assignmentId` param
- **M2:** `getNativeReviewers.action.ts:34-49` — May return duplicate users (no DISTINCT)
- **M3:** `FlagForNativeDialog.tsx:119` — Passes `result.data.findingId` as `assignmentId` (misleading)
- **M4:** `FindingCommentThread.tsx:40-58` — No comment state clear on assignment change (stale flash)
- **M5:** `confirmNativeReview.action.ts:101-110` — flagActionRows missing `fileId` filter

### LOW

- L1: ~140 lines duplicated confirm/override logic (DRY)
- L2: KeyboardCheatSheet shows native shortcuts to all roles
- L3: FindingDetailContent missing native reviewer buttons
- L4: `lang="en"` hardcoded in FindingCommentThread

### Positive

- withTenant() correct on ALL queries
- Atomic transactions correct
- Notification non-blocking
- Form state reset (prev-compare pattern)
- Realtime assignment subscription wired
- State transition matrix properly extended

### New Pattern

- **#38: Flat field access after TD-ARCH-002 refactor** — After migrating to fileStates Map, grep for ALL `currentState.findingsMap` / `store.findingsMap` outside store internals — reading stale flat fields
