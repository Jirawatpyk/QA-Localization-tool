# Anti-Pattern Detector — Persistent Memory

## Scan History Index

- Stories 1.1–2.8: See `story-scans-1-2.md` (archived)
- Story 3.1: See `story-3-1-findings.md` (2026-02-27)

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

### console.log (HIGH)

- `'use client'` error boundary components cannot use pino (server-only) — documented exception
- `src/app/(app)/error.tsx:14`, `src/app/error.tsx:14` — known violations, cannot fix without client-safe logger

### process.env Direct Access (HIGH — with documented exceptions)

- `src/lib/supabase/client.ts:9-10` — browser-safe Supabase init; env.ts is server-only, cannot use
- `src/proxy.ts:53,64-65` — proxy runs before app init; env.ts Proxy may not be ready
- `src/lib/logger.ts:9` — pino level config; acceptable NODE_ENV check
- NEW (Story 3.1): `Redis.fromEnv()` in `ratelimit.ts:7` — Upstash convenience bypasses @/lib/env. Fix: `new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })`

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
- Pattern to check: any component with `useState(propValue)` where prop can change

### 'use client' on Pure Display Components (LOW)

- Components with no hooks, no browser APIs, and no event handlers do NOT need `'use client'`
- Story 3.1: `AiBudgetCard.tsx` is pure display, declared `'use client'` unnecessarily

## Allowlist: Valid Design Tokens (confirmed in tokens.css / globals.css)

`text-primary`, `text-muted-foreground`, `bg-muted`, `border-border`, `bg-surface-secondary`,
`text-text-muted`, `text-text-primary`, `text-success`, `text-warning`, `text-error`, `text-info`,
`bg-success`, `bg-warning`, `bg-error`, `bg-popover`, `bg-accent`, `text-destructive`,
`text-foreground`, `bg-background`, `border-warning/20`, `bg-warning/5` (opacity modifiers on tokens = LOW)

## Next.js Convention Exceptions

- `export default` allowed ONLY in: `page.tsx`, `layout.tsx`, `error.tsx`, `route.ts`
- `'use client'` on `page.tsx` is ALWAYS forbidden
- `"use server"` + `import 'server-only'` pattern is correct and required for Server Actions
