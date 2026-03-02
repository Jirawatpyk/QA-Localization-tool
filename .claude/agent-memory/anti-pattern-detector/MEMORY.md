# Anti-Pattern Detector — Persistent Memory

## Scan History Index

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

## Recurring Violations by Category

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

### Relative Imports (LOW)

- Rule: no paths going up MORE than one level. Same-dir `./` and one-level `../` within same feature = LOW (not blocked)
- Seen consistently across all stories in action files and helpers

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
