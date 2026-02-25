# Story 2.6 CR Round 4 — Adversarial Review of R3 Tests (2026-02-25)

Review of ALL NEW tests added in CR Round 3. 2C · 3H · 6M · 3L = 14 findings.

## CRITICAL

### C1: onFailureBatchFn — ZERO tests (processBatch.test.ts)

- Source: `src/features/pipeline/inngest/processBatch.ts` lines 46-59
- `onFailureBatchFn` is NOT exposed via `Object.assign` (only `handlerFn` is: line 73-75)
- Therefore it is inaccessible to tests via the `(processBatch as { handler }).handler` pattern
- No test: logger.error called with batchId, event.data.event.data read correctly
- Fix: add `onFailure: onFailureBatchFn` to `Object.assign` block (matching processFile.ts pattern)
  then add test calling it directly and asserting `logger.error` called with `{ batchId }`

### C2: scoreFile INSERT guard — empty returning path uncovered (scoreFile.test.ts)

- Source: `src/features/scoring/helpers/scoreFile.ts` line 155: `if (!inserted) throw new Error(...)`
- No test ever sets `dbState.returnValues[4] = []` (the INSERT `.returning()` slot)
- All tests provide `[mockNewScore]` at slot 4 — the `!inserted` branch is dead in tests
- Fix: add test with `dbState.returnValues = [mockSegments, [], [undefined], [], []]`
  and assert rejects with message matching `/Score insert returned no rows/`

## HIGH

### H1: throwAtCallIndex cannot inject errors into .returning() terminal (startProcessing.action.test.ts)

- File: lines 41-76 — Proxy mock `.returning()` at line 44 does NOT check `throwAtCallIndex`
- Only the `.then` handler checks it (line 52-57)
- DB error paths for queries that use `.returning()` as terminal (CAS in runL1ForFile) are untestable
- Not a false positive — `throwAtCallIndex = 1` correctly targets the projects UPDATE (`.then` terminal)
- But documents a permanent blind spot in the mock design

### H2: processFile.ts onFailureFn try-catch path — no test (processFile.test.ts)

- Source: `src/features/pipeline/inngest/processFile.ts` lines 54-64
- The existing onFailure tests only cover success path (DB update succeeds)
- Catch block at line 59-63: `logger.error({err: dbErr, fileId}, 'failed to update file status in onFailure')`
- No mechanism in processFile.test.ts Proxy to make the DB update inside onFailureFn throw
- Fix: add `throwAtCallIndex` to processFile.test.ts Proxy mock (same pattern as startProcessing mock)
  then add test asserting: function does not throw, logger.error called with the DB error

### H3: ModeCard keyboard tests — e.preventDefault() on Space not verified (ModeCard.test.tsx)

- Lines 84-93: `user.keyboard(' ')` fires keydown but cannot verify `e.preventDefault()` was called
- Source: `src/features/pipeline/components/ModeCard.tsx` line 33: `e.preventDefault()` on Space
- Without this, page scrolls on Space press — WCAG SC 2.1.1 violation
- Cannot be fixed in RTL; would require Playwright E2E test for scroll prevention
- Also: `tabindex` only checked not-null (line 101) — should be exact `'0'`
- Also: no `role="radiogroup"` wrapper in source — ARIA radio pattern incomplete (source-level issue)

## MEDIUM

### M1: CONFLICT test missing inngest.send not-called assertion (startProcessing.action.test.ts line 383)

- R3 test at line 383: `expect(mockInngestSend).not.toHaveBeenCalled()` — this IS present, good
- But `writeAuditLog` not asserted as not-called when DB throws at slot 1
- Minor: future refactor moving writeAuditLog before inngest.send would not be caught

### M2: Zod refine error message unpinned (pipelineSchema.test.ts line 141-151)

- R3 duplicate test only asserts `result.success === false`
- Message `'Duplicate file IDs are not allowed'` never checked
- Downstream: `startProcessing` returns `result.error = parsed.error.message` — user-visible

### M3: score.auto_passed — persisted DB status not verified, only audit action (scoreFile.test.ts line 386-406)

- R3 test at line 386 verifies audit log action is `'score.auto_passed'` — correct
- But `newScore.status` returned from DB mock is whatever is in slot 4, not derived from `autoPassResult`
- Could persist wrong status in DB without test catching it (audit action and DB status are independent paths)

### M4: as never cast eliminates TypeScript interface protection (ProcessingModeDialog.test.tsx lines 178-196)

- `as never` is necessary given current mock declaration style (`as const` infers narrow return type)
- Better fix: type the mock fn explicitly: `vi.fn<() => Promise<ActionResult<...>>>(...)`
- With `as never`, field renames in ActionResult type (e.g., `error` → `message`) won't be caught

### M5: withTenant call count not pinned in runRuleEngine.action.test.ts (line 158-163)

- `toHaveBeenCalledWith(expect.anything(), mockUser.tenantId)` passes if called 1+ times
- Adding a second withTenant call elsewhere would still pass
- Should be `toHaveBeenNthCalledWith(1, ...)` for the file SELECT

### M6: pipeline.store.test.ts re-run test: startedAt not verified as updated (line 152-163)

- Asserts `completedAt === undefined` after re-run — correct
- Does NOT assert `startedAt > previous startedAt` — missing coverage for startedAt re-initialization

## LOW

### L1: Rollback setCaptures: ordering and withTenant not verified (runL1ForFile.test.ts line 462)

- `toContainEqual({ status: 'failed' })` is correct but not ordered
- `withTenant` on rollback UPDATE path not separately verified (only happy-path test covers this)

### L2: Duplicate fileIds test: only 2-item pair tested (pipelineSchema.test.ts line 141)

- `[VALID_FILE_ID_1, VALID_FILE_ID_1]` — boundary is correct but mid-list duplicate not tested
- Low risk since `Set` approach is mathematically equivalent

### L3: onFailure registration not verified on processBatch createFunction (processBatch.test.ts)

- `firstArg.onFailure` never asserted as defined
- Removing `onFailure: onFailureBatchFn` from createFunction call would not be caught by any test

## Verified Correct (R3 tests that DO work)

- `startProcessing` INVALID_INPUT for duplicate fileIds — structurally correct (Zod refine fires before DB)
- `startProcessing` CONFLICT for mixed-status files — structurally correct (`foundFiles.length` check passes, notParsed filter fires)
- `startProcessing` INTERNAL_ERROR via `throwAtCallIndex = 1` — correctly targets projects UPDATE `.then` terminal
- `runL1ForFile` rollback `setCaptures.toContainEqual({ status: 'failed' })` — correct; CAS writes `l1_processing` first so array has both entries
- `scoreFile` audit literals `'score.calculated'` and `'score.auto_passed'` — correct, genuine improvement over `stringContaining`
- `processBatch` empty fileIds test — correct; `step.sendEvent` called with `[]` and `fileCount: 0` in return
- `processBatch` retries: 3 assertion — correct; `vi.clearAllMocks()` in beforeEach ensures stale calls don't pollute
- `pipeline.store` re-run clears completedAt — correct; tests the exact invariant
- `pipeline.store` setFileResult preserves status — correct; uses `.get()` directly (Map is guaranteed by source)
- `pipeline.store` failed terminal triggers completedAt — correct; verifies both-failed and mixed-terminal cases
- ModeCard Enter key — correct; `onKeyDown` fires for `<div>` with tabIndex
- ModeCard Space key — correct; `' '` produces `e.key === ' '` in userEvent v14
- processFile mode NOT forwarded to runL1ForFile — correct; `callArg.not.toHaveProperty('mode')` is precise
- ProcessingModeDialog error toast with message — correct; tests `result.error` field propagation
- ProcessingModeDialog error toast fallback — correct; tests missing error field → fallback string
- pipelineSchema invalid projectId — correct; `z.string().uuid()` rejects `'not-a-uuid'`
- pipelineSchema missing projectId — correct; `z.string().uuid()` required field, undefined → fail
