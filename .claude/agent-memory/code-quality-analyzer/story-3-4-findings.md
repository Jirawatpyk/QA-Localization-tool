# Story 3.4 — AI Resilience Fallback & Retry CR R1-R2

## R1 (2026-03-07): 0C / 7H / 5M / 5L

### High (ALL FIXED in R2)

- **H1:** processFile.ts:171 `finalScoreResult!` non-null assertion → FIXED: `?.mqmScore ?? 0`
- **H2:** retryAiAnalysis.action.ts unsafe `as` casts → FIXED: runtime validation with VALID_LAYERS/VALID_MODES Sets
- **H3:** pipeline.ts:65 `ReadonlySet<string>` → FIXED: `ReadonlySet<DbFileStatus>`
- **H4:** score query missing projectId filter → FIXED: added `eq(scores.projectId, projectId)`
- **H5:** catch swallows NonRetriableError → DEFERRED (design decision — see R2 L1)
- **H6:** Event naming dot+kebab → DEFERRED (systematic — consistent with codebase)
- **H7:** `deriveLanguagePair` duplicated → FIXED: extracted to shared helper

### Medium (ALL FIXED in R2)

- **M3:** scoreFile audit action `score.calculated` for partial → FIXED: uses `score.partial`

### Low (ALL FIXED in R2)

- **L1:** `finalScoreResult!` → FIXED: `finalScoreResult?.mqmScore ?? 0`
- **L2:** `terminalStatus` typed as `string[]` → FIXED: `DbFileStatus[]`

## R2 (2026-03-07): 0C / 1H / 3M / 5L — CLEAN

### High

- **H1:** pollFileStatus E2E helper doesn't fail-fast on ai_partial (only on 'failed') — CI wastes 180s timeout

### Medium

- **M1:** retryFailedLayers handler try-catch wraps step.run — design decision needs documenting comment
- **M2:** test helper uses `uploadBatchId: ''` (empty string) — PipelineFileEventData should be `string | null`
- **M3:** runL3ForFile surroundingContext O(n\*m) findIndex inside map — use index Map

### Low

- **L1:** retryFailedLayers catch swallows NonRetriableError as ai_partial (design trade-off)
- **L2:** deriveLanguagePair no dedicated unit test
- **L3:** T25 re-declares DbFileStatus locally instead of importing from @/types/pipeline
- **L4:** buildRetryEvent layersToRetry typed as `string[]` not `PipelineLayer[]`
- **L5:** T04 auth error tries all models assertion (correct per design)

## Patterns Confirmed

- callWithFallback cleanly separates fallback logic from business logic
- withTenant() present on ALL queries (verified across all changed files)
- Inngest config complete: retries=3, onFailure, Object.assign, route.ts registration
- Budget guard double-checked: action + Inngest step (defense-in-depth)
- CAS guard pattern correct in runL2/L3 (atomic UPDATE WHERE status=)
- tokens.css uses design tokens (--color-status-partial) not inline colors
- Audit log non-fatal pattern correct in runL2/L3 (try-catch on error path)
- E2E test has TD ref: TODO(TD-E2E-011) for chaos test

## New Anti-Pattern: Handler-Level Catch Swallows NonRetriableError

- In Inngest handler, catch-all at handler level should re-throw NonRetriableError before entering partial failure path
- NonRetriableError signals "stop retrying" — swallowing it and setting ai_partial defeats the purpose
- Pattern: `} catch (err) { if (err instanceof NonRetriableError) throw err; /* partial path */ }`

## Still Open from Prior Reviews

- resolveHealthyModel() in providers.ts exists but NOT called anywhere in pipeline (Memory #26 — only in tests)
