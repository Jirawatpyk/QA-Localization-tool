# Story 3.1 AI Cost Control, Throttling & Model Pinning

## Pre-CR Scan (2026-02-27)

- **3 Critical** (C1-C3): void logAIUsage silent swallow, missing projectId filter, progress bar CSS bug
- **5 High** (H1-H5): Redis.fromEnv() env bypass, providers.ts no project guard, dropdown no click-outside, model list DRY, runL2/L3 not using providers.ts
- **7 Medium** (M1-M7): unlimited budget shows $0 usage, missing Zod schemas x2, no state update after model pin, Redis 6x instances, startProcessing project validation gap, skipped tests still skipped
- **5 Suggestions** (S1-S5): inline Tailwind colors, floating-point precision, month-start DRY, keyboard nav, model ID SSOT

## CR R1 Summary (2026-02-27)

- **Files reviewed:** 18 implementation files (12 new, 6 modified)
- **Findings:** 1C + 5H + 8M + 5L = 19 total

### Critical (1)

- C1: updateProject.action.ts audit log NOT wrapped in try-catch (Guardrail #2 violation)

### High (5)

- H1: 4 Server Actions lack Zod input validation (getFilesWordCount, getProjectAiBudget, updateModelPinning, updateBudgetAlertThreshold)
- H2: Rate limit rejection uses NonRetriableError — should be retriable (Inngest won't retry)
- H3: monthStart uses local time, not UTC — timezone mismatch with timestamptz column (budget.ts + getProjectAiBudget)
- H4: AiBudgetCard uses inline Tailwind colors instead of design tokens (bg-red-500, bg-yellow-500, bg-green-500)
- H5: Fallback chain built but not wired in runL2/L3 (only primary used, fallbacks discarded)

### Medium (8)

- M1: Budget query logic duplicated in budget.ts and getProjectAiBudget.action.ts (DRY)
- M2: updateProject.action.ts uses Record<string, unknown> in .set() (type safety bypass)
- M3: ModelId type doesn't include pinned model variants — cost config wrong for Gemini
- M4: getModelById supports o1- prefix but no o1 models in allowlist (dead code)
- M5: ModelPinningSettings void handleSelect swallows errors (Guardrail #13)
- M6: types.ts has server-only guard but exports types that could be needed by client
- M7: getProjectAiBudget returns usedBudgetUsd:0 for unlimited budget (no actual spend query)
- M8: ProcessingModeDialog doesn't reset mode state on re-open (Guardrail #11)

### Low (5)

- L1: ALL_AVAILABLE_MODELS is Set<string> not typed Set
- L2: Magic number 100_000 in ProcessingModeDialog
- L3: ai_usage_logs.estimated_cost uses real (float4) instead of numeric — precision drift
- L4: settings/page.tsx missing export const dynamic = 'force-dynamic'
- L5: checkTenantBudget is a stub returning hardcoded true

## Pre-CR vs CR R1 Comparison

### Pre-CR Findings Fixed Before CR R1

- Pre-CR C1 (void logAIUsage): FIXED — added .catch()
- Pre-CR C2 (missing projectId filter): FIXED — eq(projectId) added
- Pre-CR H3 (dropdown no click-outside): FIXED — useEffect click-outside handler added
- Pre-CR H4 (model list DRY): FIXED — shared models.ts SSOT
- Pre-CR H5 (runL2/L3 not using providers.ts): PARTIALLY FIXED — now uses getModelForLayerWithFallback but only primary

### Still Open From Pre-CR

- Pre-CR M1 → CR R1 M7: unlimited budget shows $0 usage
- Pre-CR M2/M3 → CR R1 H1: missing Zod schemas
- Pre-CR S1 → CR R1 H4: inline Tailwind colors
- Pre-CR S2 → CR R1 L3: floating-point precision
- Pre-CR S3 → CR R1 H3: month-start timezone (escalated to High)

## CR R2 Summary (2026-02-27)

- **Findings:** 0C + 2H + 5M + 5L = 12 total
- **R1 Fix Verification:** 14/19 FIXED, 1 PARTIAL, 2 BY DESIGN, 2 DEFERRED

### R1 Fix Status

- C1 (audit try-catch): FIXED
- H1 (Zod validation): PARTIAL — 3 actions still typed input
- H2 (retriable Error): FIXED
- H3 (UTC monthStart): FIXED
- H4 (design tokens): FIXED
- H5 (fallback chain logging): FIXED
- M1-M8: mostly FIXED (M4 getModelById o3- still missing, M6 deferred)
- L1-L5: mixed (L4 force-dynamic still missing)

### New R2 Issues

- H1: 8 it.skip tests in runL2/L3ForFile.test.ts (tests feature already implemented)
- H2: Asymmetric o3- prefix between client.ts getModelById and costs.ts deriveProvider
- M1: getProjectAiBudget redundant 2x project query
- M2: updateBudgetAlertThreshold/updateModelPinning typed input not unknown+Zod
- M3: AiBudgetCard pct=0 but isExceeded=true when budget=$0
- M4: ProcessingModeDialog useEffect deps array includes fileIds (reference equality)
- M5: getFilesWordCount typed input not unknown+Zod

### Verdict

- 0C + 2H = must fix H1 (un-skip tests) + H2 (o3- prefix)
- M2 strongly recommended (Zod validation pattern compliance)

## Key Patterns Confirmed

- withTenant: ALL queries correct (20+ queries checked across R1+R2)
- Audit log non-fatal: CORRECT everywhere
- CAS guard: CORRECT in runL2/L3
- DELETE+INSERT atomicity: CORRECT via db.transaction()
- inArray guard: CORRECT in getFilesWordCount
- Shared models.ts (no server-only): CORRECT for client+server import
- createAIMock factory: comprehensive and well-structured
- Budget guard: CORRECT in 3 layers (startProcessing, runL2, runL3)
- Rate limit retriable: CORRECT (plain Error, not NonRetriableError)
