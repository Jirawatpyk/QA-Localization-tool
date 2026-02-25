# Story 2.7 — Batch Summary, File History & Parity Tools — CR Round 1

## Summary

- 6 Critical, 9 High, 11 Medium, 5 Low findings
- Key themes: missing Inngest registration, field name mismatches, missing Zod validation, audit log non-fatal pattern violations, event type drift

## Critical Findings

### C1: batchComplete not registered in Inngest route

- `src/app/api/inngest/route.ts` — `functions` array missing `batchComplete`
- Cross-file consistency analysis will NEVER trigger

### C2: ReportMissingCheckDialog field name mismatch

- Dialog sends `description`/`checkType`, schema expects `expectedDescription`/`expectedCategory`
- Submit will ALWAYS fail with VALIDATION_ERROR

### C3: batchComplete.ts local type drifts from PipelineBatchCompletedEventData

- Local type has `fileIds: string[]` — canonical type does NOT
- Canonical type has `mode: ProcessingMode`, `userId: string` — local type does NOT
- Runtime: `event.data.fileIds` will be undefined

### C4: generateParityReport — no Zod validation, no try-catch, writeAuditLog fatal

- Server Action accepts typed input without Zod safeParse
- No top-level try-catch — DB errors cause unhandled 500
- writeAuditLog at line 103 is fatal (not wrapped in try-catch)

### C5: compareWithXbench — same issues as C4 + no project ownership check

### C6: crossFileConsistency inArray(fileIds) — no empty array guard

- `inArray(col, [])` generates invalid SQL

## High Findings

### H1: \_sourceMatch computed but NOT used in match condition (parityComparator.ts:80-85)

### H2: generateParityReport uses toolFindings[0]?.fileId as comparison fileId — wrong for multi-file

### H3: getFileHistory fetches ALL files then filters/paginates in JS — N+1-like perf issue

### H4: ParityReportResult uses unknown[] for finding arrays

### H5: needReview vs needsReview naming inconsistency between action and types.ts

### H6: Math.max/min(...spread) stack overflow on large arrays (getBatchSummary:115-116)

### H7: reportMissingCheck writeAuditLog not wrapped in try-catch (non-fatal pattern)

### H8: crossFileConsistency loop INSERT — should be batch insert

### H9: crossFileConsistency DELETE+INSERT not in transaction — data loss risk

## Medium Findings

### M1: Duplicate type definitions (action local types vs types.ts)

### M2: Bare `string` types for status fields across batch/parity types

### M3: Buffer.from() in client component (ParityComparisonView) — should use Uint8Array

### M4: xbenchReportParser hardcoded column limit 20

### M5: xbenchReportParser `as any` cast — could be narrower

### M6: xbenchReportStoragePath hardcoded 'uploaded'

### M7: lastReviewerName mapped from scores.status — displays 'calculated' not reviewer name

### M8: BatchFileItem type mismatch (number vs number|null) for criticalCount

### M9: crossFileConsistency .select() fetches all columns — should be selective

### M10: processFile.ts batch completion logic not implemented (all ATDD tests skipped)

### M11: ReportMissingCheckDialog custom dropdown lacks keyboard nav, click-outside

## Low Findings

### L1: Duplicate formatStatus function (FileStatusCard vs FileHistoryTable)

### L2: FileHistoryTable pagination renders all page buttons (no ellipsis)

### L3: ScoreBadge variantClasses uses Record<string,string> not union type

### L4: generateTrackingReference uses Math.random (not CSPRNG)

### L5: Inconsistent PAGE_SIZE (50 server, 20 client, 50 exported const unused)

## Patterns Confirmed

- withTenant() used correctly on ALL queries
- Named exports only in features (no export default)
- No console.log found
- No process.env direct access
- Factory functions added for all new types
- RLS policies and indexes in migration

---

## CR Round 2 (post-R1 fixes)

### Summary

- 2 Critical, 4 High, 6 Medium, 3 Low = 15 findings
- Key themes: parityComparator empty-string fileId silently drops all tool matches (C1), unsafe `as string` on nullable columns (C2), crossFileConsistency still no transaction (H1), batchComplete missing onFailure+retries (H2), dead Zod schema drift (H3), getFileHistory still fetching all rows (H4)

### R2 Findings

#### Critical

- C1: `compareFindings()` called with `fileId ?? ''` — empty string matches NO tool findings, project-level comparison returns 100% xbench-only (parityComparator.ts:59, generateParityReport.action.ts:98, compareWithXbench.action.ts:85)
- C2: `f.fileId as string` / `f.segmentId as string` on nullable columns — runtime TypeError on cross-file findings (generateParityReport.action.ts:93-96, compareWithXbench.action.ts:80-83)

#### High

- H1: crossFileConsistency DELETE+INSERT still not in transaction (R1 H9 unresolved) — data loss if INSERT fails after DELETE
- H2: batchComplete.ts missing retries + onFailure handler — inconsistent with processBatch/processFile pattern; silent failure
- H3: paritySchemas.ts `generateParityReportSchema` (xbenchReportFile: string) vs action inline inputSchema (xbenchReportBuffer: Uint8Array) — dead schema, tests validate wrong thing
- H4: getFileHistory still fetches ALL files + JS filter/paginate (R1 H3 unresolved) — O(N) memory for large projects

#### Medium

- M1: processFile.ts batch completion check has TOCTOU — concurrent files both dispatch batch-completed event (mitigated by concurrency key)
- M2: ReportMissingCheckDialog missing click-outside, Escape, focus trap, aria-modal (R1 M11 partially addressed)
- M3: crossFileConsistency glossary query lacks projectId filter — terms from other projects used as exclusion
- M4: FileHistoryPageClient error branch missing — silently swallows filter fetch failures
- M5: Batch detail page doesn't pass crossFileFindings to BatchSummaryView — AC#7 UI wired but no data
- M6: Parity page missing requireRole() — page renders shell without auth check

#### Low

- L1: generateTrackingReference modulo bias (256 % 36) — not cryptographic but easy fix
- L2: FileHistoryTable destructures out projectId — file names not linked to review page
- L3: xbenchReportParser `as any` cast — could use Buffer.from(buffer) instead

### R1 Fixes Confirmed

- C1 (Inngest registration): FIXED — batchComplete in route.ts functions array
- C2 (field name mismatch): FIXED — dialog sends expectedDescription/xbenchCheckType
- C3 (local type drift): FIXED — batchComplete uses canonical PipelineBatchCompletedEventData
- C4/C5 (Zod validation + project ownership): FIXED — both actions have safeParse + project query
- C6 (empty array guard): FIXED — `if (fileIds.length === 0) return`
- H1 (sourceMatch): FIXED — used in match condition
- H6 (Math.max/min spread): FIXED — reduce loop
- H7 (audit log non-fatal): FIXED — try-catch in both actions
- H8 (batch insert): FIXED — single INSERT
- M3 (Buffer.from client): FIXED — uses Uint8Array
- M10 (batch completion): FIXED — implemented in processFile.ts
- L1 (duplicate formatStatus): FIXED — shared formatFileStatus helper
- L2 (pagination ellipsis): FIXED — getPaginationPages function
- L4 (Math.random): FIXED — crypto.getRandomValues()

---

## CR Round 3 (post-R2 fixes)

### Summary

- 1 Critical, 3 High, 3 Medium, 1 Low = 8 findings
- 4 carryover from R2 (C1, H1, M1, M2) + 4 new (H2, H3, M3, L1)
- Key themes: transaction atomicity (C1 still open), batchComplete onFailure (H1 still open), toolFindingCount mismatch when fileId provided (H3), buffer size limit missing (M3)

### R3 Findings

#### Critical

- C1: crossFileConsistency DELETE+INSERT still NOT in db.transaction() (R1-H9, R2-H1, R3-C1 — 3 rounds open)

#### High

- H1: batchComplete.ts missing retries + onFailure (R2-H2 carryover)
- H2: batchComplete resolve-batch-files query missing eq(files.projectId, projectId) defense-in-depth
- H3: generateParityReport toolFindingCount counts ALL project findings but comparison filters by fileId — count mismatch in report

#### Medium

- M1: getFileHistory still fetches ALL files + JS filter (R2-H4 carryover, mitigated by 10K hard cap — accepted tech debt)
- M2: Parity page missing requireRole() at page level (R2-M6 carryover)
- M3: xbenchReportBuffer Zod schema has no size limit — DoS risk via large upload

#### Low

- L1: Redundant `as string` cast on notNull varchar columns in parity actions

### R2 Fixes Confirmed

- C1 (fileId ?? '' → optional): FIXED — compareFindings fileId param uses optional correctly
- C2 (unsafe as string on nullable): FIXED — f.fileId ?? null, f.segmentId ?? null
- H3 (dead schema): FIXED — generateParityReportSchema uses xbenchReportBuffer: Uint8Array
- M2 (dialog accessibility): FIXED — Escape key, click-outside, aria-modal, role="dialog"
- M5 (crossFileFindings prop): FIXED — batch detail page passes crossFileFindings to BatchSummaryView

---

## CR Round 4 (post-R3 fixes)

### Summary

- 0 Critical, 2 High, 3 Medium, 2 Low = 7 findings
- All R3 Critical/High FIXED (transaction, batchComplete retries/onFailure, projectId filter, toolFindingCount, size limit, requireRole)
- New themes: perf (Set spread in loop), data loss (segmentNumber=0), UI state (form reset), test completeness (schema mocks)

### R4 Findings

#### High

- H1: crossFileConsistency.ts:91 — `[...glossaryTermSet].some()` spreads Set to array per segment iteration; O(S\*G) + N allocations. Use `for...of` or cache array once.
- H2: compareWithXbench.action.ts:94 — `segmentNumber: 0` hardcoded in `toFinding`; XbenchFinding.segmentNumber data discarded. Users can't locate findings in source file.

#### Medium

- M1: getBatchSummary.action.test.ts:79-100 — schema mocks missing `updatedAt`, `layerCompleted`, `majorCount`, `minorCount` — tests won't catch removal of JOIN conditions
- M2: ReportMissingCheckDialog.tsx — form state not reset on close/submit; stale data on re-open
- M3: ReportMissingCheckDialog.tsx:69 — `fileReference || fileId || ''` confusing; should pre-fill state via `useState(fileId ?? '')`

#### Low

- L1: compareWithXbench.action.ts:93 — description field uses category name, not meaningful description text
- L2: paritySchemas.ts:33 — xbenchCheckType accepts any string, no enum validation against CHECK_TYPES

### R3 Fixes Confirmed

- C1 (transaction): FIXED — db.transaction() wraps DELETE+INSERT in crossFileConsistency.ts:180-197
- H1 (batchComplete retries/onFailure): FIXED — retries:3, onFailureFn, Object.assign pattern
- H2 (batchComplete projectId): FIXED — eq(files.projectId, projectId) in resolve-batch-files query
- H3 (toolFindingCount): FIXED — relevantToolFindingCount filters by fileId before counting
- M2 (parity page requireRole): FIXED — `await requireRole('qa_reviewer')` at page level
- M3 (xbenchReportBuffer size): FIXED — Zod .refine() with 10MB limit
