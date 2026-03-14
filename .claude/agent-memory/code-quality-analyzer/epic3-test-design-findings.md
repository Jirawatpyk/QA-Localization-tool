# Epic 3 Test Design CR — ac5cf88 + 14fb5d1

## Date: 2026-03-14

## Scope

- 2 commits: test design doc (40 risks), 18 BLOCK P0 tests, 97 P1-P3 tests
- Production fix: ProcessingModeDialog useEffect split
- CSS fix: @utility migration for finding-bg
- 2 E2E specs: pipeline-score-ui, review-l3-failure

## Findings: 0C / 3H / 5M / 7L

### HIGH

1. **crossLayerDedup.test.ts tests inline re-implementation, not production code** — no crossLayerDedup.ts exists in production. Concept test falsely inflates coverage
2. **orphanFileDetector.test.ts same pattern** — inline function, TODO(story-5.1) but no test.skip()
3. **Massive mock boilerplate duplication** — ~120 lines identical across 4 runL2ForFile test files. Extract to shared fixture

### MEDIUM

1. **@utility hardcoded hex** — lost semantic layer (vars removed from @theme). Should keep vars + reference them
2. **fileIdsKey in render body** — `fileIds.join(',')` every render; should `useMemo`
3. **scoreTransition test `if (disabledBtn)` guard** — assertion passes when button doesn't exist (false positive)
4. **conflict test asserts `.status` is defined** — too loose; should assert specific reconciliation outcome
5. **E2E re-auth block** — 20 lines inline; extract to helper

### Patterns Confirmed

- eslint-disable for exhaustive-deps WITH `fileIdsKey` pattern is valid but useMemo eliminates need
- Concept test files without production source: name should include `.concept.` or use test.skip
- Mock boilerplate > 80 lines shared across > 2 files = extract to shared fixture
