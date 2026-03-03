# Pipeline Deep Review Findings (2026-03-03)

## Scope

Full pipeline feature review: helpers (L1/L2/L3/score/chunk/crossFile), inngest functions, engine, prompts, components, actions, scoring

## Critical Findings (3)

### C1. crossFileConsistency uses status 'open' -- NOT in FINDING_STATUSES

- File: `src/features/pipeline/helpers/crossFileConsistency.ts:176`
- 'open' is not in FindingStatus union: 'pending'|'accepted'|'re_accepted'|'rejected'|'flagged'|'noted'|'source_issue'|'manual'
- Impact: cross-file findings don't contribute to MQM score (CONTRIBUTING_STATUSES misses 'open')
- Fix: change to 'pending'

### C2. runL3ForFile has inline buildL3Prompt instead of shared prompt builder

- File: `src/features/pipeline/helpers/runL3ForFile.ts:395-447`
- Inline prompt MISSING: taxonomy, glossary, domain context, few-shot examples, language instructions
- Shared builder at `src/features/pipeline/prompts/build-l3-prompt.ts` is never called by L3
- L3 also doesn't load glossary/taxonomy/project from DB (unlike L2 which loads all 5)

### C3. Fallback chain built but never consumed

- `resolveHealthyModel()` exists in providers.ts but NOT called from runL2/L3ForFile
- Log message "not yet consumed" confirms awareness
- Already tracked in MEMORY.md Anti-Pattern #26

## High Findings (8)

- H1: processFile batch-complete check - latent race condition (serial project concurrency mitigates)
- H2: CAS rollback to 'failed' makes retries useless (by design but counter-intuitive)
- H3: L3 doesn't log AI usage for failed chunks (unlike L2)
- H4: Interim L1 score may include stale L2 findings on re-run (mitigated by final score)
- H5: autoPassChecker JOIN creates cross-product (scores x segments) - perf issue
- H6: crossFileConsistency glossary check O(S*G*L) - hot loop for large datasets
- H7: 3 Inngest functions use `as any` for onFailure (processBatch, batchComplete, recalculateScore)
- H8: pipeline.store.ts FileStatus missing statuses + has 'completed' not in DbFileStatus

## Key Patterns Confirmed Good

- CAS guard pattern in L1/L2/L3
- Transaction atomicity everywhere
- Partial failure tolerance in AI chunks
- withTenant() on every query
- Budget guard before AI calls
- MQM calculator is pure function
- Zod array uniqueness validation
