# Story 3.3 — AI Layer 3 Deep Contextual Analysis CR R1

**Date:** 2026-03-07 (updated with implementation scan)
**Result:** 0C / 3H / 5M / 4L

## Key Findings

### HIGH

- **H1:** `l2SegmentStats` query (runL3ForFile.ts:202-216) missing `eq(findings.projectId, projectId)` — asymmetric filter (Anti-Pattern #14). priorFindings query HAS it.
- **H2:** `useReducedMotion()` hook duplicated in ScoreBadge.tsx:59-76 + FindingListItem.tsx:45-58 — DRY violation, extract to shared hook
- **H3:** `stripL3Markers` (FindingListItem.tsx:36-38) uses `String.replace(string)` — only removes FIRST occurrence. Use `replaceAll()`.

### MEDIUM

- **M1:** `as PriorFindingContext[]` unsafe cast (runL3ForFile.ts:199) without Zod validation, then double-cast at line 339-342
- **M2:** ReviewPageClient.story33.test.tsx:130 — `toHaveTextContent(/complete/)` matches sr-only text (fragile)
- **M3:** Rationale concatenated into description field (line 482) — AI content may contain L3 marker strings, causing false badge display
- **M4:** console.warn in E2E cleanup (acceptable for E2E, noted)
- **M5:** E2E test.skip syntax wrong: `test(!cond, msg)` should be `test.skip(!cond, msg)` (line 54-57)

### LOW

- **L1:** Mock setup duplicated between runL3ForFile.test.ts and runL3ForFile.story33.test.ts (~130 lines)
- **L2:** l3-output.ts string fields missing `.min(1)` (Anti-Pattern #36)
- **L3:** `segmentId: z.string()` should be `.uuid()`
- **L4:** FindingListItem.story33.test.tsx:22 — `id: dbFinding.segmentId` semantically wrong

## Patterns Confirmed

- withTenant: CORRECT on all 8 queries (taxonomyDefinitions correctly excluded — global table)
- Audit log non-fatal: CORRECT pattern (try-catch in happy path + error rollback)
- Transaction DELETE+INSERT: CORRECT (line 496-511)
- AI cost tracking: CORRECT (both success + error paths)
- AI error classification: CORRECT (rate_limit/timeout retriable, others non-retriable + partial failure)
- Surrounding context per-chunk filtering: IMPLEMENTED (line 332-335, reduces token cost)
- Idempotent marker dedup: CORRECT (checks `.includes()` before append)
- Design tokens: CORRECT (--color-status-deep-analyzed in tokens.css)

## New Patterns Noted

- **Duplicated `useReducedMotion`** — first occurrence of duplicated hooks across feature boundaries. Need shared `src/hooks/` directory.
- **stripL3Markers replaceAll** — `String.replace(string, string)` trap: only first match. Always use `replaceAll()` for cleanup functions.
- **E2E test.skip** — `test(boolean, string)` is NOT Playwright's conditional skip API. Must use `test.skip(condition, reason)`.
