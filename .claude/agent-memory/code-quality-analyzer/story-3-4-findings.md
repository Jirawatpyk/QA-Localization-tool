# Story 3.4 — AI Resilience, Fallback & Retry CR R1

**Date:** 2026-03-07
**Result:** 1C / 7H / 8M

## Critical

- **C1:** `retryAiAnalysis.action.ts` — Missing `eq(files.projectId, projectId)` in file query AND `eq(scores.projectId, projectId)` in score query. IDOR risk: attacker can mismatch fileId/projectId → wrong budget check, wrong model config, wrong concurrency key.

## High

- **H1:** `retryAiAnalysis.action.ts` — Missing `'use server'` directive. Has `import 'server-only'` but no `'use server'`. Client component cannot call it as Server Action.
- **H2:** `retryAiAnalysis.action.ts` — No Zod input validation. Accepts raw TypeScript type without runtime validation.
- **H3:** `retryAiAnalysis.action.ts` — Passes `resourceId: fileId` to `writeAuditLog` but `AuditLogEntry` type has no `resourceId` field. Dead data.
- **H4:** `retryAiAnalysis.action.ts` — Unsafe `as unknown as { userId: string }` cast for test mock workaround in production code.
- **H5:** `deriveLanguagePair` duplicated in runL2ForFile.ts and runL3ForFile.ts — DRY violation.
- **H6:** `L1_COMPLETED_STATUSES` Set duplicated in processFile.ts and retryFailedLayers.ts — drift risk.
- **H7:** `PRIMARY_MODELS` in types/pipeline.ts vs `LAYER_DEFAULTS.systemDefault` in providers.ts — same values duplicated, drift = wrong fallback badge detection.

## Medium

- **M1:** processFile.ts `finalScoreResult!` non-null assertion — theoretically safe but code smell.
- **M2:** `layersToRetry: string[]` should be `PipelineLayer[]` for type safety.
- **M3:** fallbackRunner.ts unreachable code comment misleading.
- **M4:** ReviewPageClient.tsx `initialData` in useEffect deps → re-initialize on RSC revalidate (prop sync anti-pattern).
- **M5:** ScoreBadge.tsx `prevScoreRef` not reset on component reuse (Guardrail #12).
- **M6:** retryAiAnalysis audit log try-catch deviation from Guardrail #2 — acceptable but needs comment.
- **M7:** retryFailedLayers handler-level try-catch catches NonRetriableError → ai_partial instead of propagating to onFailure.
- **M8:** CAS guard + crash = stuck in processing status (pre-existing from 3.2b, mitigated by retry flow).

## Patterns Confirmed

- fallbackRunner.ts: clean error classification design
- Inngest Guardrail #10 compliance: retryFailedLayers fully compliant
- Cost tracking: both success + error paths tracked with actual model ID
- deriveProviderFromModelId consolidated in types.ts (fixes Memory #32)
