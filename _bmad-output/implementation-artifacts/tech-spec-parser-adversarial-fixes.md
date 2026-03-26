---
title: 'Parser Adversarial Fixes (Quick + Medium)'
type: 'bugfix'
created: '2026-03-26'
status: 'ready-for-dev'
baseline_commit: '6006af7'
context: ['CLAUDE.md']
---

# Parser Adversarial Fixes (Quick + Medium)

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Adversarial review found 13 issues in Parser. 7 are fixable now: no segment count limit (OOM risk), file status atomicity gap (same as TD-AI-005 L1 bug), UTF-16 encoding detection, upload hash race, silent group drop, missing parse duration log, column name length validation.

**Approach:** Fix all 7 directly. Log remaining 6 as tech debt.

## Boundaries & Constraints

**Always:** withTenant() on every query. Existing tests green. CLAUDE.md guardrails.

**Ask First:** Changes to upload route response format.

**Never:** Change XML parser library. Add new file type support. Modify storage paths.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 50K segments XLIFF | 15MB file with 50K trans-units | Parse succeeds (under MAX_SEGMENT_COUNT) | N/A |
| 100K+ segments | Crafted XLIFF with 100K+ 1-char segments | Rejected: SEGMENT_LIMIT_EXCEEDED | markFileFailed() |
| UTF-16 LE with BOM | SDLXLIFF saved as UTF-16 LE | BOM detected → decode as UTF-16 | N/A |
| UTF-16 without BOM | UTF-16 file no BOM | Fallback to UTF-8 (existing behavior) + warning log | N/A |
| Upload same hash during parse | File A parsing, user uploads file B same hash | Upload blocked: file in non-terminal state | Return CONFLICT |
| Group depth 51 | SDLXLIFF with 51 nested groups | Parse succeeds with warning in result | Warning logged |
| Column name 1MB | Excel with 1MB column header | Rejected by .max(200) validation | INVALID_INPUT |

</frozen-after-approval>

## Code Map

- `src/features/parser/actions/parseFile.action.ts` -- status atomicity + segment limit + duration log
- `src/features/parser/sdlxliffParser.ts` -- UTF-16 detection + segment count guard + group depth warning
- `src/features/parser/constants.ts` -- MAX_SEGMENT_COUNT constant
- `src/features/parser/validation/excelMappingSchema.ts` -- column name max length
- `src/app/api/upload/route.ts` -- hash race condition guard
- `_bmad-output/implementation-artifacts/tech-debt-tracker.md` -- 6 TD entries

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/parser/constants.ts` -- Add `MAX_SEGMENT_COUNT = 50_000`
- [ ] `src/features/parser/sdlxliffParser.ts` -- Add segment count check after collecting all segments. If > MAX_SEGMENT_COUNT → return error. Add warning to result when group depth reaches MAX_GROUP_DEPTH. Add UTF-16 BOM detection before XML parse: check first 2-3 bytes for BOM, decode accordingly.
- [ ] `src/features/parser/actions/parseFile.action.ts` -- Move file status update (`parsed`) INSIDE batchInsertSegments transaction (TD-AI-005 parity). Add `performance.now()` duration tracking + log. Add segment count guard using MAX_SEGMENT_COUNT.
- [ ] `src/features/parser/validation/excelMappingSchema.ts` -- Add `.max(200)` to sourceColumn/targetColumn string fields
- [ ] `src/app/api/upload/route.ts` -- Before resetting existing file to 'uploaded', check current status is terminal ('parsed', 'l1_completed', etc.). If file is in active state ('parsing', 'l1_processing', etc.) → return CONFLICT.
- [ ] `src/features/parser/excelParser.ts` -- Add segment count check in eachRow loop. Early-break if > MAX_SEGMENT_COUNT.
- [ ] `_bmad-output/implementation-artifacts/tech-debt-tracker.md` -- Log 6 remaining findings as TD entries

**Acceptance Criteria:**
- Given XLIFF with 100K+ segments, when parsed, then rejected with SEGMENT_LIMIT_EXCEEDED before DB insert
- Given file status update, when batchInsertSegments transaction completes, then status='parsed' is inside same transaction
- Given UTF-16 LE file with BOM, when parsed, then text decoded correctly (not garbled)
- Given upload of file with same hash while original is parsing, when upload completes, then returns CONFLICT (not reset)
- Given SDLXLIFF with group depth 51, when parsed, then warning logged and segments from depth ≤50 included

## Verification

**Commands:**
- `npm run type-check` -- expected: 0 new errors
- `npx vitest run src/features/parser/` -- expected: all pass
