# Anti-Pattern Detector — Persistent Memory

## Scan History Index

Full archive: `scan-history-archive.md`

- Story 4.8 Accessibility Integration & Verification (2026-03-18) — 0C + 1H + 4M + 5L. 6 files. ALL 14 anti-patterns CLEAN on all files. HIGH: (1) `console.log` x3 in e2e/review-accessibility.spec.ts:314,336,353 — each has `eslint-disable-next-line no-console` but NO file-level exception comment (pattern requires file-level NOTE comment per review-keyboard.spec.ts:19-20 and supabase-admin.ts template). MEDIUM: (1) `focus-visible:outline-2 focus-visible:outline-primary` in ModelPinningSettings.tsx:125 — missing `focus-visible:outline-offset-4` (Guardrail #27 requires all 3 classes); (2) `segment_id: segments[i%segments.length]!.segment_number.toString()` in review-accessibility.spec.ts:104 — segment_number is integer, toString() gives "1","2" not UUID; findings.segment_id is uuid FK → WILL fail PostgREST seed; (3) `void sessionId / void projectId / void tenantId / void fileId` in verification-findings.ts:80-83 — use `_param` prefix instead of void expression statement for unused parameters; (4) `waitForReviewPageHydrated` imported at line 15 but never used in file — dead import. LOW: (1) `aria-label` on button AND `<label>` element in ModelPinningSettings.tsx:80,84 — redundant labeling (label not associated via htmlFor, aria-label overrides); (2) `segment_id` modulo creates duplicates when findingCount>segments.length (350 findings, 100 segments); (3) icon-only visible UI in AiSpendByProjectTable.tsx:155-163 — STATUS_LABELS rendered `sr-only` only (Guardrail #25 requires visible text+icon+color); (4) `AiSpendByProjectTable` Guardrail #12 store-prev-compare pattern CLEAN (correctly implemented); (5) `ModelPinningSettings` Guardrail #12 `useEffect([currentModel])` CLEAN (correctly added vs Story 3.1 violation). CLEAN: a11y-helpers.ts — pure WCAG util functions, named exports, no DOM, no any, proper tuple types; verification-findings.ts — FindingSeverity/FindingStatus/DetectedByLayer typed correctly, UPPER_SNAKE_CASE constants; AiSpendByProjectTable.tsx — STATUS_COLORS now uses `text-success`/`text-warning`/`text-error` (Story 3.1a violation FIXED); NotificationDropdown.tsx — all tokens valid, focus-visible on button CLEAN; ModelPinningSettings.tsx — Guardrail #12 sync useEffect CLEAN, no any, no enum. NOTE: `console.log` ESLint disable without file-level exception comment = HIGH (not just LOW/ignored). Pattern is: BOTH eslint-disable-next-line AND file-level NOTE comment required for E2E perf logging.
- Story 4.7 Add to Glossary from Review (2026-03-18) — 0C + 0H + 4M + 3L. See archive.
- Story 4.6 Suppress False Positive Patterns (2026-03-17) — 0C + 0H + 6M + 4L. See archive.
- Story 4.5 Search/Filter/AI Toggle (2026-03-16) — 0C + 0H + 5M + 4L. See archive.
- Story 4.4b Undo/Redo Stack (2026-03-15) — 0C + 0H + 4M + 3L. See archive.
- Story 4.4a Bulk Operations & Override History (2026-03-15) — 0C + 0H + 5M + 2L. See archive.
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

## Next.js 16 API Confirmations

- `revalidateTag(tag, profile)` 2-arg form — VALID. Confirmed in node_modules type definitions.
- `export default` allowed ONLY in: `page.tsx`, `layout.tsx`, `error.tsx`, `route.ts`
- `'use client'` on `page.tsx` = ALWAYS forbidden (Server Component boundary rule)
