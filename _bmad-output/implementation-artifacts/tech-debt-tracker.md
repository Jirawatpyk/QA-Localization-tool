# Tech Debt Tracker

**Created:** 2026-02-25 (post Story 2.7 CR R4)
**Last Verified:** 2026-02-25
**Source:** Cross-referenced from agent memory (anti-pattern-detector, code-quality-analyzer, tenant-isolation-checker, testing-qa-expert, inngest-function-validator)

---

## Status Legend

- **OPEN** — Not addressed, needs work
- **ACCEPTED** — Known but accepted with mitigation
- **DEFERRED** — Will address in a specific future story/epic

---

## Category 1: Database Schema & Constraints

### TD-DB-001: Missing UNIQUE on segments(file_id, segment_number)
- **Severity:** Medium
- **Risk:** Re-parsing a file can create duplicate segment rows
- **Mitigation:** Parser does DELETE+INSERT (idempotent), but constraint would enforce at DB level
- **Fix:** Add migration: `ALTER TABLE segments ADD UNIQUE (file_id, segment_number)`
- **Origin:** Story 2.2, flagged by code-quality-analyzer
- **Status:** OPEN

### TD-DB-002: Missing composite index on files(tenant_id, project_id)
- **Severity:** Low
- **Risk:** Performance only — queries filtering by both columns use sequential scan
- **Mitigation:** Data volume is small in current phase
- **Fix:** Add migration with composite index
- **Origin:** Story 2.1, flagged by code-quality-analyzer
- **Status:** DEFERRED (address when data grows, Epic 3-4)

### TD-DB-003: idx_findings_file_layer in migration but not in Drizzle schema
- **Severity:** Low
- **Risk:** Drizzle Kit `db:generate` won't know about this index; may drop it during future migrations
- **Fix:** Add `.index()` to Drizzle schema `findings` table definition
- **Origin:** Story 2.7, flagged by code-quality-analyzer
- **Status:** OPEN

### TD-DB-004: segmentId not persisted to DB
- **Severity:** Medium
- **Risk:** Cross-file analysis and finding deduplication can't reference segment identity
- **Mitigation:** fileId + segmentNumber used as proxy identifier
- **Fix:** Design decision needed — add column or use composite key
- **Origin:** Story 2.2, flagged by code-quality-analyzer
- **Status:** DEFERRED (needs design decision, arch review)

---

## Category 2: Code Quality & Anti-Patterns

### TD-CODE-001: Barrel export in pipeline/inngest/index.ts
- **Severity:** Medium (violates CLAUDE.md)
- **Risk:** CLAUDE.md explicitly forbids barrel exports in feature modules
- **Fix:** Delete `index.ts`; update `route.ts` to import directly from individual files
- **Origin:** Story 2.6, flagged by anti-pattern-detector
- **Status:** OPEN

### TD-CODE-002: `as never` type assertion in ExcelJS calls
- **Severity:** Low
- **Files:** `excelParser.ts:39`, `previewExcelColumns.action.ts:88`, `xbenchReportParser.ts:23`
- **Fix:** Change `as never` to `as Buffer`
- **Origin:** Story 2.3, flagged by anti-pattern-detector
- **Status:** OPEN

### TD-CODE-003: getFileHistory fetches ALL files + JS filter/paginate
- **Severity:** Medium
- **Risk:** O(N) memory for large projects
- **Mitigation:** 10K hard cap added in Story 2.7 CR R2
- **Fix:** Move filtering to DB query (WHERE + LIMIT/OFFSET)
- **Origin:** Story 2.7, flagged by code-quality-analyzer
- **Status:** ACCEPTED (10K cap mitigates for current scale)

---

## Category 3: Test Infrastructure

### TD-TEST-001: Proxy-based Drizzle mock duplicated in 5+ test files
- **Severity:** Medium
- **Impact:** Root cause of "schema mock drift" — when new columns are added, each mock must be updated independently. This caused ~20% of CR findings across Stories 2.6-2.7.
- **Fix:** Extract shared `createDrizzleMock()` utility to `src/test/drizzleMock.ts`
- **Origin:** Story 2.4, flagged by code-quality-analyzer + testing-qa-expert
- **Status:** OPEN

### TD-TEST-002: Low-priority test gaps (carry-over)
- **Severity:** Low
- **Items:**
  - `BatchSummaryView.test.tsx` — `crossFileFindings` prop untested
  - `FileHistoryTable.test.tsx` — `processedAt` vs `createdAt` type mismatch
  - `xbenchReportParser` — null worksheet path untested
  - `batchComplete.test.ts` — `vi.resetModules()` inside `it()` body
- **Origin:** Story 2.7 CR R1-R4, flagged by testing-qa-expert
- **Status:** ACCEPTED (low priority, no production risk)

---

## Category 4: Tenant Isolation (remaining low-severity)

### TD-TENANT-001: Realtime channel missing tenant_id filter
- **Severity:** Medium
- **File:** `src/features/notifications/hooks/useNotifications.ts`
- **Risk:** Filter is `user_id=eq.${userId}` only; relies entirely on RLS
- **Fix:** Add compound filter `user_id=eq.${userId}&tenant_id=eq.${tenantId}`
- **Origin:** Story 1.7, flagged by tenant-isolation-checker
- **Status:** OPEN

### TD-TENANT-002: glossary_terms duplicate-check by glossaryId only
- **Severity:** Low
- **Files:** `createTerm.action.ts`, `updateTerm.action.ts`
- **Mitigation:** glossaryId verified via withTenant() in same request; FK chain is safe
- **Origin:** Story 1.4, flagged by tenant-isolation-checker
- **Status:** ACCEPTED (safe via FK chain)

---

## Resolved Items (for historical reference)

These were flagged by agent memory but verified as **FIXED** on 2026-02-25:

| Item | Story | Resolution |
|------|-------|------------|
| crossFileConsistency DELETE over-broad | 2.7 | Scoped to scope='cross-file' + detectedByLayer='L1' |
| runRuleEngine withTenant missing | 2.4→2.6 | Moved to runL1ForFile.ts, all UPDATEs have withTenant() |
| route.ts batchId/projectId unverified | 2.1 | Ownership SELECT + withTenant() added |
| reportMissingCheck detached withTenant() | 2.7 | Removed; proper project SELECT added |
| generateParityReport unverified FK | 2.7 | Project ownership SELECT added |
| step.sendEvent wrong API | 2.6 | Corrected to `(stringId, events[])` batch form |
| PROCESSING_MODES hardcoded | 2.6 | All sites import from `@/types/pipeline` |
