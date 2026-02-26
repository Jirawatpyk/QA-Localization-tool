# Anti-Pattern Detector — Persistent Memory

## Recurring Violations by Category

### withTenant() Missing (MEDIUM — Architectural Rule)

- **Pattern**: Developers use `eq(table.tenantId, tenantId)` directly instead of `withTenant()`.
- **Found in Stories 1.1–1.7 baseline scan**:
  - `updateUserRole.action.ts` lines 47, 60, 73: `eq(userRoles.tenantId, ...)` — 3 occurrences
  - `requireRole.ts` line 46: `eq(userRoles.tenantId, ...)` — infrastructure file
  - `projects/page.tsx` line 40: `eq(files.tenantId, ...)` inside leftJoin ON clause
  - `admin/page.tsx` line 34: `eq(userRoles.tenantId, ...)` inside leftJoin ON clause
- **Note**: `withTenant()` is a thin wrapper around `eq()`, so functionally identical. The JOIN ON clause usage is an edge case — it's not a WHERE clause but a JOIN condition. Debatable whether `withTenant()` is required in JOIN ON clauses.
- **Fix pattern**: Replace `eq(table.tenantId, tenantId)` with `withTenant(table.tenantId, tenantId)` and ensure import is present.

### Inline Tailwind Colors (MEDIUM)

- **Pattern**: Developers use Tailwind palette classes (amber-_, red-_, green-_, yellow-_) or hardcoded hex colors.
- **Found in baseline scan**:
  - `GlossaryImportDialog.tsx` lines 261, 263, 266: `text-green-600`, `text-yellow-600`, `text-red-600`
  - `OnboardingTour.tsx` line 65: `overlayColor: 'var(--color-overlay, #1e293b)'` — uses CSS variable WITH fallback hex; borderline case
- **Note**: `DashboardView.tsx` was CLEAN after Story 1.7 fixes (previously had amber colors). `OnboardingTour.tsx` now uses `var(--color-overlay, #1e293b)` which references the design token — the `#1e293b` is only a fallback, not primary usage.

### console.log in Application Code (HIGH)

- **Pattern**: Error boundaries use console.error directly (cannot easily use pino in client components).
- **Confirmed violations**:
  - `src/app/(app)/error.tsx` line 14: `console.error('App error boundary caught:', error)`
  - `src/app/error.tsx` line 14: `console.error('Root error boundary caught:', error)`
- **Note**: These are `'use client'` error boundary components — pino is server-only and cannot be imported here. This is a fundamental limitation. Developers should use `logger-edge.ts` or a client-safe logger if available.

### process.env Direct Access (HIGH)

- **Confirmed violations**:
  - `src/lib/logger.ts` line 6: `process.env.NODE_ENV` — used in logging configuration, not sensitive env var
  - `src/lib/supabase/client.ts` lines 9–10: `process.env.NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` — documented exception: `env.ts` is `server-only` so cannot be used in browser
  - `src/proxy.ts` lines 53, 64–65: `process.env.NODE_ENV` and `NEXT_PUBLIC_SUPABASE_*` — documented exception: proxy runs before app init
- **Note**: All three have explicit code comments explaining why `env.ts` cannot be used. These are DOCUMENTED EXCEPTIONS, not careless violations.

### Relative Imports Going Up One Level (LOW)

- **Pattern**: `from '../types'` in feature action files — going up one level from `actions/` to feature root
- **Found**:
  - `taxonomy/actions/createMapping.action.ts`: `from '../types'`
  - `taxonomy/actions/getTaxonomyMappings.action.ts`: `from '../types'`
  - `taxonomy/actions/updateMapping.action.ts`: `from '../types'`
- **Note**: Rule says "no paths going up more than one level". Going up exactly one level (`../`) within the same feature module is borderline — CLAUDE.md says "no paths going up more than one level". These go up only one level. Flagged as LOW.

## Clean Patterns Confirmed in Baseline Scan (Stories 1.1–1.7)

- All `page.tsx` files: NO `"use client"` — correct Server Component boundary
- No `export default` in feature modules (only in `page.tsx`, `layout.tsx`, `error.tsx` as permitted)
- No `any` types found
- No TypeScript `enum` — uses union types and `z.enum()` correctly
- No `service_role` key in client code (only in `admin.ts` server factory)
- No hardcoded `tenant_id` UUIDs
- No inline Supabase client creation outside the 3 factory files
- No `step.run()` Inngest code yet (not implemented)
- No snapshot tests
- No barrel exports in features EXCEPT `glossary/parsers/index.ts` (a dispatcher function, not a re-export barrel)
- Supabase client factories used correctly everywhere
- Zod schemas correctly named with `Schema` suffix
- All DB queries go through Drizzle ORM (sql`` template literals are Drizzle-native, not raw SQL)
- Constants follow UPPER_SNAKE_CASE (`BATCH_SIZE`, `PAGE_SIZE`, `NAV_ITEMS` etc.)
- `muted-foreground` is a valid shadcn/ui token (defined via `--color-muted-foreground` in globals.css)
- GoogleLogo.tsx hex colors in SVG `fill=` attrs are SVG attributes, not Tailwind classes — acceptable

## Story 2.1 Scan Summary (2026-02-23, re-verified 2026-02-23)

- Files scanned: 11 (upload feature core: route.ts, 3 actions, 1 hook, 5 components, page.tsx)
- **MEDIUM violations (2):**
  - `FileSizeWarning.tsx` line 13: `border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300` — inline Tailwind palette colors; should use design tokens
  - `UploadProgressList.tsx` line 59: `text-emerald-600` — inline Tailwind palette color; should use design token
- **LOW violations (2):**
  - `route.ts` line 99: `const results = []` — implicit `any[]`; should be typed as `UploadFileResult[]`
  - `useFileUpload.ts` line 314: `export { createBatch }` re-exports server action from hook file — architectural smell (not a barrel index.ts violation but unusual coupling pattern)
- **Relative imports (LOW-borderline):**
  - `checkDuplicate.action.ts` lines 14–15: `from '../types'`, `from '../validation/uploadSchemas'` — one level up within feature module
  - `createBatch.action.ts` lines 11–12: same pattern
- **All other checks CLEAN** — no `export default` in feature modules, no `any`, no raw SQL, no console.log, no enum, no service_role, no hardcoded tenantId, no inline Supabase client creation, no try-catch in step.run(), no snapshot tests, no process.env, no "use client" on page.tsx, withTenant() used correctly in WHERE + JOIN ON clauses, md: breakpoint is standard Tailwind

## Story 2.2 Scan Summary (2026-02-23)

- Files scanned: 8 (parser feature: types.ts, constants.ts, inlineTagExtractor.ts, wordCounter.ts, sdlxliffParser.ts, parseFile.action.ts, segments.ts, factories.ts)
- **MEDIUM violations (3):**
  - `factories.ts` lines 15–17, 33–34, 46–48, 60: `tenantId: 'test-tenant'`, `projectId: 'test-project'`, `sessionId: 'test-session'` — 4 factory functions with hardcoded non-UUID tenant/project/session IDs; use `faker.string.uuid()` instead
  - `segments.ts` lines 8–14: local `InlineTag` type is exact duplicate of `types.ts` — import from `@/features/parser/types` instead (DRY violation)
  - `parseFile.action.ts` lines 16–18: relative imports `from '../constants'`, `from '../sdlxliffParser'`, `from '../types'` — should use `@/features/parser/` alias
- **LOW violations (2):**
  - `parseFile.action.ts` line 190: `db.insert(segments).values(values)` has no WHERE clause (correct for INSERT) but no explicit `withTenant()` guard — tenantId comes directly from currentUser.tenantId so risk is low; comment explains rationale
  - `inlineTagExtractor.ts` line 206: `return attrs as Record<string, string>` — unsafe cast; runtime guard exists but inner values may not be string; prefer `Record<string, unknown>`
- **All other checks CLEAN** — no `export default`, no `any`, no `enum`, no raw SQL, no `console.log`, no `process.env`, no inline Supabase client, no `service_role`, no `step.run()`, no barrel exports, no snapshot tests, no "use client" on page, `withTenant()` used on all SELECT/UPDATE/DELETE correctly

## Recurring Pattern: Hardcoded Test Identifiers in factories.ts

- **Pattern**: `buildFinding`, `buildReviewSession`, `buildPipelineRun`, `buildNotification` all use string literals `'test-tenant'` / `'test-project'` / `'test-session'` as default values.
- **Risk**: These fail Zod v4 UUID validation (per MEMORY.md note) and violate the "no hardcoded tenant_id" rule even in test fixtures.
- **Fix**: Use `faker.string.uuid()` for all ID fields. Tests needing stable values can pass overrides.
- **Appeared in**: Story 2.2 scan (factories.ts was present from earlier stories — pre-existing violation not caught in Story 2.1 scan scope).

## Story 2.3 Scan Summary (2026-02-23)

- Files scanned: 9 (parser/types.ts, parser/constants.ts, parser/validation/excelMappingSchema.ts, parser/excelParser.ts, parser/actions/previewExcelColumns.action.ts, parser/actions/parseFile.action.ts, upload/components/ColumnMappingDialog.tsx, upload/components/UploadPageClient.tsx, test/factories.ts)
- **HIGH violations (1):**
  - `UploadPageClient.tsx` lines 6–8: `from '../actions/createBatch.action'`, `from '../hooks/useFileUpload'`, `from '../utils/fileType'` — relative imports going up one level inside upload feature; CLAUDE.md mandates `@/` alias always
- **MEDIUM violations (3):**
  - `excelParser.ts` line 39 + `previewExcelColumns.action.ts` line 88: `as never` type assertion on `workbook.xlsx.load()` call — equivalent to `any` suppression; should use `as Buffer`
  - `factories.ts` lines 126–169: `buildExcelColumnMapping()` and `buildExcelPreview()` missing explicit return types — other factories in same file have explicit return types; should be typed `ExcelColumnMapping` and `ExcelPreview`
- **LOW violations (2):**
  - `parseFile.action.ts` lines 232–250: try-catch around `batchInsertSegments()` is safe as Server Action now, but will need refactor if ever moved into Inngest `step.run()`
  - `parseFile.action.ts` lines 322–346: `markFileFailed()` swallows catch blocks with no logger call — should use `logger.warn()` for production observability
- **Regression from 2.2 FIXED:** `factories.ts` no longer has `'test-tenant'` / `'test-project'` hardcoded strings — all IDs now use `faker.string.uuid()`
- **All other checks CLEAN** — no `export default`, no `any`, no `enum`, no raw SQL, no `console.log`, no `process.env`, no service_role, no hardcoded tenantId, no inline Supabase client, no snapshot tests, no "use client" on page, `withTenant()` used correctly on all queries, design tokens used correctly in ColumnMappingDialog.tsx

## Recurring Pattern: ExcelJS Type Assertion — ✅ RESOLVED (2026-02-26)

- **Pattern**: ExcelJS `workbook.xlsx.load()` has a type mismatch — ExcelJS declares its own `Buffer` interface that conflicts with Node.js `Buffer<ArrayBufferLike>`.
- **Files affected**: `excelParser.ts:39`, `xbenchReportParser.ts:34` (previewExcelColumns.action.ts does NOT have this — tracker was incorrect)
- **Fix applied**: `@ts-expect-error` comment explaining the ExcelJS type mismatch — self-documenting, auto-flags if ExcelJS fixes types upstream. This is the correct pattern for library type mismatches (better than `as never`, `as any`, or `as Buffer` which all fail).

## Recurring Pattern: Missing Return Types on Factory Functions (MEDIUM)

- **Pattern**: New factory functions added to `factories.ts` without explicit return type annotation.
- **Story 2.3 examples**: `buildExcelColumnMapping()` and `buildExcelPreview()` — no return type declared.
- **Contrast**: Older factories (`buildFinding(): Finding`, `buildSegment(): SegmentRecord`) all have explicit types.
- **Risk**: Without return type, TypeScript won't catch when the factory object drifts from the real type it's supposed to represent.
- **Fix**: Import the real type (e.g., `ExcelColumnMapping` from Zod schema, `ExcelPreview` from action file) and annotate the return.

## Story 2.3 CR Round 1 Scan Summary (2026-02-23)

- Files scanned: 3 (parseFile.action.ts, previewExcelColumns.action.ts, ColumnMappingDialog.tsx)
- **MEDIUM violations (1):**
  - `previewExcelColumns.action.ts` line 92: `as never` on `workbook.xlsx.load()` — STILL NOT FIXED from pre-CR scan; should be `as Buffer`
- **LOW violations (2):**
  - `parseFile.action.ts` lines 329–331, 346–348: `markFileFailed()` swallows both catch blocks with no logger call — same finding as pre-CR scan, not addressed in CR Round 1
  - `parseFile.action.ts` lines 46, `previewExcelColumns.action.ts` line 38: `let currentUser` without type annotation — borderline; TypeScript narrows correctly via control flow but explicit type improves clarity
- **ColumnMappingDialog.tsx CLEAN** — all Tailwind tokens verified against tokens.css and globals.css: `text-destructive` (globals.css:31), `bg-surface-secondary` (tokens.css:10), `text-text-muted` (tokens.css:16), `text-success` (tokens.css:19), `border-border` (globals.css:30)
- **Key observation**: CR Round 1 did not address `as never` in previewExcelColumns.action.ts or the swallowed logger calls in markFileFailed — these carry over to CR Round 2

## Story 2.4 Scan Summary (2026-02-24)

- Files scanned: 28 (15 source + 13 test)
- **MEDIUM violations (4):**
  - `thaiRules.ts` and `cjkRules.ts` placed at `src/features/pipeline/engine/language/` — CLAUDE.md specifies these belong in `src/lib/language/` for sharing across features
  - `ruleEngine.test.ts` lines 163–166: hardcoded non-UUID IDs `'rule-1'`, `'p1'`, `'t1'`, `'u1'` in SuppressionRuleRecord fixture
  - `customRuleChecks.test.ts` lines 17–28: `makeCustomRule()` helper uses non-UUID `'rule-1'`, `'project-1'`, `'tenant-1'`, `'user-1'`
  - `glossaryChecks.test.ts` lines 119–135: `buildSegment()` called with non-UUID `'seg-123'`, `'proj-456'`, `'tenant-789'`
- **LOW violations (5):**
  - `numberChecks.ts` line 1, `formattingChecks.ts` line 2, `consistencyChecks.ts` lines 1–2: relative imports `../language/thaiRules` and `../language/cjkRules` — should use `@/lib/language/` after moving files
  - `runRuleEngine.action.ts` lines 166–169: final status UPDATE to `l1_completed` missing `withTenant()` guard — risk is low (fileId validated by CAS), but rule requires it on all queries
  - `tagChecks.ts` line 27: `as InlineTagsData` type cast without Zod validation — low risk because parser guarantees shape
  - `glossaryChecks.test.ts` line 29: `as unknown as GlossaryCheckFn` double cast — acceptable in test files
- **All other checks CLEAN** — no `export default`, no `any`, no enum, no raw SQL, no console.log, no process.env, no service_role, no "use client", no inline Supabase client, no step.run() with try-catch, no snapshot tests, no Tailwind (pure TypeScript engine), withTenant() correct on all 3 main queries in action

## Recurring Pattern: withTenant() Missing on Final UPDATE in Action Files (LOW)

- **Pattern**: CAS guard UPDATE has `withTenant()` correctly. But the second status-update UPDATE at end of success path sometimes omits `withTenant()`.
- **Found in Story 2.4**: `runRuleEngine.action.ts` line 169 — `eq(files.id, input.fileId)` only, missing `withTenant()`.
- **Previously found**: Story 2.3 `parseFile.action.ts` `markFileFailed()` had similar pattern.
- **Risk**: Low because fileId is validated upstream, but violates the "every query must use withTenant()" rule.
- **Fix pattern**: Wrap final UPDATE .where() with `and(withTenant(table.tenantId, user.tenantId), eq(table.id, id))`.

## Story 2.5 Scan Summary (2026-02-24)

- Files scanned: 7 (scoring feature: types.ts, constants.ts, validation/scoreSchema.ts, mqmCalculator.ts, penaltyWeightLoader.ts, autoPassChecker.ts, actions/calculateScore.action.ts)
- **MEDIUM violations (2):**
  - `penaltyWeightLoader.ts` line 30: `eq(severityConfigs.tenantId, tenantId)` — uses raw `eq()` instead of `withTenant()`. This is intentional (query fetches BOTH tenant rows AND system-default rows where tenantId IS NULL), so `withTenant()` cannot be used here — but the pattern is still worth flagging for review.
  - `calculateScore.action.ts` line 118: `findingRows as import('../types').ContributingFinding[]` — inline dynamic `import()` type expression inside a type cast; should import `ContributingFinding` at the top of the file with a regular named import instead.
- **LOW violations (5):**
  - `calculateScore.action.ts` lines 19–23: 5 relative imports (`from '../autoPassChecker'`, `from '../constants'`, `from '../mqmCalculator'`, `from '../penaltyWeightLoader'`, `from '../validation/scoreSchema'`) — one level up within feature module; same pattern as Story 2.1–2.4. Flagged LOW per established precedent.
  - `constants.ts` line 1: `from './types'` — same-directory relative import; technically fine (no `..`), but inconsistent with `@/` alias mandate.
  - `mqmCalculator.ts` lines 1–2: `from './constants'`, `from './types'` — same-directory relative imports, same observation.
  - `autoPassChecker.ts` line 10: `from './constants'`, `from './types'` — same-directory relative imports.
- **All other checks CLEAN** — no `export default`, no `any`, no `enum`, no raw SQL, no `console.log`, no `process.env`, no `service_role`, no hardcoded tenantId UUIDs, no inline Supabase client creation, no snapshot tests, no "use client", `withTenant()` used correctly on all queries in autoPassChecker.ts and calculateScore.action.ts, `sql\`` template is Drizzle-native (NOT raw SQL), Zod schema named correctly (`calculateScoreSchema`), constants follow `UPPER_SNAKE_CASE`.
- **Notable clean patterns**: audit log write is correctly wrapped in non-fatal try-catch, graduation notification is non-fatal, transaction uses delete+insert for idempotency — all correct per Story 2.4 CR learnings.

## Recurring Pattern: Inline Dynamic Import() in Type Cast (MEDIUM)

- **Pattern**: `findingRows as import('../types').ContributingFinding[]` — using inline dynamic import expression to reference a type inside a cast, instead of adding a top-level `import type` statement.
- **Found in Story 2.5**: `calculateScore.action.ts:118`
- **Risk**: Obscures the dependency, harder to trace/refactor, and bypasses import organization rules.
- **Fix**: Add `import type { ContributingFinding } from '../types'` at top of file and use `findingRows as ContributingFinding[]`.

## Recurring Pattern: penaltyWeightLoader withTenant() Exception

- **Pattern**: `penaltyWeightLoader.ts` uses `eq(severityConfigs.tenantId, tenantId)` inside `or(eq(...), isNull(...))` — cannot use `withTenant()` because the query intentionally fetches rows WHERE tenantId IS NULL (system defaults). This is a documented architectural exception.
- **Rule**: CLAUDE.md says "every query must use withTenant()". The OR condition here logically extends beyond what withTenant() supports.
- **Decision**: Flag MEDIUM but note as documented exception. The correct fix would be to add a code comment explaining why withTenant() cannot be used here.

## Story 2.7 Scan Summary (2026-02-25)

- Files scanned: 26 (batch feature: 10 + parity feature: 9 + pipeline: 2 + pages: 4 + nav: 1)
- **CRITICAL violations (0)**
- **HIGH violations (1):**
  - `xbenchReportParser.ts:23`: ✅ RESOLVED — `buffer as any` replaced with `@ts-expect-error` comment (2026-02-26)
- **MEDIUM violations (5):**
  - `generateParityReport.action.ts:25-27`: `bothFound/toolOnly/xbenchOnly: unknown[]` — overly broad return type; should use `MatchedFinding[] / ToolFinding[] / XbenchFinding[]` imported from parityComparator
  - `reportMissingCheck.action.ts:52`: `withTenant(missingCheckReports.tenantId, user.tenantId)` called as standalone expression — return value discarded; does not guard the INSERT; tenantId passed directly into `.values({ tenantId: user.tenantId })` instead
  - `ParityResultsTable.tsx:80`: `colorClass="text-info"` passed as prop and applied to section/h3 — `text-info` maps to `--color-info` in tokens.css via Tailwind v4 `@theme` auto-utility; borderline (token exists but not listed in shadcn/ui semantic tokens; flag MEDIUM pending CR)
  - `ReportMissingCheckDialog.tsx:6`: `from '../actions/reportMissingCheck.action'` — relative import crossing directory boundary; should use `@/features/parity/actions/reportMissingCheck.action`
  - `FileHistoryTable.tsx` (implicit): `projectId` prop destructured in type but not used in component body (line 46 destructures it but it's never referenced inside)
- **LOW violations (3):**
  - `generateParityReport.action.ts:66-71`: multiple `as string` casts on Drizzle column values (`f.category as string`, `f.severity as string`, `f.fileId as string`, `f.segmentId as string`) — should use proper Drizzle inferred types or Zod-validated schema types
  - `batchSchemas.ts`: Zod schema named `getBatchSummarySchema` — correct; `getFileHistorySchema` — correct. CLEAN.
  - `crossFileConsistency.ts:67-83`: `seg.sourceText as string`, `seg.wordCount as number`, `seg.fileId as string`, `seg.targetText as string`, `seg.id as string` — multiple `as string/number` casts; prefer Drizzle inferred types
- **All other checks CLEAN** — no `export default` in feature modules, no TypeScript `enum`, no raw SQL, no console.log, no process.env, no service_role, no hardcoded tenantId UUIDs, no inline Supabase client creation, no try-catch inside step.run() in batchComplete.ts, no snapshot tests, no "use client" on page.tsx files (all 4 pages are Server Components), md: breakpoint in BatchSummaryView.tsx is standard Tailwind (not arbitrary), text-success/text-warning/text-info/text-destructive are valid tokens.css-derived utility classes in Tailwind v4

## Story 2.8 Scan Summary (2026-02-25)

- Files scanned: 8 (ProjectTour.tsx, HelpMenu.tsx, ProjectSubNav.tsx, layout.tsx, updateTourState.action.ts + 3 test files)
- **MEDIUM violations (1):**
  - `ProjectTour.tsx` line 66: `overlayColor: 'var(--color-overlay, #1e293b)'` — same borderline pattern as OnboardingTour.tsx (MEMORY line 22); `#1e293b` is a CSS fallback for `var(--color-overlay)` which IS defined in tokens.css:28. Flagged MEDIUM with note.
- **LOW violations (2):**
  - `e2e/project-tour.spec.ts` line 20: `process.env.E2E_TEST_PASSWORD` — direct `process.env` access in E2E spec file; however E2E files are Playwright configs, not app code. Borderline — flag LOW.
  - `e2e/project-tour.spec.ts` lines 21-23: `process.env.E2E_PROJECT_TOUR_EMAIL` and `E2E_PROJECT_TOUR_RETURNING_EMAIL` — same pattern; E2E test files are not subject to `@/lib/env` rule (env.ts is server-only, Playwright runs in Node.js outside Next.js context). Borderline LOW.
- **All other checks CLEAN** — no `export default` in feature modules (layout.tsx uses `export default` correctly per Next.js convention), no `any`, no `enum`, no raw SQL, no `console.log`, no TypeScript enum, no service_role, no hardcoded tenantId, no inline Supabase client, no snapshot tests (all behavioral assertions), no "use client" on layout.tsx (layout uses it correctly — layout.tsx is Server Component), withTenant() used correctly in updateTourState.action.ts line 61, Zod schemas named correctly (tourIdSchema, updateTourStateSchema), constants UPPER_SNAKE_CASE (PROJECT_TOUR_STEPS, LAST_STEP_INDEX, TABS), all design tokens verified against tokens.css/globals.css.
- **CLEAN patterns noted**: UserMetadata interface (no `I` prefix), TourId/TourAction union types (not TypeScript enum), updateTourState.action.ts naming correct, test files use behavioral assertions (regex match, toEqual, toBe, toBeNull) — NO toMatchSnapshot().

## Story 2.7 Key Patterns

### Detached withTenant() Call (MEDIUM — ✅ RESOLVED 2026-02-25)

- **Pattern**: `withTenant(table.tenantId, tenantId)` called as a standalone expression (result discarded).
- **Was in**: `reportMissingCheck.action.ts:52`
- **Fix applied**: Standalone call removed; proper project ownership SELECT with withTenant() added instead.

## Story 2.6 Scan Summary (2026-02-25)

- Files scanned: 11 (pipeline/inngest/processFile.ts, processBatch.ts, index.ts, pipeline/helpers/runL1ForFile.ts, scoring/helpers/scoreFile.ts, pipeline/actions/startProcessing.action.ts, pipeline/validation/pipelineSchema.ts, pipeline/components/ProcessingModeDialog.tsx, ModeCard.tsx, pipeline/stores/pipeline.store.ts, app/api/inngest/route.ts)
- **HIGH violations (3):**
  - `processFile.ts:62` + `processBatch.ts:44`: `inngest.createFunction as any` — workaround for Inngest SDK type mismatch; both files have eslint-disable comment confirming intentional use
  - `inngest/index.ts`: barrel export (`index.ts` re-exporting from 3 source files) — CLAUDE.md explicitly forbids barrel exports in feature modules
  - `ProcessingModeDialog.tsx:8`: `from '../actions/startProcessing.action'` — relative import crossing directory boundary; should use `@/features/pipeline/actions/startProcessing.action`
- **MEDIUM violations (4):**
  - Duplicate `ProcessingMode` type: defined in both `inngest/types.ts:1` AND `src/types/pipeline.ts:2` — identical definition; canonical source should be `@/types/pipeline`
  - `pipeline.store.ts` lines 6, 34: `status: string` overly broad — should use `PipelineStatus` union type from `@/types/pipeline`
  - `processBatch.ts:19–33`: `step.sendEvent` wrapped in `Promise.all` — Inngest best practice is batch array form for fan-out to enable proper checkpointing
  - `scoreFile.ts:208–262`: `createGraduationNotification` is 54-line private function — separation of concern; should be own helper
- **LOW violations (3):**
  - Same-directory relative imports `./types` in `processFile.ts:11` and `processBatch.ts:3` — no `..` involved, borderline
  - `inngest/index.ts:3` re-exports `ProcessingMode` from wrong source (`./types` instead of canonical `@/types/pipeline`)
  - `scoreFile.ts:208`: `createGraduationNotification` private function structural concern
- **CLEAN:** `runL1ForFile.ts` (all withTenant() correct, NonRetriableError used correctly, try-catch OUTSIDE step.run context), `startProcessing.action.ts` (all @/ imports, withTenant() on every query), `pipelineSchema.ts` (correct naming), `route.ts` (correct Next.js named exports), `ModeCard.tsx`

## Recurring Pattern: `inngest.createFunction as any` Workaround (MEDIUM — scoped)

- **Pattern**: `as any` on Inngest createFunction — used to bypass SDK TypeScript type mismatch.
- **Current state (2026-02-25)**: Scoped to `onFailure: onFailureFn as any` only (not entire createFunction call). Blast radius reduced in CR R2.
- **Files**: `processFile.ts`, `processBatch.ts`, `batchComplete.ts`
- **Accepted**: eslint-disable scoped, comment explains rationale. Full fix requires Inngest SDK generics improvement.

## Recurring Pattern: Barrel Export in Feature Inngest Subdirectory — ✅ RESOLVED (2026-02-26)

- **Originally flagged in Story 2.6**: `src/features/pipeline/inngest/index.ts`
- **Status**: Verified file does NOT exist — `route.ts` already imports directly from `processBatch.ts` and `processFile.ts`. No barrel export was ever created.

## Edge Cases Noted

- `logger-edge.ts` uses `console.log/warn/error` internally — this IS the logging solution for Edge runtime.
- `rls/*.test.ts` files use `console.warn` for skip messages — test files exempt from logging rule.
- `error.tsx` files use `console.error` — required by Next.js error boundary pattern; pino cannot be used in client components.
- `db/schema/index.ts` barrel export is architecture-approved (comment says so).
- `glossary/parsers/index.ts` is a dispatcher function (not a re-export barrel) — clean.
- `sql\`` template literals in Drizzle ORM (`count(\*)::int`, `lower()`) are NOT raw SQL violations — they are Drizzle's type-safe SQL helper.
- JOIN ON clause `eq(table.tenantId, tenantId)` vs WHERE clause — debatable whether withTenant() required in ON conditions.
- `or(eq(table.tenantId, x), isNull(table.tenantId))` pattern in penaltyWeightLoader — architectural exception; withTenant() cannot wrap an OR condition that includes IS NULL.
- `import ExcelJS from 'exceljs'` is NOT an export-default violation — ExcelJS is a 3rd party library using CJS module.exports. Integration test files importing it are fine.
- `process.stderr.write()` in integration test files is NOT a console.log violation — it is intentional diagnostic output for CI/measurement tests, and uses stderr (not stdout) to avoid contaminating test output.
- `process.env['GOLDEN_CORPUS_PATH']` in integration tests is LOW (not HIGH) — test files cannot use `@/lib/env` (env.ts is server-only; Vitest runs outside Next.js context). Same rationale as E2E tests (Story 2.8 precedent). However, since this env var controls test corpus path (not app secrets), the risk is minimal.

## Story 2.10 Scan Summary (2026-02-26) — FINAL

- Files scanned: 7 (golden-corpus-parity.test.ts, clean-corpus-baseline.test.ts, tier2-multilang-parity.test.ts, ruleEngine.perf.test.ts, factories.ts, eslint.config.mjs, package.json)
- **MEDIUM violations (1):**
  - `factories.ts` line 500: `id: \`00000000-0000-4000-8000-${String(i).padStart(12, '0')}\``— segment IDs exceed the 12-char limit of the UUID node section (UUID v4 node section is 12 hex chars = correct) but for i >= 1000000 (1M+) these overflow. Within the 5001-segment test range, all IDs are valid UUID v4 format. Flag LOW-borderline. fileId/projectId/tenantId (lines 481–483) use`'00000000-0000-4000-8000-000000000001/002/003'` — valid UUID v4.
- **LOW violations (3):**
  - `golden-corpus-parity.test.ts` lines 50–51: `process.env['GOLDEN_CORPUS_PATH']` — direct env access in integration test; cannot use @/lib/env in Vitest (env.ts is server-only). Flag LOW per Story 2.8 E2E precedent. eslint.config.mjs line 152 explicitly whitelists `src/__tests__/integration/**` for process.env.
  - `clean-corpus-baseline.test.ts` lines 36–37, 43, 95: same pattern — whitelisted, LOW.
  - `tier2-multilang-parity.test.ts` lines 35–36, 47, 165: same pattern — whitelisted, LOW.
- **CLEAN:** no `export default` violations (eslint.config.mjs `export default` is file-level config exception, whitelisted), no `any` types, no `enum`, no raw SQL, no console.log (all output uses process.stderr.write — intentional diagnostic, NOT console.log), no snapshot tests, no "use client", no service_role, no inline Supabase client, no try-catch in step.run(), all test imports use @/ alias correctly, no inline Tailwind (test-only files), `import ExcelJS from 'exceljs'` is CJS default export (not a violation), all behavioral assertions (no toMatchSnapshot), `buildPerfSegments()` has explicit return type `SegmentRecord[]`, hardcoded UUIDs in buildPerfSegments ARE valid UUID v4 format.
- **package.json:** `test:parity` script uses `cross-env GOLDEN_CORPUS_PATH=...` which passes env via cross-env (not process.env in app code) — clean.

## Confirmed Architectural Pattern: process.stderr.write() in Integration Tests

- **Verified**: `process.stderr.write()` is the established pattern for diagnostic output in integration/parity tests.
- `eslint.config.mjs` "no-console" rule allows `warn` and `error` but NOT `log` — `process.stderr.write()` bypasses this entirely (not a console call).
- This is intentional: measurements should appear on stderr (not pollute test runner stdout).
- ALL 4 integration test files (Story 2.10) follow this pattern consistently.

## Story 3.0 Scan Summary (2026-02-26)

- Files scanned: 14 (review/stores/review.store.ts, review/hooks/use-score-subscription.ts, review/hooks/use-finding-changed-emitter.ts, review/utils/finding-changed-emitter.ts, pipeline/inngest/recalculateScore.ts, pipeline/inngest/recalculateScore.test.ts, review/stores/review.store.test.ts, types/finding.ts, types/pipeline.ts, types/index.ts, scoring/types.ts, scoring/helpers/scoreFile.ts, pipeline/inngest/processFile.ts, lib/inngest/client.ts, app/api/inngest/route.ts, test/factories.ts)
- **HIGH violations (1):**
  - `recalculateScore.ts:75` + `processFile.ts:116`: `onFailure: onFailureFn as any` — scoped `any` for Inngest SDK type mismatch. eslint-disable comment present. Same recurring pattern as Stories 2.6/2.7. Accepted per established precedent.
- **MEDIUM violations (2):**
  - `scoreFile.ts:108`: `findingRows as unknown as ContributingFinding[]` — double cast; safer than `as any` but still bypasses type checking. `ContributingFinding` is already imported at top of file. Should use Zod validation or Drizzle inferred type instead.
  - `processFile.ts:11`: `from './types'` — same-directory relative import (no `..`); consistent with recurring LOW pattern from Stories 2.4–2.6.
- **LOW violations (2):**
  - `processFile.ts:11`: `from './types'` — same-directory relative import (borderline per established precedent)
  - `recalculateScore.test.ts` uses `createDrizzleMock()` global without import — correct (setup.ts registers it on globalThis), not a violation
- **All other checks CLEAN** — no `export default` in feature modules, no `any` (except scoped eslint-disable), no `enum`, no raw SQL, no `console.log`, no `process.env`, no `service_role`, no hardcoded tenantId UUIDs, no inline Supabase client creation, no try-catch INSIDE step.run() (try-catch in onFailureFn is OUTSIDE step.run — correct), no snapshot tests, no "use client" on page.tsx, withTenant() on every query in scoreFile.ts, `createBrowserClient()` correctly used (not inline creation), factories.ts all UUIDs via faker.string.uuid(), buildFindingChangedEvent() new factory correct.

## Recurring Pattern: `onFailure: onFailureFn as any` in Inngest Functions — Established Exception

- **Pattern**: All Inngest functions in this codebase use `onFailure: onFailureFn as any` with `eslint-disable @typescript-eslint/no-explicit-any` comment.
- **Root cause**: Inngest SDK TypeScript generics for `onFailure` don't align with actual handler signature at compile time.
- **Status**: ACCEPTED per Story 2.6 precedent. blast radius is scoped (single field, not entire createFunction call).
- **Files**: `processFile.ts`, `processBatch.ts`, `batchComplete.ts`, `recalculateScore.ts`
