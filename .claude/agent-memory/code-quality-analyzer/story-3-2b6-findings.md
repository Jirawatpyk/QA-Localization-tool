# Story 3.2b6 — Orphan Wiring Cleanup CR R1

**Date:** 2026-03-02
**Findings:** 0C / 3H / 5M / 4L
**Verdict:** Minor cleanup story — no critical issues

## Key Findings

### H1: DRY Violation — adminHeaders() + seed functions duplicated across 4 E2E spec files

- `adminHeaders()`, env vars, `seedFile()`, `seedFinding()`, `seedBatch()`, `seedScore()` copy-pasted
- `pipeline-admin.ts` already has `adminHeaders()` — not reused
- Tech debt: extract to `e2e/helpers/seed-helpers.ts`

### H2: Unguarded `data[0].id` in E2E seed functions

- PostgREST can return `200 []` even with `Prefer: return=representation` (RLS edge case)
- Crash with unhelpful error message

### H3: Stale `// RED:` comments in AiBudgetCard.test.tsx

- Lines 69, 80, 91, 116-117 — all features implemented, comments outdated
- 1-minute fix

### M2: No try-catch in startTransition async callback

- If `updateBudgetAlertThreshold` throws (not returns error), Error Boundary catches it
- Better: catch + toast.error + revert

### Pattern: E2E PostgREST seeding

- This story established pattern: seed DB data via PostgREST in `[setup]` test
- Much faster than upload+parse+process flow
- Trades: loses E2E coverage of upload-parse path, gains speed + Inngest independence
