# Story 3.2a — AI Provider Integration & Structured Output

## CR R1 (initial ATDD) Summary: 1C / 3H / 5M / 5L = 14 findings

## CR R2 (post-implementation) Summary: 1C / 2H / 8M / 0L = 11 findings

### R2 Critical

- **C1:** `suggestion` (L2) vs `suggestedFix` (L3) field name mismatch across layers
  - L2 schema+prompt+fixture all say `suggestion` — internally consistent but different from L3
  - Mapping works (`f.suggestion` -> DB `suggestedFix`) but naming drift = maintenance risk
  - Fix: ONE name (`suggestedFix`) everywhere to match L3+DB

### R2 High

- **H1:** deriveProvider (costs.ts) / getProviderForModel (providers.ts) / getModelById prefix (client.ts) — 3-way DRY violation
- **H3:** costs.test.ts missing tests for estimateCost() and aggregateUsage() pure functions

### R2 Medium (M1-M8)

- M1: L3 still uses inline prompt (not migrated to prompts module like L2)
- M2: ModelId type missing fallback models (gemini-2.0-flash, gpt-4o)
- M3: No dedicated languagePair persistence test in costs.test.ts
- M4: Migration 00018 missing index on language_pair
- M5: checkProviderHealth no timeout
- M6: resolveHealthyModel built but not wired (#26 still open)
- M7: Duplicated beforeEach in L2 test file (3 blocks)
- M8: confidence allows float (no .int())

### R2 Positive

- withTenant() all queries correct (taxonomy exempt)
- CAS guard + glossary JOIN + AI SDK v6 all correct
- Cost tracking + budget guard complete
- createAIMock + buildL2Response test fixtures excellent
- SegmentId validation, partial failure pattern, idempotent tx all good

## CR R3 (R2 fix verification) Summary: 0C / 2H / 4M / 3L = 9 findings

### R2→R3 Fix Status

- **R2 C1 (suggestion vs suggestedFix):** NOT FIXED — still `suggestion` in L2 schema+prompt
- **R2 H1 (3-way DRY):** FIXED — `deriveProviderFromModelId` centralized in types.ts
- **R2 H3 (missing pure function tests):** DEFERRED (not in R2 fix scope)

### R3 High

- **H1:** runL3ForFile missing failed-chunk logAIUsage (asymmetric fix — L2 has it, L3 doesn't)
- **H2:** R2 C1 still not fixed (suggestion vs suggestedFix naming drift)

### R3 Medium

- M1: PROVIDER_PROBE_MODELS order depends on LAYER_DEFAULTS insertion order (fragile)
- M2: client.ts getModelById still has duplicated prefix logic (acceptable — needs SDK constructors)
- M3: logAIUsage() logger.info missing `status` field (debugging gap)
- M4: costs.test.ts dynamic import pattern (style, not bug)

### R3 Low

- L1: createAIMock deriveProviderFromModelId mock needs sync comment
- L2: Partial failure test coupled to 30K chunk threshold
- L3: L2_SEMANTIC_CATEGORIES dead code

### R3 Positive

- deriveProviderFromModelId centralization excellent (SSOT in types.ts)
- PROVIDER_PROBE_MODELS derivation from LAYER_DEFAULTS — auto-syncs on config change
- L2 failed-chunk logging complete with all fields
- AIUsageRecord.status field added consistently across type+DB+insert+test
- L2ChunkResponse→L2Output import cleanup — zero broken imports
- createAIMock updated with deriveProviderFromModelId mock
