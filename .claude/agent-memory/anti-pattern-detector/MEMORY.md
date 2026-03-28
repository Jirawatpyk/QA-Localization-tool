# Anti-Pattern Detector — Persistent Memory

## Scan History Index

Full archive: `scan-history-archive.md`

- Story 4.8 Accessibility Integration & Verification (2026-03-18) — 0C + 1H + 4M + 5L. 6 files. ALL 14 anti-patterns CLEAN on all files. HIGH: (1) `console.log` x3 in e2e/review-accessibility.spec.ts:314,336,353 — each has `eslint-disable-next-line no-console` but NO file-level exception comment (pattern requires file-level NOTE comment per review-keyboard.spec.ts:19-20 and supabase-admin.ts template). MEDIUM: (1) `focus-visible:outline-2 focus-visible:outline-primary` in ModelPinningSettings.tsx:125 — missing `focus-visible:outline-offset-4` (Guardrail #27 requires all 3 classes); (2) `segment_id: segments[i%segments.length]!.segment_number.toString()` in review-accessibility.spec.ts:104 — segment_number is integer, toString() gives "1","2" not UUID; findings.segment_id is uuid FK → WILL fail PostgREST seed; (3) `void sessionId / void projectId / void tenantId / void fileId` in verification-findings.ts:80-83 — use `_param` prefix instead of void expression statement for unused parameters; (4) `waitForReviewPageHydrated` imported at line 15 but never used in file — dead import. LOW: (1) `aria-label` on button AND `<label>` element in ModelPinningSettings.tsx:80,84 — redundant labeling (label not associated via htmlFor, aria-label overrides); (2) `segment_id` modulo creates duplicates when findingCount>segments.length (350 findings, 100 segments); (3) icon-only visible UI in AiSpendByProjectTable.tsx:155-163 — STATUS_LABELS rendered `sr-only` only (Guardrail #25 requires visible text+icon+color); (4) `AiSpendByProjectTable` Guardrail #12 store-prev-compare pattern CLEAN (correctly implemented); (5) `ModelPinningSettings` Guardrail #12 `useEffect([currentModel])` CLEAN (correctly added vs Story 3.1 violation). CLEAN: a11y-helpers.ts — pure WCAG util functions, named exports, no DOM, no any, proper tuple types; verification-findings.ts — FindingSeverity/FindingStatus/DetectedByLayer typed correctly, UPPER_SNAKE_CASE constants; AiSpendByProjectTable.tsx — STATUS_COLORS now uses `text-success`/`text-warning`/`text-error` (Story 3.1a violation FIXED); NotificationDropdown.tsx — all tokens valid, focus-visible on button CLEAN; ModelPinningSettings.tsx — Guardrail #12 sync useEffect CLEAN, no any, no enum. NOTE: `console.log` ESLint disable without file-level exception comment = HIGH (not just LOW/ignored). Pattern is: BOTH eslint-disable-next-line AND file-level NOTE comment required for E2E perf logging.
- Story 4.7 Add to Glossary from Review (2026-03-18) — 0C + 0H + 4M + 3L. See archive.
- Story 4.6 Suppress False Positive Patterns (2026-03-17) — 0C + 0H + 6M + 4L. See archive.
- Story 4.5 Search/Filter/AI Toggle (2026-03-16) — 0C + 0H + 5M + 4L. See archive.
- Story 4.4b Undo/Redo Stack (2026-03-15) — 0C + 0H + 4M + 3L. See archive.
- Story 4.4a Bulk Operations & Override History (2026-03-15) — 0C + 0H + 5M + 2L. See archive.
- Story 5.2c Native Reviewer Workflow (2026-03-28) — 0C + 0H + 5M + 4L. 19 files. HIGH: none. MEDIUM: (1) `getFindingComments.action.ts:50` — `innerJoin(users, eq(users.id, ...))` missing `withTenant(users.tenantId, tenantId)` in JOIN condition; users table has tenant_id (confirmed in flagForNative.action.ts:125 which correctly uses it); (2) `FindingCard.tsx:195` — `bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300` inline Tailwind palette colors for assignment status badge; no token equivalent; (3) `ReviewActionBar.tsx:190` — `border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400` inline palette colors for Confirm button; (4) `ReviewActionBar.tsx:206` — `border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400` inline palette colors for Override button; (5) `confirmNativeReview.action.ts:100` + `startNativeReview.action.ts:61` — `// ... (5.2b TODO M4)` and `// ... (5.2b TODO M1)` comments missing TD ref format `TODO(TD-XXX)` or `TODO(story-X.X)` (Guardrail #50). LOW: (1) `getFileReviewData.action.ts:260` — `as unknown as FileReviewData['findings']` double-cast (existing pre-Story-5.2c pattern, not new); (2) `getFindingComments.action.ts:15-22` — `FindingComment` type is file-local duplicate; `FindingForDisplay` or a shared type in `review/types.ts` would avoid drift; (3) `flagForNative.action.ts:127` — `sql\`${users.nativeLanguages} @> ${JSON.stringify([fileId])}::jsonb\``uses raw sql for JSONB containment — unavoidable (no Drizzle operator for @>), but the comment should explain intent; (4)`FindingCommentThread.tsx:29-33`—`ROLE_LABELS`constant is PascalCase key to string; consider moving to`review/types.ts`for reuse with other role-display components. CLEAN: all 7 new Server Actions — no export default, no any, no console.log, no enum, no process.env, no service_role, no hardcoded tenant_id, no inline Supabase client. All use withTenant() correctly (except getFindingComments users JOIN noted above). All use named exports. Audit log + notification pattern correct in all 4 mutation actions. FlagForNativeDialog — store-prev-compare pattern (React 19 Guardrail) correctly applied at lines 63-72. Zod schemas all camelCase+Schema suffix. Types all PascalCase no I-prefix. NOTE:`bg-blue-_`, `text-blue-_`, `bg-emerald-_`, `text-emerald-_`, `bg-amber-_`, `text-amber-_`= MEDIUM (no token equivalent). Inline dark: variants also forbidden. Fix: add`--color-native-_`or`--color-assignment-_`tokens in tokens.css, OR use existing`text-info`/`bg-info/10` for pending states.
- Story 5.2a Non-Native Auto-Tag (2026-03-27) — 0C + 0H + 2M + 3L. 25 files. MEDIUM: (1) `sql\`${reviewActions.metadata}->>'non_native' = 'true'\`` in getFileReviewData.action.ts:340 — raw SQL string comparison inside `.where()` for JSONB extraction; should use Drizzle `eq(sql\`${reviewActions.metadata}->>'non_native'\`, 'true')`or better: store`non_native`as a dedicated boolean column for type-safe querying; (2)`sql\`1\``literal in getFileReviewData.action.ts:314 used in`.having(gt(..., sql\`1\`))`— should use Drizzle`sql\`1\``(parameterized) which is technically fine but using`val`literal 1 directly would be cleaner:`gt(count(reviewActions.id), 1)`— flag as cosmetic MEDIUM. LOW: (1)`ACTION_FN_MAP`value type in use-review-actions.ts:43 is`Promise<unknown>`— correctly avoids`any`but`unknown`means caller must type-assert at line 108; (2)`REVIEW_TO_UNDO_ACTION`constant in use-review-actions.ts:22 is UPPER_SNAKE_CASE conformant; (3)`hasNonNativeAction: false`hardcoded in use-review-actions.ts:195 — new Finding built for pattern detection tracker omits real value from store, but this is in-memory only (no DB side-effect, local tracker only). CLEAN: all 14 anti-patterns clean across all action files. All withTenant() present on every SELECT/UPDATE/DELETE. No process.env, console.log, export default (in non-page files), enum, any, hardcoded tenant_id, inline Supabase client, or service_role key. Focus-visible all 3 classes on buttons in FindingCard/FindingCardCompact. NonNativeBadge: named export,`text-muted-foreground`(valid token),`aria-hidden="true"`on icon (Guardrail #25/#36). types.ts all`as const`arrays. DETECTED_BY_LAYERS/FINDING_STATUSES/FINDING_SEVERITIES: UPPER_SNAKE_CASE ✓. NOTE: JSONB`->>'key'`comparisons inside Drizzle`.where()`= recurring MEDIUM — same pattern as btCache.ts Story 5.1. Consider adding`non_native` as typed boolean column in future story.
- Story 5.1 Language Bridge / Back-Translation (2026-03-27) — 0C + 1H + 3M + 2L. 25 files. HIGH: (1) `checkProviderHealth()` in providers.ts:124–128 calls `generateText()` but does NOT log cost/usage — Guardrail #19 no exception for health probes. MEDIUM: (1) `invalidateBTCacheForGlossary` in btCache.ts:146–150 uses `sql` template tag with raw subquery `SELECT s.id FROM segments s JOIN files f ON...` — subquery lacks `withTenant()` on inner segments/files, outer `withTenant()` exists but inner not guarded; (2) `deleteExpiredBTCache` in btCache.ts:167 uses `sql\`${col} < ${val}\``— should use Drizzle`lt()`operator instead; (3)`void fetchBT(...)`x2 in useBackTranslation.ts:120,145 — Guardrail #13 violation, use`.catch()`instead (low actual risk since fetchBT has internal try-catch). LOW: (1)`BackTranslationSchemaOutput`type name in btSchema.ts:31 — redundant suffix, conflicts with existing`BackTranslationOutput` in types.ts; (2) schema barrel index.ts has architecture-approved exception comment. CLEAN: all AI calls (generateText+Output.object, not generateObject), all withTenant on DB queries, no process.env, no console.log, no enum, no any, Guardrail #17 (.nullable() only in btSchema), Guardrail #19 (logAIUsage on both primary+fallback), Guardrail #22 (budget check before AI), bg-info/10+text-info+border-info/20 VALID (Tailwind v4 auto-generates from --color-info in @theme).
- Stories 1.1–4.3: See `scan-history-archive.md`

## Recurring Violations by Category

### Inngest Event Name Convention (HIGH)

- ALL Inngest events use dot-notation: `pipeline.process-file`, `finding.changed` etc.
- Slash separator (`pipeline/retry-failed-layers`) = violation. Fix: rename to dot-notation.

### `as any` on Inngest onFailure (HIGH)

- Template: `processFile.ts` — `onFailure: onFailureFn` with NO cast at all
- Fix: use `@ts-expect-error` with explanatory comment OR remove cast entirely

### withTenant() Missing (MEDIUM)

- `eq(table.tenantId, tenantId)` used directly instead of `withTenant()` = violation
- Exception: `penaltyWeightLoader.ts` uses `or(eq, isNull)` — intentional, must comment
- Exception: `taxonomyDefinitions` / `glossaryTerms` (global tables, no tenant_id) — must comment
- NEW (Story 5.1): `sql` template subqueries inside `.where()` can bypass withTenant — check inner SELECT/JOIN for tenant guards, not just outer query

### Guardrail #19: AI cost logging (HIGH)

- ALL `generateText`/`streamText` calls must log `result.usage` via `logAIUsage()` — NO exceptions
- Health probe calls (`checkProviderHealth`) still count — even 1-token calls must be logged
- Seen in: providers.ts:124–128 (Story 5.1)

### Raw SQL via `sql` tag vs Drizzle operators (MEDIUM)

- `sql\`${col} < ${val}\``→ use Drizzle`lt(col, val)` — always prefer typed operators
- `sql\`${col} IN (SELECT...)\``→ use Drizzle subquery API or separate query +`inArray()`
- Drizzle `sql` tag creates parameterized queries (no injection risk) BUT bypasses type safety and tenant guard enforcement within subquery body

### Inline Tailwind Colors (MEDIUM)

- Palette classes (amber-_, red-_, green-\*) forbidden — use tokens.css tokens
- `bg-yellow-200` for highlight mark = WRONG, use `.highlight-mark` CSS class (globals.css:145)
- `bg-amber-*` has NO token equivalent — `--color-override` family tokens still missing as of Story 4.4a
- `text-blue-600` = use `text-info` (`--color-info: #3b82f6` exact match)
- `text-purple-600` = use `text-source-issue` (`--color-source-issue: #7c3aed`)

### console.log / console.warn (HIGH — requires BOTH eslint-disable + file-level NOTE comment)

- E2E spec files cannot import pino — `console.log` allowed with BOTH:
  1. `// eslint-disable-next-line no-console` on each line
  2. File-level `// NOTE: console.log/warn used directly — E2E specs run in Playwright Node.js process (not Next.js runtime), so @/lib/logger is not available.`
- ESLint disable-next-line alone = HIGH (confirmed Story 4.8: 3 instances flagged HIGH)
- Vitest test files: same pattern but with `// NOTE: @/lib/logger is vi.mocked in setup.ts`

### process.env Direct Access (HIGH — documented exceptions)

- `src/lib/supabase/client.ts`, `src/proxy.ts`, `src/lib/logger.ts` — documented exceptions
- E2E helpers (`e2e/helpers/supabase-admin.ts`) — Playwright Node.js context, has file-level JSDoc
- E2E spec files — same exception pattern, MUST have file-level comment (not just per-usage)
- Vitest integration test files — same exception, `// NOTE:` required

### Relative Imports (LOW)

- Same-dir `./` and one-level `../` within same feature = LOW (not blocked)
- More than one level up = violation

### console.warn in Vitest Test Files (HIGH)

- Must add: `// NOTE: console.warn acceptable in Vitest test files — @/lib/logger is vi.mocked in setup.ts`

## AI-Specific Patterns (Epic 3)

### Guardrail #17: AI Zod Schema Types

- `.optional()` and `.nullish()` cause `NoObjectGeneratedError` with OpenAI structured output
- `.nullable()` ONLY for AI output schemas. `.optional()` is correct in input schemas.

### Guardrail #16: Deprecated AI SDK Methods

- `generateObject()` and `streamObject()` — forbidden.
- Correct: `generateText({ output: Output.object({ schema }) })` + `result.output`

## Component State Patterns

### Guardrail #12: State Reset (MEDIUM)

- `useState(prop)` does NOT sync when prop changes — need `useEffect(() => { setState(prop) }, [prop])`
- Story 3.1b: `AiSpendByProjectTable.tsx` — FIXED in Story 4.8 (store-prev-compare pattern used correctly)
- Story 3.1: `ModelPinningSettings.tsx` — FIXED in Story 4.8 (useEffect([currentModel]) added)
- Pattern to check: any component with `useState(propValue)` where prop can change
- EXTENDED pattern: `useRef` that accumulates keys/IDs from props — same risk

### Guardrail #25: Icon + Text + Color (visibility)

- Status/severity MUST show icon + visible text label + color — NOT icon+color alone
- `sr-only` label alone = MEDIUM/LOW violation (sighted user loses text dimension)
- Seen in Story 4.8: AiSpendByProjectTable STATUS_LABELS rendered `sr-only` only

### Guardrail #27: Focus Indicator — all 3 classes required

- Every interactive element needs: `focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4`
- Missing `outline-offset-4` = MEDIUM (seen in ModelPinningSettings.tsx option divs)

## E2E Seed Helper Patterns

### segment_id must be UUID not integer string (CRITICAL data integrity)

- `segment_number.toString()` gives `"1"`, `"2"` — NOT valid UUIDs for UUID FK columns
- Fix: seed segments with `Prefer: 'return=representation'` and capture actual UUIDs, OR pre-assign UUIDs in payload
- Seen in: review-accessibility.spec.ts:104 (Story 4.8)

### Unused factory parameters: use `_param` prefix

- `void paramName` as statement to suppress unused var = non-standard
- TypeScript convention: prefix with `_` (`_sessionId`) or remove from signature

## Allowlist: Valid Design Tokens (confirmed in tokens.css / globals.css)

`text-primary`, `text-muted-foreground`, `bg-muted`, `border-border`, `bg-surface-secondary`,
`text-text-muted`, `text-text-primary`, `text-success`, `text-warning`, `text-error`, `text-info`,
`bg-success`, `bg-warning`, `bg-error`, `bg-popover`, `bg-accent`, `text-destructive`,
`text-foreground`, `bg-background`, `border-warning/20`, `bg-warning/5` (opacity modifiers = LOW)
`bg-surface`, `text-text-secondary`, `bg-severity-critical/major/minor`, `text-status-pass/pending/fail/analyzing`
`bg-status-ai-screened`, `bg-status-deep-analyzed`, `bg-status-partial` — confirmed tokens.css
`text-severity-critical/major/minor`, `border-severity-*/20`, `bg-severity-*/10` — confirmed tokens.css
`animate-fade-in`, `animate-slide-up`, `animate-slide-down` — confirmed animations.css
`bg-finding-accepted/rejected/flagged/noted/source-issue` — confirmed tokens.css @utility blocks
`text-source-issue` = `--color-source-issue: #7c3aed` — confirmed tokens.css
`text-info` = `--color-info: #3b82f6` — confirmed tokens.css (= blue-600 exact)
`bg-destructive`, `text-primary-foreground`, `bg-primary` — confirmed tokens.css
`border-warning-border`, `bg-warning-light`, `text-warning-foreground` — confirmed tokens.css
NOTE: `text-cjk-scale` IS defined in globals.css:140 as `.text-cjk-scale { font-size: 1.1em; }` — VALID
`bg-info/10`, `text-info`, `border-info/20` — VALID: Tailwind v4 auto-generates utility classes from ALL `--color-*` variables in `@theme` block; no `@utility` block needed (confirmed Story 5.1)

## Next.js 16 API Confirmations

- `revalidateTag(tag, profile)` 2-arg form — VALID. Confirmed in node_modules type definitions.
- `export default` allowed ONLY in: `page.tsx`, `layout.tsx`, `error.tsx`, `route.ts`
- `'use client'` on `page.tsx` = ALWAYS forbidden (Server Component boundary rule)
