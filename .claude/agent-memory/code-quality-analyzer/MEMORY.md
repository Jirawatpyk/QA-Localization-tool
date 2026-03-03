# Code Quality Analyzer Memory

## Index of Topic Files

- `story-2-4-findings.md` — Story 2.4 Rule Engine CR R1-R3
- `story-2-5-findings.md` — Story 2.5 MQM Score CR R1-R2
- `story-2-6-findings.md` — Story 2.6 Inngest Pipeline CR R1-R3
- `story-2-7-findings.md` — Story 2.7 Batch Summary & Parity CR R1-R4
- `story-2-8-findings.md` — Story 2.8 Project Onboarding Tour CR R1
- `story-2-9-findings.md` — Story 2.9 Xbench Multi-format CR R1
- `story-2-10-findings.md` — Story 2.10 Parity Verification CR R1
- `story-3-0-findings.md` — Story 3.0 Score & Review Infrastructure CR R1-R2
- `story-3-1-findings.md` — Story 3.1 AI Cost Control CR R1 (1C/5H/8M/5L)
- `story-3-1a-findings.md` — Story 3.1a AI Usage Dashboard CR R1-R2 (R2: 0C/3H/5M/4L)
- `story-3-1b-findings.md` — Story 3.1b AI Dashboard UX Polish CR R1 (0C/2H/5M/6L)
- `story-3-0-5-findings.md` — Story 3.0.5 UX Foundation Gap Fix CR R1 (0C/1H/5M/8L)
- `story-3-2a-findings.md` — Story 3.2a AI Provider Integration CR R1 (1C/3H/5M/5L)
- `story-3-2b-findings.md` — Story 3.2b L2 Batch Processing & Pipeline Extension CR R1-R2 (R2: 0C/4H/5M/4L)
- `story-3-2b5-findings.md` — Story 3.2b5 Upload-Pipeline Wiring CR R1 (0C/3H/5M/4L)
- `story-3-2b6-findings.md` — Story 3.2b6 Orphan Wiring Cleanup CR R1-R2 (R1: 0C/4H/5M/4L)
- `story-td-sprint-findings.md` — TD Quick-Fix Sprint CR R1-R2 (R1: 0C/3H/5M/4L)
- `story-3-2b7-findings.md` — Story 3.2b7 Taxonomy Reorder UI CR R1-R2 (R2: 0C/0H/3M/5L)
- `pipeline-deep-review-findings.md` — Pipeline Deep Review (3C/8H/8M) 2026-03-03
- `cross-feature-review-findings.md` — Cross-Feature Review: parity/dashboard/project (0C/7H/9M/8L) 2026-03-03
- `story-3-2c-findings.md` — Story 3.2c L2 Results Display & Score Update CR R1-R2 (R2: 0C/5H/8M/5L)

## Recurring Anti-Patterns (check EVERY review)

### 1. withTenant() — MUST be on every DB query

- Story 1.7: raw eq() VIOLATION; Stories 2.4-2.7: all CORRECT

### 2. Audit Log Non-Fatal Pattern

- writeAuditLog: happy-path SHOULD throw; error-path MUST be try-catch+logger.error
- Stories 2.1-2.2: NOT wrapped; Stories 2.3-2.7: ALL FIXED

### 3. Bare `string` Types for Status/Severity

- FileInBatch.status, FileHistoryRow.processingStatus, XbenchFinding.severity — should be union types

### 4. Non-null Assertion on Array[0] / .returning()

- Always guard: `if (rows.length === 0) throw` before `rows[0]!`

### 5. Asymmetric Query Filters (Defense-in-Depth)

- When one query gets projectId filter, audit ALL sibling queries across all helpers

### 6. inArray() Empty Array Guard

- `inArray(col, [])` = invalid SQL; always add `if (ids.length === 0) return`

### 7. Inngest Function Requirements

- Config MUST have: retries, onFailure (in createFunction 1st arg)
- Object.assign MUST expose: handler + onFailure (for unit tests)
- MUST register in route.ts functions array

### 8. DELETE+INSERT Atomicity

- MUST use db.transaction() — Story 2.7 crossFileConsistency: FIXED in R3 (took 3 rounds)

### 9. Zod Array Uniqueness

- z.array(z.string().uuid()) does NOT deduplicate; add .refine(ids => new Set(ids).size === ids.length)

### 10. Optional Filter: Use null, NOT empty string

- `optionalId ?? ''` then filter silently matches nothing; use `fileId ? filter : noFilter`

### 11. Set Spread in Hot Loops

- `[...set].some()` inside segment/finding loops: creates array allocation per iteration
- Use `for...of` on Set directly, or cache `[...set]` once before loop

### 12. Form State Reset on Dialog Close

- Custom dialog components must reset state on re-open (useEffect on `open` prop)
- Missing reset = stale data shown to user on second open

### 19. Unsafe `as T` Cast on External Payloads (Story 3.0)

- Supabase Realtime, Inngest event.data, webhook payloads — ALWAYS validate with Zod before cast
- `payload.new.status as ScoreStatus` = runtime type mismatch if DB adds new status value
- Fix: `z.enum([...]).safeParse()` before passing to store/function

### 20. Polling Fallback Must Actually Fetch Data (Story 3.0)

- Timer-only polling = dead code — must include actual Supabase query inside poll loop
- Also: `startPolling` callback must capture `fileId` in closure/deps

### 21. Zustand Map/Set Batch Setter (Story 3.0)

- `new Map(s.findingsMap)` O(n) per single update — provide `setFindings(map)` for bulk loads
- Same applies to Set-based selectedIds if "Select All" feature added

### 22. Zod Schema Must Match TypeScript Union Types (Story 3.0 R2)

- `z.string()` for fields typed as union (`FindingStatus`, `ScoreStatus`) = validation hole
- Fix: use `z.enum([...values])` derived from same SSOT const as the TypeScript type
- Applies to: Inngest event schemas, Realtime payload validators, API input schemas

### 23. Duplicated Validation Set vs Type -- Derive from Shared Const

- `SCORE_STATUS_VALUES` in use-score-subscription manually lists same values as `ScoreStatus` type
- Drift risk: add status to type but forget Set = silent Realtime rejection
- Fix: export `as const` array from types file, derive both Set and Type from it

### 24. Duplicated Allowlist/Config Between Server and Client (Story 3.1)

- AVAILABLE_MODELS in action vs L2_MODELS/L3_MODELS in component = DRY violation
- Fix: single SSOT const importable by both server + client
- **STATUS:** FIXED in CR R1 code — shared models.ts (no server-only)

### 25. Custom Dropdown Without Click-Outside Handler (Story 3.1)

- ModelPinningSettings custom dropdown: no click-outside, no keyboard nav
- **STATUS:** FIXED in CR R1 code — useEffect click-outside handler added

### 26. Feature Infrastructure Created But Not Wired (Story 3.1 → 3.2a)

- providers.ts getModelForLayerWithFallback() exists
- **STATUS:** STILL OPEN in 3.2a — resolveHealthyModel() built + tested but NOT called from runL2ForFile
- runL2/L3 call getModelForLayerWithFallback but only use `.primary`, ignoring `.fallbacks`
- checkProviderHealth() built but not integrated into pipeline flow

### 27. UTC vs Local Time in Date Calculations (Story 3.1)

- `new Date().setDate(1).setHours(0,0,0,0)` uses local time — mismatch with timestamptz columns
- Fix: use `setUTCDate(1).setUTCHours(0,0,0,0)` for DB comparisons
- Affected: budget.ts, getProjectAiBudget.action.ts

### 28. Rate Limit as NonRetriableError (Story 3.1)

- Upstash rate limit rejection thrown as NonRetriableError = Inngest won't retry
- Rate limits are transient — should use plain Error for Inngest retry
- Affected: runL2ForFile.ts, runL3ForFile.ts

### 29. AC Compliance Gaps — Feature Specified But Not Implemented (Story 3.1a R2)

- 3 HIGH findings in R2 were all missing features explicitly specified in AC text
- Pattern: Code works correctly but AC-specified UI features are absent
- Root cause: Dev implements core logic but misses secondary AC requirements (empty state text, sortable table, summary table)
- **Check during review:** For each AC, verify EVERY "And" clause has corresponding implementation

### 30. Recharts Tooltip Formatter Overrides Line Name (Story 3.1a R2)

- `formatter={(v) => [formatted, '']}` — empty string replaces Line's `name` prop in tooltip
- In multi-series charts (L2/L3 breakdown), labels become indistinguishable
- Fix: return just formatted value (not array), or pass name through: `[formatted, name]`

### 31. Prompt-Schema Field Name Mismatch (Story 3.2a)

- Prompt OUTPUT_FORMAT tells AI to produce `suggestedFix`
- Zod schema expects `suggestion` — AI response rejected or field lost
- Fix: ONE name everywhere (suggestedFix — matches DB column + L3 schema + prompt)
- **Check during review:** For every AI structured output schema, verify field names match prompt instructions

### 32. Duplicated Provider Detection Logic (Story 3.2a)

- `deriveProvider()` in costs.ts = `getProviderForModel()` in providers.ts = prefix logic in client.ts
- Adding a new provider requires edits in 3 files
- Fix: single `deriveProviderFromModelId()` in types.ts, imported everywhere

### 33. Cross-Domain Status Value Contamination (Story 3.2b)

- `auto_passed` exists in `scores.status` but NOT in `files.status` (`DbFileStatus`)
- processFile batch check used `f.status === 'auto_passed'` — always false, dead code
- Root cause: ATDD DA-1 recommended adding it without verifying domain
- **Check during review:** When comparing `table.status` to literal, verify literal is in that table's status domain
- Lesson: Cast Drizzle varchar selects to their union type — compiler catches invalid comparisons

### 34. Inline Result Type Instead of ActionResult<T> (TD Sprint)

- `updateBudgetAlertThreshold` + `updateModelPinning` define inline `UpdateResult` type
- Project standard: ALL Server Actions return `ActionResult<T>`
- Fix: `Promise<ActionResult<undefined>>` + `return { success: true, data: undefined }`
- **Check during review:** Every server action file must import + use `ActionResult<T>` from `@/types/actionResult`

### 35. Unused Imports After Refactor (TD Sprint)

- After extracting shared helper (buildSegmentRecordFromParsed), 5 files retained unused `ParsedSegment` import
- Pattern: refactor extracts logic into helper but leaves old imports behind
- **Check during review:** After any extraction refactor, grep for the old type/function name across all call sites

### 36. Bare `z.string()` in Model/Enum Schemas (TD Sprint)

- `model: z.string().nullable()` accepts empty string, whitespace, arbitrarily long strings
- Even with defense-in-depth allowlist check downstream, Zod should be first line of defense
- Fix: `.min(1).max(100).trim()` for model IDs, or better: `z.enum([...models]).nullable()`
- **Check during review:** Every `z.string()` for a bounded-domain field should have `.min(1)` at minimum

### 37. Misleading Constant Names (TD Sprint)

- `PIPELINE_LAYERS = ['L2', 'L3']` implies all layers but excludes L1 (by design — L1 has no AI model)
- Fix: prefix with domain: `AI_PIPELINE_LAYERS` or `MODEL_PINNABLE_LAYERS`
- **Check during review:** Constants named `ALL_*` or plural noun should be truly exhaustive

### 38. Missing onDragCancel in @dnd-kit DndContext (Story 3.2b7)

> NOTE: Anti-patterns 38+ near end of file may be truncated from system prompt (200-line limit).
> See `pipeline-deep-review-findings.md` for 3C/8H/8M findings from 2026-03-03 deep review.
> Key new patterns: Invalid finding status 'open', L3 inline prompt not using shared builder,
> fallback chain unused, L3 missing error chunk logging, store type mismatch with DbFileStatus.

- DndContext has onDragStart + onDragEnd but no onDragCancel
- Escape key fires onDragCancel (not onDragEnd) -- activeDragId state not reset
- DragOverlay stays visible until next render
- Fix: add `onDragCancel={() => setActiveDragId(null)}`
- **Check during review:** Every DndContext with DragOverlay must have onDragCancel handler

### 39. Vacuous Conditional Test Assertions (Story 3.2b7 R1-R2)

- `if (mock.calls.length > 0) { expect(...) }` -- assertions never execute if lib can't fire events in jsdom
- Pattern recurs with @dnd-kit (getBoundingClientRect = 0 in jsdom)
- Fix: extract pure function and test directly, or use `it.skipIf` with explicit reason
- **Check during review:** Search for `if.*mock.*calls.*length.*>.*0` in test files

## CAS Guard Pattern (ESTABLISHED)

- All status-transition actions: atomic `UPDATE WHERE status='expected' RETURNING`
- Confirmed in: parseFile, runRuleEngine, runL1ForFile, runL2ForFile, runL3ForFile

## Cross-Story Patterns

- Path traversal: sanitizeFileName needs fallback for empty/dot results
- FormData type safety: `as File[]` unsafe, need instanceof guard
- NFKC: NOT before Intl.Segmenter (Thai sara am); YES before text comparison
- TOCTOU in Server Actions: SELECT+validate+dispatch NOT atomic; use CAS UPDATE

## Story 2.6 Inngest Key Patterns

- Shared helpers: `runL1ForFile.ts`, `scoreFile.ts` — NO 'use server', importable from Inngest
- Object.assign testability pattern for Inngest functions
- processBatch fan-out: `step.sendEvent(id, events[])` batch form
- processFilePipeline: concurrency key on projectId limit 1
- Event types canonical at `@/types/pipeline`, re-exported via `inngest/types.ts`
- client.ts Events type imports from canonical source

## Story 2.7 Key Patterns

- R1: 31 findings (6C/9H/11M/5L) — all R1 Critical FIXED in R2
- R2: 15 findings (2C/4H/6M/3L) — C1 (fileId??''), C2 (as string nullable) FIXED in R3
- R3: 8 findings (1C/3H/3M/1L) — all R3 Critical+High FIXED in R4 code
- R4: 7 findings (0C/2H/3M/2L) — all H+M fixed in final commit
- STILL OPEN after R4: getFileHistory fetch-all (tech debt, 10K cap mitigated)
- → All security findings (Issues 1-7) verified RESOLVED on 2026-02-25

## Missing DB Constraints (accumulated — last verified 2026-02-26)

- ✅ RESOLVED: UNIQUE on segments(file_id, segment_number) — added to Drizzle schema + migration 0007 applied
- ✅ RESOLVED: Composite index `idx_files_tenant_project(tenant_id, project_id)` added in TD Sprint — note: column order (tenant, project) may not be optimal for project-first queries
- ℹ️ BY DESIGN: scores.fileId is nullable (project-level aggregates) — UNIQUE not appropriate
- ✅ RESOLVED: idx_findings_file_layer — added to Drizzle schema + migration 0007 applied
- ⚠️ OPEN: segmentId NOT persisted to DB (Stories 2.2-2.3, design decision needed)
- → Tracked in: `_bmad-output/implementation-artifacts/tech-debt-tracker.md`

## PROCESSING_MODES SSOT

- Canonical: `@/types/pipeline` PROCESSING_MODES const
- ✅ RESOLVED (2026-02-25): All sites now import from `@/types/pipeline` — projectSchemas.ts, pipelineSchema.ts, db/validation/index.ts

### 13. useRef State Not Reset on Prop-Driven Re-render

- `dismissedRef` in tour components stays `true` after dismiss — `router.refresh()` re-renders with new props but does NOT unmount, so ref persists
- Affects: ProjectTour.tsx, OnboardingTour.tsx — restart from HelpMenu fails silently
- Fix: reset ref when metadata indicates tour should re-trigger (e.g., `project_tour_completed` becomes null)

### 14. void Promise Without .catch() -- Silent Swallow

- `void asyncFn()` discards both return value AND rejection — no error feedback
- Use `.catch(() => { /* non-critical */ })` at minimum for diagnostics

### 15. XbenchFinding Type Fragmentation (Story 2.9)

- 3 separate `XbenchFinding` types with DIFFERENT schemas: xbenchReportParser.ts, parityComparator.ts, types.ts
- types.ts version uses `file`/`segment(string)`/`checkType` vs others use `fileName`/`segmentNumber(number)`/`category`
- Tech debt: consolidate to single SSOT in xbenchReportParser.ts, others import

### 16. Sentinel State Without Recovery (Story 2.9)

- `currentCategory = 'LI'` sentinel in parseSectioned: line 140 returns BEFORE section marker detection
- If LI section is NOT last, all subsequent findings are silently lost
- Fix: check LI only on file-reference rows, let section markers always update currentCategory
- **STATUS:** FIXED in pre-CR (guard moved to file-ref branch only, section markers always update)

### 17. Inconsistent String Matching Strategy in Parsers (Story 2.9)

- parseSectioned uses MIXED matching: `.includes()` for some, `===` strict equality for others, `.startsWith()` for yet others
- Strict `===` breaks if Xbench appends metadata like "Tag Mismatch (3 entries)"
- Fix: use `.startsWith()` consistently for all section markers

### 18. Hardcoded Category List vs Mapper Coverage Gap

- parseSectioned recognizes 6 categories but xbenchCategoryMapper supports 12+
- Unrecognized categories (Double Space, Untranslated, Spell Check, etc.) cause findings to inherit previous section's category
- Fix: catch-all approach (any non-file-ref, non-LI row becomes currentCategory) OR at minimum logger.warn

## Test Patterns

- ✅ RESOLVED: Drizzle mock extracted to shared `createDrizzleMock()` in `src/test/drizzleMock.ts` — 15 test files migrated (2026-02-26)
- Usage: `const { dbState, dbMockModule } = vi.hoisted(() => createDrizzleMock())` then `vi.mock('@/db/client', () => dbMockModule)`
- Features: `returnValues[callIndex]`, `valuesCaptures`, `setCaptures`, `throwAtCallIndex`, `transaction` support
- `vi.fn((..._args: unknown[]) => ...)` for mocks whose .calls are accessed

## Story 2.10 Parity Verification CR R1 (2026-02-26)

- R1: 2C/6H/5S — C1: invalid UUID in buildPerfSegments, C2: dead import parseXbenchReport in tier2 test
- Integration test mock block duplicated 4x — candidate for shared setup file
- `toSegmentRecord()` duplicated 3x across integration tests — extract to factories.ts
- `computePerFindingParity()` called 3x with same data — compute once in beforeAll
- XbenchFinding type fragmentation continues (Anti-pattern #15) — now 4 definitions (added golden-corpus-parity.test.ts)
- `process.env` direct access in test files: decided EXEMPT for test-time config (not runtime env)
- `buildPerfSegments` word count uses space-split (inaccurate for Thai/CJK templates)
