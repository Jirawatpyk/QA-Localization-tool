# Story 3.1 Scan Summary (2026-02-27)

## Files scanned: 20

Source: runL2ForFile.ts, runL3ForFile.ts, budget.ts, costs.ts, providers.ts, types.ts, models.ts, ratelimit.ts, startProcessing.action.ts, getProjectAiBudget.action.ts, updateBudgetAlertThreshold.action.ts, updateModelPinning.action.ts, updateProject.action.ts, ProcessingModeDialog.tsx, AiBudgetCard.tsx, ModelPinningSettings.tsx, BatchSummaryView.tsx, ProjectSettings.tsx, settings/page.tsx, projectSchemas.ts

## Findings

### HIGH violations (2)

**H1 — `src/lib/ai/client.ts` lines 55–57**

- `getModelById()` calls `openai(modelId)`, `anthropic(modelId)`, `google(modelId)` directly inside `client.ts`
- Violates Guardrail #20: never inline provider constructors in feature code; use `customProvider`
- Context: `getModelById` is defined INSIDE `client.ts` (the factory file), so it is not strictly in "feature code". It is an escape hatch for pinned model variants that cannot be pre-registered statically in `customProvider`.
- Decision: Flag HIGH, but acknowledge it may be a documented exception if a code comment explicitly justifies the pattern.
- Called by: `runL2ForFile.ts:206`, `runL3ForFile.ts:200`

**H2 — `src/lib/ratelimit.ts` line 7**

- `Redis.fromEnv()` bypasses `@/lib/env` Zod validation
- UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN ARE in env.ts schema (lines 13–14), but `fromEnv()` reads `process.env` directly before Zod validation runs
- Fix: `new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })`

### MEDIUM violations (1)

**M1 — `src/features/pipeline/components/ModelPinningSettings.tsx` lines 34–35**

- `ModelSelect` component: `useState(currentModel)` not synced when parent re-renders with new `currentModel` prop
- Violates Guardrail #12: dialog/component state must reset on prop change
- Fix: add `useEffect(() => { setSelectedModel(currentModel) }, [currentModel])`

### LOW violations (4)

**L1 — `src/features/pipeline/helpers/runL2ForFile.ts` line 23**

- `import { chunkSegments } from './chunkSegments'` — same-dir relative import, should use `@/` alias
- Consistent with same pattern in L3 and across stories 2.1–2.5

**L2 — `src/features/pipeline/helpers/runL3ForFile.ts` line 23**

- Same as L1: `import { chunkSegments } from './chunkSegments'`

**L3 — `src/features/pipeline/components/AiBudgetCard.tsx` line 1**

- `'use client'` on pure display component with no hooks or browser APIs
- Not a security issue, but unnecessarily adds to client bundle. Could be Server Component.

**L4 — `src/features/batch/components/BatchSummaryView.tsx` line 116**

- `border-warning/20 bg-warning/5` — opacity modifiers on design tokens
- Underlying `warning` token is valid (defined in tokens.css). `/20` and `/5` are Tailwind opacity modifiers.
- Borderline: flag LOW, reviewer decision whether opacity variants on tokens are acceptable.

## Clean Patterns Confirmed (Story 3.1)

- `generateText` + `Output.object()` used correctly in both runL2/runL3 (no deprecated `generateObject`)
- `result.output` (not `result.object`) used correctly
- `maxOutputTokens` (not `maxTokens`) used correctly
- `.nullable()` only in AI output schemas (l2ChunkResponseSchema, l3ChunkResponseSchema) — no `.optional()` or `.nullish()`
- Cost tracking: `logAIUsage()` called after every `generateText` call (Guardrail #19)
- Budget guard: `checkProjectBudget()` called before AI calls (Guardrail #22)
- Error classification: `classifyAIError()` used, rate_limit/timeout re-thrown, others logged + continued
- `withTenant()` on ALL DB queries (SELECT, UPDATE, DELETE) in all 4 action files + L2/L3 helpers
- Audit log non-fatal pattern correct: happy-path lets it throw from catch block; error-path wraps in try-catch
- No `generateObject`, no `streamObject`, no inline `openai()`/`anthropic()` in feature code
- `server-only` guard on all `src/lib/ai/` files (budget.ts, costs.ts, providers.ts, types.ts, ratelimit.ts)
- `models.ts` intentionally NOT `server-only` — allows client components to import model lists (ModelPinningSettings.tsx)
- No `export default` in feature modules, no `any`, no `enum`, no `console.log`, no `process.env`, no `service_role`
- `page.tsx` is Server Component (no `'use client'`)
- `ProcessingModeDialog.tsx` has correct state reset on re-open via `useEffect([open, ...])`
- `projectSchemas.ts` `.optional()` is correct — these are input validation schemas, NOT AI output schemas (Guardrail #17 does not apply)
- `sql`` template in budget.ts is Drizzle-native `sql` from drizzle-orm — NOT raw SQL violation
- `models.ts` uses `as const` arrays (correct — no TypeScript enum)

## New Patterns to Track

### `Redis.fromEnv()` as process.env bypass

- Upstash SDK convenience method silently bypasses Zod env validation
- All future files using `@upstash/redis` should use explicit `new Redis({ url: env.X, token: env.Y })`

### `getModelById()` dynamic provider pattern

- Pattern: string-prefix dispatch to construct AI SDK model instances for pinned variants
- Lives in `src/lib/ai/client.ts` (factory file) — not in feature code
- Acceptable as factory-internal escape hatch IF documented with comment
- Called only from runL2ForFile + runL3ForFile (not spread across codebase)
