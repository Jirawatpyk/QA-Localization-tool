# Anti-Pattern Detector — Persistent Memory

## Scan History Index

- Story 3.3 L3 Deep Analysis (2026-03-07) — 0C + 0H + 4M + 4L. CLEAN on all 14 anti-patterns and Guardrails #16-22. Violations: (1) bare `string` for `TaxonomyCategoryContext.severity` and `ProjectContext.processingMode` in prompts/types.ts lines 34+43 (MEDIUM — Guardrail #3, 11th+12th occurrence; comment says "Drizzle infers string" but prompt-layer type should narrow to `FindingSeverity | null` and `'economy' | 'thorough'`); (2) `performance.now() - performance.now()` in runL3ForFile.ts:252 early-return path always evaluates to ~0 (MEDIUM — logic bug, should use startTime captured before try block); (3) `taxonomyDefinitions` query without `withTenant()` in runL3ForFile.ts:289 lacks comment explaining it is intentional — global table, no tenant_id column per ERD 1.9 (MEDIUM — missing exception doc, not a real violation); (4) `SEVERITY_ORDER: Record<string, number>` in ReviewPageClient.tsx:28 should be `Record<FindingSeverity, number>` for compile-time exhaustiveness (LOW). LOWs also: `./chunkSegments` same-dir import in runL3ForFile.ts:31; 5× same-dir `./` imports in build-l3-prompt.ts:1-6. Tokens `bg-status-ai-screened` and `bg-status-deep-analyzed` in ScoreBadge.tsx are VALID — confirmed `--color-status-ai-screened` and `--color-status-deep-analyzed` defined in tokens.css @theme block. Added to allowlist below.
- Story 3.2c Review Page (2026-03-03) — 0C + 0H + 4M + 2L. See full violations below. `f as unknown as Finding` double-assertion in ReviewPageClient.tsx:80 (MEDIUM — type mismatch between FileReviewData.findings shape and Finding type, detectedByLayer/status/scope are bare strings); bare `string` for file.status + findings[].status + findings[].detectedByLayer + findings[].scope + score.status in FileReviewData type in both getFileReviewData.action.ts AND ReviewPageClient.tsx (MEDIUM — Guardrail #3, 10th+ occurrence); inline Tailwind palette colors in ConfidenceBadge.tsx lines 23-25 (bg-green-100, text-green-700, border-green-200, bg-orange-100, etc. — MEDIUM, 6th inline-color occurrence); inline bg-blue-100/text-blue-700/border-blue-200 in LayerBadge.tsx line 13 for L1 rule badge (MEDIUM — should use design token); `'use client'` in use-findings-subscription.ts hook file (.ts not .tsx — LOW, same recurring pattern as useFileUpload.ts); `'use client'` in use-score-subscription.ts hook file (LOW — same). CLEAN on: export default (page.tsx exception), any type, console.log, TypeScript enum, service_role, hardcoded tenant_id (withTenant() correct on all 4 queries), inline Supabase client (createBrowserClient() = correct factory), process.env, snapshot tests, "use client" on page.tsx (CLEAN — Server Component).
- Pipeline Feature Full Scan (2026-03-03) — 0C + 3H + 2M + 4L. See full report below. `as any` on onFailure in 3 inngest files (HIGH — processFile.ts is the correct template, no cast); bare `string` for severity/detectedByLayer in runL3ForFile PriorFindingContext + prompts/types.ts PriorFinding (MEDIUM — Guardrail #3, 8th+9th occurrence); `./chunkSegments` relative import in runL3ForFile instead of `@/` alias (LOW); `'use client'` on pipeline.store.ts Zustand file (LOW); no explicit inArray empty guard in getFilesWordCount (LOW — Zod .min(1) covers it); checkProviderHealth generateText missing comment explaining why logAIUsage/Output.object not used (LOW informational).
- Stories 1.1–2.8: See `story-scans-1-2.md` (archived)
- Story 3.1: See `story-3-1-findings.md` (2026-02-27)
- Story 3.1a: 2026-02-28 — 3M + 1L. Inline palette in STATUS_COLORS (bg-green-500, bg-yellow-500, bg-red-500), useState(prop) without sync useEffect, `interface` vs `type` in pre-existing types.ts (legacy), relative `../` imports within feature (LOW).
- Story 3.1b: 2026-02-28 — 1M + 1L. useState sort state not reset on projects prop change (Guardrail #12 recurring), interface vs type alias in 4 component files (LOW).
- Story 3.0.5: 2026-03-01 — 1H + 2M + 3L. Missing `import 'server-only'` in getBreadcrumbEntities.action.ts (HIGH); bare `string` for severity in UpdateFields/EditDraft in TaxonomyMappingTable (MEDIUM); bare `string` for status in getStatusVariant function signature in RecentFilesTable (MEDIUM); `interface` vs `type` in app-header.tsx + RecentFilesTable.tsx (LOW); Server Action in `src/components/layout/actions/` instead of feature module (LOW); empty `.catch(() => {})` without non-critical comment in AppBreadcrumb (LOW).
- Story 3.2a: 2026-03-01 — 0C + 0H + 2M + 2L. CLEAN on all 14 anti-patterns and Guardrails #16-22. See story-3-2a-findings.md for details.
- Story 3.2b: 2026-03-02 — 0C + 1H + 1M + 0L. `as any` on onFailure cast in processFile.ts (eslint-disabled, still violation — fix: use @ts-expect-error); `as unknown as ContributingFinding[]` in scoreFile.ts line 110 (double assertion — fix: @ts-expect-error with DB constraint comment).
- Story 3.2b5: 2026-03-02 — 2C + 3H + 2M + 2L. SERVICE_ROLE_KEY + process.env in e2e/helpers/pipeline-admin.ts (CRITICAL); console.log in 2 E2E specs (HIGH); empty .catch() in FileUploadZone (HIGH); bare `string` for status in FileRow/ScoreRow (HIGH); parsingStartedRef not reset on uploadedFiles change (MEDIUM Guardrail #12); hardcoded 'tenant-id' non-UUID in test (MEDIUM); ../types relative import (LOW); unnecessary 'use client' on UploadProgressList (LOW).
- Story 3.2b6: 2026-03-02 — 0C + 1H + 1M + 3L. useState(budgetAlertThresholdPct) without sync useEffect in AiBudgetCard (HIGH Guardrail #12 recurring — 5th occurrence); bare `string` for processingMode/status in ProjectSettings.Project type (MEDIUM); ./LanguagePairConfigTable relative import (LOW); 'use client' in hook file useFileUpload.ts (LOW); hardcoded test UUID constant (LOW informational).
- Story 2.7 parity E2E (2026-03-02) — 0C + 2H + 3M + 2L. bare `string` for severity/category in ComparisonFinding type (HIGH Guardrail #3 — 6th occurrence); process.env without comment in e2e/parity-comparison.spec.ts (HIGH); useState(fileId??) without sync useEffect in ReportMissingCheckDialog (MEDIUM Guardrail #12 — 6th occurrence); SERVICE_ROLE_KEY in spec without comment (MEDIUM); bare string propagated to test MockCompareResult type (MEDIUM); CHECK_TYPES missing `as const` (LOW); seedFinding inline in spec instead of e2e/helpers/ (LOW).
- TD-E2E-009 fix (2026-03-02) — 0C + 1H + 0M + 1L. RESOLVED: adminHeaders deduplication done correctly. supabase-admin.ts = single source of truth; pipeline-admin.ts re-exports from it; all 4 specs import from supabase-admin.ts. Remaining: process.env in supabase-admin.ts:7-10 without exception comment (HIGH — matches documented exception pattern but comment missing); re-export in pipeline-admin.ts:12 is a minor barrel-export concern (LOW — acceptable for thin helper-to-helper re-export).
- TD Quick-Fix Sprint (2026-03-02) — 0C + 1H + 4M + 3L. console.warn in glossary-matching-real-data.test.ts (HIGH — 5 instances, test file exception BUT must document; Playwright-equivalent: not applicable for Vitest — pino not importable in Node; use process.stderr.write like other test files); process.env in 3 integration test files (MEDIUM — test infra exception same as e2e/supabase-admin.ts, comment missing); inline segment construction in tag-gap-diagnostic.test.ts lines 194-210 (MEDIUM — missed migration to buildSegmentRecordFromParsed, 6 other files migrated); dead import `import type { ParsedSegment }` in 6 integration test files (LOW — imported but only used via .map(seg =>) type inference; verifiable); missing `export type UpdateModelPinningInput` in pipelineSchema.ts line 49 (LOW — updateModelPinningSchema infers input type but type is not exported unlike other 4 schemas); local UpdateResult type duplication in 2 action files (LOW — should use ActionResult from @/types/actionResult.ts).
- TD quick-fix batch (2026-03-02) — 0C + 5H + 3M + 1L. console.warn ×5 in glossary-matching-real-data.test.ts without exception comment (HIGH); process.env in 3 integration test files without exception comment (HIGH); inline segment object construction not migrated in tag-gap-diagnostic.test.ts (HIGH — partial migration, 6/7 files migrated); missing UpdateModelPinningInput type export in pipelineSchema.ts (HIGH); Guardrail #5 inArray guard absent in getFilesWordCount.action.ts (MEDIUM — Zod .min(1) covers this but not explicit guard); missing blank line before local type in 2 action files (MEDIUM); unused ParsedSegment import in 6 integration test files after factory migration (MEDIUM).
- Story 3.2b7 (2026-03-02) — 0C + 1H + 3M + 1L. process.env in e2e/taxonomy-admin.spec.ts line 24 without exception comment (HIGH — pattern matches documented E2E exception but comment missing); bare `string` for severity in TaxonomyManager.tsx handleUpdate fields param line 56 (MEDIUM — Guardrail #3, 7th occurrence); useState(initialMappings) in TaxonomyManager.tsx line 21 without sync useEffect — medium risk because RSC page re-renders on reload, but if parent rehydrates with new props without nav, state diverges (MEDIUM — Guardrail #12, 7th occurrence); withTenant() not used in reorderMappings.action.ts UPDATE query (MEDIUM — DOCUMENTED EXCEPTION: taxonomyDefinitions has no tenant_id per ERD 1.9, confirmed in schema comment, no violation); `as TaxonomyMapping[]` cast in page.tsx line 22 — potential unsafe cast from Drizzle row type to TaxonomyMapping (LOW — has code comment explaining DB constraint, acceptable). CLEAN on: export default (page.tsx exception), any type, console.log, TypeScript enum, service_role, inline Supabase client, snapshot tests, process.env in action (server-only, correct), Tailwind inline colors (bg-severity-\* all valid tokens), "use client" on page (page.tsx is Server Component — CLEAN).
- CI Fix Commits (2026-03-03) — 0C + 0H + 2M + 1L. 5 of 6 files CLEAN. All violations in e2e/helpers/pipeline-admin.ts only: bare `string` for FileRow.status (should use SeedFileStatus union that is already exported in same file — MEDIUM); bare `string` for ScoreRow.layer_completed and ScoreRow.status (MEDIUM — need ScoreLayerCompleted + ScoreStatus union types); bare `string` for pollFileStatus/pollScoreLayer targetLayer/targetStatus params (LOW — function-level param types should use the same unions). proxy.ts PUBLIC_ROUTES change CLEAN — no new anti-patterns. reorderMappings.action.ts Promise.all() within db.transaction() CLEAN — correct Drizzle pattern. revalidateTag('taxonomy', 'minutes') 2-arg signature confirmed valid in Next.js 16 (node_modules type: revalidateTag(tag, profile)). taxonomy-admin.spec.ts keyboard reorder + toast timeout CLEAN — process.env.E2E_TAX16_EMAIL already has exception comment at line 24-25.
- Full Taxonomy Feature Scan (2026-03-03) — 0C + 0H + 2M + 2L. Production code only (7 source files + taxonomyCache.ts + page.tsx = 9 files). See full report below. Violations: Guardrail #11 in AddMappingDialog (MEDIUM — form not reset on re-open, only on submit); Guardrail #3 in updateMapping (MEDIUM — `Record<string, unknown>` for updateValues bypasses Drizzle column-type checking); Guardrail #12 in TaxonomyManager (LOW — useState(initialMappings) without sync useEffect, risk low because RSC page re-renders on URL change); text-white with bg-severity-\* in TaxonomyMappingTable (LOW — consistent with shadcn/ui pattern, no project token for foreground-on-severity-bg).
- Scoring + Upload + Batch Full Scan (2026-03-03) — 0C + 0H + 6M + 3L. See full report below. scoring/ — CLEAN (9 production files, all guardrails pass). upload/ — CLEAN on all 14 anti-patterns; `'use client'` on useFileUpload.ts hook file (LOW — recurring). batch/ — 6M + 2L: bare `string` for status in 5 files (types.ts, getFileHistory.action.ts, FileHistoryPageClient.tsx, FileHistoryTable.tsx, FileStatusCard.tsx, BatchSummaryView.tsx — MEDIUM Guardrail #3, recurring); formatFileStatus param `status: string` (MEDIUM); FileInBatch.scoreStatus bare string in types.ts (MEDIUM); useState(initialFiles) in FileHistoryPageClient without sync useEffect (MEDIUM Guardrail #12 — 8th occurrence, LOW-risk because filter changes call setFiles explicitly); `scoreStatus: string | null` in types.ts (MEDIUM); formatFileStatus function in wrong location — should be inside components/, not helpers/ (LOW style concern); FileHistoryTable `status: string` in local type (MEDIUM — same as batch/types.ts). CLEAN: no any, no console.log, no process.env, no export default (non-page), all withTenant() correct, DELETE+INSERT in transaction in scoreFile, rows[0]! guard present, inArray guard present (fileIds.length > 0 check before query).
- Parity + Dashboard + Project Full Scan (2026-03-03) — 0C + 0H + 8M + 6L. See findings below. parity/ — 1M + 1L: bare `string` for XbenchFinding.severity (types.ts:22 — MEDIUM, comment says "coerce before use" but type itself should narrow); `interface` in 7 dashboard component files (LOW — recurring non-blocking). dashboard/ — 3M + 4L: bare `string` for AppNotification.type (types.ts:62 — MEDIUM, no notification type union defined yet); `processingMode: string` + `status: string` in ProjectWithFileCount (ProjectList.tsx:18-19 — MEDIUM, ProcessingMode and no ProjectStatus exported union); findingsCount hardcoded 0 with plain comment (getDashboardData.action.ts:53 — MEDIUM, comment lacks TD ref); `interface` in 6 dashboard components (LOW); `'use client'` on useNotifications.ts (LOW — hook file, same as useFileUpload.ts pattern); test IDs 'tenant-1'/'user-1' in 3 project action test files (LOW). project/ — 4M + 1L: `processingMode: string` in createProject.action.ts:19 + updateProject.action.ts:20 return types (MEDIUM — should be ProcessingMode); `processingMode: string` + `status: string` in ProjectList.tsx:18-19 (MEDIUM); updateLanguagePairConfig missing projectId in SELECT+UPDATE WHERE (MEDIUM — extracts projectId from input but never uses it in DB query — data correctness risk); `wordSegmenter: string` in LanguagePairConfigTable + ProjectSettings (LOW — should be `'intl' | 'space'`). CLEAN: no any, no export default (non-page), no console.log, no process.env, no service_role, no snapshot tests, no inline Supabase client, no enum, no raw SQL, all withTenant() correct on project ownership checks, audit logs present, dialog reset via useEffect(open) correct in ReportMissingCheckDialog (Guardrail #11 CLEAN).

## Recurring Violations by Category

### `as any` on Inngest onFailure (HIGH — recurring)

- Pattern: `onFailure: onFailureFn as any` in `inngest.createFunction({ onFailure: ... })` config
- Correct template: `processFile.ts` — `onFailure: onFailureFn` with NO cast at all (confirmed working)
- Fix for the 3 remaining files: use `@ts-expect-error` with explanatory comment OR remove cast entirely like processFile.ts
- Seen in: processFile.ts (Story 3.2b — fixed), processBatch.ts, batchComplete.ts, recalculateScore.ts (still open as of Pipeline Full Scan 2026-03-03)
- eslint-disable comment does NOT excuse the `any` usage — anti-pattern still applies

### withTenant() Missing (MEDIUM)

- Pattern: `eq(table.tenantId, tenantId)` used directly instead of `withTenant()`
- Exception: `penaltyWeightLoader.ts` uses `or(eq, isNull)` — cannot use `withTenant()` (intentional, fetch NULL tenant rows). Add code comment.
- Exception: JOIN ON clauses — debatable whether `withTenant()` is required (functional but not strictly enforced)
- Recurring gap: final status UPDATE at end of success path sometimes omits `withTenant()` (seen in Stories 2.3, 2.4)

### Inline Tailwind Colors (MEDIUM)

- Palette classes (amber-_, red-_, green-\*) forbidden — use tokens.css design tokens
- Opacity modifiers on tokens (`warning/20`, `warning/5`) are borderline — underlying token is valid; `/N` suffix is Tailwind v4 standard. Flag LOW.
- `muted-foreground`, `text-destructive`, `text-success`, `text-warning`, `text-info`, `text-error`, `bg-warning`, `bg-error`, `bg-success` are ALL valid tokens (confirmed in tokens.css / globals.css)
- `var(--color-overlay, #1e293b)` — CSS variable with fallback hex: acceptable (token is primary, hex is fallback only)
- `var(--chart-1, #6366f1)` pattern in recharts `fill`/`stroke` props — CSS var with hex fallback. Use token (`var(--chart-1)`) without hardcoded fallback hex. Flag MEDIUM (inline color fallback is still an inline color).
- `var(--chart-1)` WITHOUT hex fallback (Story 3.1b) — CLEAN. `--chart-1/2/3/4/5` confirmed defined in globals.css `:root` lines 73–77 and mapped in `@theme inline` lines 23–27. Using bare `var(--chart-1)` in recharts fill/stroke = valid design token usage.
- Story 3.1a: `STATUS_COLORS` in `AiSpendByProjectTable.tsx` uses `bg-green-500`, `bg-yellow-500`, `bg-red-500` — clear violations. Fix: use `bg-success`, `bg-warning`, `bg-error` from tokens.css.

### console.log (HIGH)

- `'use client'` error boundary components cannot use pino (server-only) — documented exception
- `src/app/(app)/error.tsx:14`, `src/app/error.tsx:14` — known violations, cannot fix without client-safe logger
- E2E spec files (Playwright Node process) cannot import pino either — same exception as error.tsx. Must add comment. Playwright-idiomatic alternative: `test.info().annotations.push(...)`. Seen in: pipeline-findings.spec.ts (4 instances), upload-segments.spec.ts (1 instance).

### process.env Direct Access (HIGH — with documented exceptions)

- `src/lib/supabase/client.ts:9-10` — browser-safe Supabase init; env.ts is server-only, cannot use
- `src/proxy.ts:53,64-65` — proxy runs before app init; env.ts Proxy may not be ready
- `src/lib/logger.ts:9` — pino level config; acceptable NODE_ENV check
- NEW (Story 3.1): `Redis.fromEnv()` in `ratelimit.ts:7` — Upstash convenience bypasses @/lib/env. Fix: `new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })`
- E2E helper files (e.g., `e2e/helpers/pipeline-admin.ts`) — Playwright Node process, @/lib/env unavailable. Pattern matches proxy.ts exception. MUST add explanatory comment. Flag HIGH until documented.
- `e2e/helpers/supabase-admin.ts` (lines 7-10) — RESOLVED (2026-03-03). Now has file-level JSDoc comment: "process.env is used directly because E2E helpers run in the Playwright Node.js context (not Next.js runtime), so @/lib/env is not available." CLEAN as of CI fix commits.

### Relative Imports (LOW)

- Rule: no paths going up MORE than one level. Same-dir `./` and one-level `../` within same feature = LOW (not blocked)
- Seen consistently across all stories in action files and helpers

### console.warn in Vitest Test Files (HIGH — requires exception comment)

- `console.warn` in Vitest integration test files = same exception pattern as E2E/error.tsx
- Vitest cannot import pino (server-only) + @/lib/logger is vi.mocked in setup.ts
- MUST add: `// NOTE: console.warn acceptable in Vitest test files — @/lib/logger is vi.mocked in setup.ts`
- Without comment = HIGH violation (consistent with e2e/helpers pattern)
- Seen in: glossary-matching-real-data.test.ts (5 instances, 2026-03-02)

### process.env in Integration Test Files (HIGH — requires exception comment)

- GOLDEN_CORPUS_PATH is CI-only path hint — not a production secret, not in @/lib/env
- Integration test files run in Vitest Node.js process (not Next.js app) — same exception as proxy.ts
- MUST add: `// NOTE: process.env used directly — GOLDEN_CORPUS_PATH is a CI-only test path hint, not a production secret. @/lib/env is not available in Vitest Node process.`
- Without comment = HIGH violation
- Seen in: golden-corpus-parity.test.ts, clean-corpus-baseline.test.ts, tier2-multilang-parity.test.ts (2026-03-02)

### Partial Factory Migration (HIGH)

- When `buildSegmentRecordFromParsed()` is introduced for deduplication, ALL files that have inline segment construction must be migrated
- Partial migration (some files done, some not) = HIGH inconsistency violation
- Scan ALL integration test files for `result.data.segments.map((seg) => ({` pattern after any factory addition
- tag-gap-diagnostic.test.ts missed migration in TD quick-fix batch (2026-03-02)

### Hardcoded Test IDs (MEDIUM)

- `'test-tenant'`, `'test-project'`, `'test-session'` in factories.ts violate no-hardcoded-tenant rule
- Zod v4 UUID strict — all ID fields must be `faker.string.uuid()`
- Fixed in Story 2.3 factories.ts after being flagged in Story 2.2

### ExcelJS Buffer Type Assertion

- Use `// @ts-expect-error ExcelJS Buffer type conflict` — self-documents and auto-flags if fixed upstream
- NOT `as never`, `as any`, or `as Buffer` — all rejected

## AI-Specific Patterns (Epic 3)

### Guardrail #20: Provider Constructor (HIGH)

- `openai()`, `anthropic()`, `google()` must NOT be called in feature code
- EXCEPTION: `getModelById()` in `src/lib/ai/client.ts` (the factory file itself) is an internal escape hatch for pinned variant model IDs. Acceptable IF: (a) remains inside client.ts, (b) has explanatory code comment, (c) not replicated elsewhere
- Violation if: any feature file (runL2ForFile, actions, components) calls `openai()`/`anthropic()` directly

### Guardrail #17: AI Zod Schema Types

- `.optional()` and `.nullish()` cause `NoObjectGeneratedError` with OpenAI structured output
- `.nullable()` ONLY for AI output schemas passed to `Output.object({ schema })`
- `.optional()` is CORRECT in input validation schemas (updateProjectSchema, etc.) — Guardrail #17 does not apply there

### Guardrail #16: Deprecated AI SDK Methods

- `generateObject()` and `streamObject()` — forbidden. No instances found in Stories 3.x so far.
- Correct: `generateText({ output: Output.object({ schema }) })` + `result.output` (not `result.object`)
- `maxOutputTokens` not `maxTokens`

### Guardrail #19+22: Cost Logging + Budget Guard

- Every `generateText`/`streamText` MUST call `logAIUsage()` — checked and clean in runL2/runL3
- `checkProjectBudget()` MUST be called before AI calls — clean in runL2/runL3 and startProcessing

## Component State Patterns

### Guardrail #12: State Reset (MEDIUM)

- `useState(prop)` does NOT sync when prop changes after mount — need `useEffect(() => { setState(prop) }, [prop])`
- Story 3.1: `ModelPinningSettings.tsx` — `ModelSelect` uses `useState(currentModel)` without sync effect
- Story 3.1a: `AiUsageDashboard.tsx` — `useState<Period>(selectedDays)` without sync useEffect. BUT: `selectedDays` comes from RSC searchParams (URL-driven), page re-renders on URL change, so `activePeriod` diverges only if parent changes the prop without navigation. Flag MEDIUM — pattern is risky even if current usage is safe.
- Story 3.1b: `AiSpendByProjectTable.tsx` — `useState<SortCol>('cost')` + `useState<SortDir>('desc')` not reset when `projects` prop changes. When period filter changes (7d→30d→90d), sort state persists from previous period. Fix: `useEffect(() => { setSortCol('cost'); setSortDir('desc') }, [projects])`. MEDIUM recurring Guardrail #12 violation.
- Story 3.2b5: `UploadPageClient.tsx` — `useRef<Set<string>>(new Set())` (`parsingStartedRef`) accumulates fileIds across upload cycles. If user re-uploads same file after reset, ref still contains old fileId → auto-parse silently blocked. Fix: reset ref in useEffect when uploadedFiles becomes empty.
- Story 3.2b6: `AiBudgetCard.tsx` — `useState(budgetAlertThresholdPct)` × 2 (`thresholdValue` + `savedValue`) without sync useEffect. If parent re-renders with new prop value, both states remain stale → user could Save stale value. Fix: `useEffect(() => { setThresholdValue(p); setSavedValue(p) }, [budgetAlertThresholdPct])`. HIGH (5th occurrence of this pattern).
- Story 2.7 parity: `ReportMissingCheckDialog.tsx` — `useState(fileId ?? '')` for `fileReference` without sync useEffect watching `fileId`. Dialog has open/close reset useEffect (correct for Guardrail #11) but not a fileId-change sync effect (Guardrail #12). Fix: `useEffect(() => { setFileReference(fileId ?? '') }, [fileId])`. MEDIUM (6th occurrence).
- Pattern to check: any component with `useState(propValue)` where prop can change
- EXTENDED pattern: `useRef` that accumulates keys/IDs from props — same risk as useState without sync

### 'use client' in Hook Files (LOW)

- Components with no hooks, no browser APIs, and no event handlers do NOT need `'use client'`
- Story 3.1: `AiBudgetCard.tsx` is pure display, declared `'use client'` unnecessarily (now fixed — Story 3.2b6 added hooks/interactivity, `'use client'` now correct on component)
- Story 3.2b6: `useFileUpload.ts` (hook file, `.ts` not `.tsx`) has `'use client'` directive — hooks in .ts files don't need `'use client'`; boundary is set at the Client Component that consumes them. LOW, not functional bug.

## Allowlist: Valid Design Tokens (confirmed in tokens.css / globals.css)

`text-primary`, `text-muted-foreground`, `bg-muted`, `border-border`, `bg-surface-secondary`,
`text-text-muted`, `text-text-primary`, `text-success`, `text-warning`, `text-error`, `text-info`,
`bg-success`, `bg-warning`, `bg-error`, `bg-popover`, `bg-accent`, `text-destructive`,
`text-foreground`, `bg-background`, `border-warning/20`, `bg-warning/5` (opacity modifiers on tokens = LOW)

## Next.js 16 API Confirmations

- `revalidateTag(tag, profile)` — 2-argument form is VALID in Next.js 16. Second arg is cache profile string (e.g., `'minutes'`) used with `"use cache"`. Confirmed in `node_modules/next/dist/server/web/spec-extension/revalidate.d.ts:9`. Do NOT flag as violation.
- Seen in all 5 taxonomy actions: createMapping, updateMapping, deleteMapping, reorderMappings + all glossary actions. Pattern is project-wide standard.

## Next.js Convention Exceptions

- `export default` allowed ONLY in: `page.tsx`, `layout.tsx`, `error.tsx`, `route.ts`
- `'use client'` on `page.tsx` is ALWAYS forbidden
- `"use server"` + `import 'server-only'` pattern is correct and required for Server Actions
- Story 3.0.5: New action in `src/components/layout/actions/` — only `src/features/` actions include `import 'server-only'`. Layout-level actions must also include it.

## Allowlist: Additional Valid Tokens (confirmed Story 3.0.5)

`bg-surface`, `text-text-secondary`, `bg-severity-critical`, `bg-severity-major`, `bg-severity-minor`,
`text-status-pass`, `text-status-pending`, `text-status-fail`, `text-status-analyzing`,
`bg-status-pass/10`, `bg-status-pending/10`, `bg-status-fail/10`, `bg-status-analyzing/10`,
`border-status-pass/20`, `border-status-pending/20`, `border-status-fail/20`, `border-status-analyzing/20`,
`bg-info/10`, `text-info`, `border-info/20`, `bg-card`, `hover:bg-error/90` (opacity on token = LOW)
`border-warning-border`, `bg-warning-light`, `text-warning-foreground` — confirmed in tokens.css (DashboardView.tsx + FileSizeWarning.tsx)
`bg-status-ai-screened/10`, `text-status-ai-screened`, `border-status-ai-screened/20` — confirmed Story 3.3 (tokens.css @theme: `--color-status-ai-screened: #8b5cf6`)
`bg-status-deep-analyzed/10`, `text-status-deep-analyzed`, `border-status-deep-analyzed/20` — confirmed Story 3.3 (tokens.css @theme: `--color-status-deep-analyzed: #d97706`)
