---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-02-19'
---

# ATDD Checklist — Story 1.5: Glossary Matching Engine for No-space Languages

**Date:** 2026-02-19
**Author:** Mona
**Primary Test Level:** Unit (Vitest) — No E2E needed (pure TypeScript library, no UI)

---

## Step 1: Preflight & Context Loading

### Prerequisites

| Check | Status |
|-------|--------|
| Story 1.5 approved with clear AC (AC1–AC5 + 15 th.json cases) | ✅ |
| `playwright.config.ts` configured (E2E/Chromium) | ✅ |
| `vitest.config.ts` configured (unit + rls projects) | ✅ |
| Development environment available | ✅ |
| `src/test/factories.ts` exists (`build*` pattern) | ✅ |
| `src/test/setup.ts` exists | ✅ |

---

### Story Summary

Story 1.5 builds a **Glossary Matching Engine for no-space languages** (Thai, Chinese, Japanese).

**As a** QA Reviewer,
**I want** glossary terms to be accurately matched in Thai/Chinese/Japanese text,
**So that** terminology compliance checks work correctly for languages without word boundaries.

**Acceptance Criteria:**
1. **AC1** — Thai Hybrid Matching: `indexOf` primary + `Intl.Segmenter('th')` boundary validation secondary; Singleton cache per locale; NFKC normalization; false negative < 5% on th.json
2. **AC2** — Compound Word + Boundary Mismatch: Substring found despite segmenter splits; `boundaryConfidence: 'low'` flag; dual logging (audit + pino) for boundary mismatches
3. **AC3** — Japanese Mixed Script: Matches hiragana/katakana/kanji via `indexOf`; `Intl.Segmenter('ja')` validates
4. **AC4** — Chinese (Simplified): `indexOf` independent of segmenter; fullwidth punctuation handled
5. **AC5** — European Fallback: `\W` word boundary check (no Intl.Segmenter needed)

---

### Test Level Decision

| Module | Type | Why |
|--------|------|-----|
| `segmenterCache.ts` | **Unit (Vitest)** | Pure function — no deps, no IO |
| `markupStripper.ts` | **Unit (Vitest)** | Pure function — string transformations |
| `matchingTypes.ts` | **No test** | Types only, zero runtime |
| `glossaryMatcher.ts` | **Unit (Vitest)** | Server-side logic; mocks: `getCachedGlossaryTerms`, `writeAuditLog`, `logger` |
| E2E (Playwright) | **None needed** | No UI, no HTTP endpoints, pure library |

> **Murat's Risk Calculus:** Testing pure TypeScript library functions at unit level is optimal. E2E would add browser overhead for zero gain. Unit tests here give <10ms feedback per test vs 5+ seconds for Playwright.

---

### Framework Config Loaded

```typescript
// playwright.config.ts (E2E only — not used for Story 1.5)
testDir: './e2e', baseURL: 'http://localhost:3000', Chromium only

// Vitest patterns (from Story 1.4):
// - Unit project: jsdom for components, node for server modules
// - Co-located: src/features/glossary/matching/*.test.ts
// - Pattern: vi.mock('server-only') FIRST, then other vi.mock() calls
// - Dynamic import: const { fn } = await import('./module')
// - mockReset() in beforeEach (NOT clearAllMocks — clears mockResolvedValueOnce queues)
```

---

### Existing Test Patterns (src/features/glossary/actions/createTerm.action.test.ts)

```typescript
// 1. Mock server-only FIRST
vi.mock('server-only', () => ({}))

// 2. Fixed UUIDs for determinism
const TENANT_ID = '00000000-0000-4000-8000-000000000001'

// 3. vi.mock() all external deps at module level
vi.mock('@/db/client', () => ({ db: { ... } }))

// 4. beforeEach with mockReset() (not clearAllMocks)
beforeEach(() => {
  vi.clearAllMocks()
  mockWriteAuditLog.mockReset()
  mockWriteAuditLog.mockResolvedValue(undefined)
})

// 5. Dynamic import for modules with side effects
const { createTerm } = await import('./createTerm.action')

// 6. Naming: describe('functionName') → it('should behavior when condition')
```

---

### TEA Config Flags

- `tea_use_playwright_utils`: true (playwright-utils available but **not used** for this pure unit test story)
- `tea_browser_automation`: auto (irrelevant for Story 1.5 — no browser tests)
- `risk_threshold`: p1

---

### Knowledge Fragments Applied

| Fragment | Applied? | Note |
|----------|----------|------|
| `data-factories.md` | ✅ | `buildGlossaryTerm()` factory for test data |
| `test-quality.md` | ✅ | Determinism, isolation, <300 lines, <1.5min |
| `test-levels-framework.md` | ✅ | Unit tests confirmed as correct level |
| `api-testing-patterns.md` | ✅ | Pure service logic → unit preferred over API |
| `fixture-architecture.md` | ➖ | Playwright fixtures not applicable |
| `playwright-cli.md` | ➖ | No browser automation needed |

---

*Step 1 complete.*

---

## Step 2: Generation Mode

**Mode: AI Generation** — Story 1.5 เป็น pure TypeScript library (ไม่มี UI/Browser). AC ชัดเจน, scenarios เป็น standard algorithm logic → ใช้ AI Generation โดยตรง, ไม่ต้อง browser recording.

*Step 2 complete.*

---

## Step 3: Test Strategy

### AC → Test Scenarios Map

**Test ID Format:** `1.5-UNIT-{SEQ}` (Unit = Vitest, no E2E for Story 1.5)

#### segmenterCache.ts (Task 1.1) — P0/P1

| ID | Scenario | AC | Priority |
|----|----------|----|----------|
| 1.5-UNIT-001 | `getSegmenter('th')` returns Intl.Segmenter instance | AC1 | P0 |
| 1.5-UNIT-002 | `getSegmenter('th')` called twice → returns **same** cached instance | AC1 | P0 |
| 1.5-UNIT-003 | `clearSegmenterCache()` → next `getSegmenter()` creates fresh instance | AC1 | P1 |
| 1.5-UNIT-004 | `isNoSpaceLanguage('th')` → `true` | AC1 | P0 |
| 1.5-UNIT-005 | `isNoSpaceLanguage('ja')` → `true` | AC3 | P0 |
| 1.5-UNIT-006 | `isNoSpaceLanguage('zh')` → `true` | AC4 | P0 |
| 1.5-UNIT-007 | `isNoSpaceLanguage('zh-Hans')` (BCP-47 subtag) → `true` | AC4 | P1 |
| 1.5-UNIT-008 | `isNoSpaceLanguage('en')` → `false` | AC5 | P0 |
| 1.5-UNIT-009 | `isNoSpaceLanguage('fr')` → `false` | AC5 | P1 |
| 1.5-UNIT-010 | `isNoSpaceLanguage('TH')` (uppercase) → `true` (case-insensitive) | AC1 | P1 |

#### markupStripper.ts (Task 1.2) — P0/P1

| ID | Scenario | AC | Priority |
|----|----------|----|----------|
| 1.5-UNIT-011 | `stripMarkup('<b>ข้อความ</b>')` → spaces replace `<b>` and `</b>` at same positions | AC1 | P0 |
| 1.5-UNIT-012 | `stripMarkup('<x id="1"/>ข้อความ')` → XLIFF inline tag replaced with spaces | AC1 | P0 |
| 1.5-UNIT-013 | `stripMarkup('{0} รายการ')` → `{0}` placeholder replaced with spaces | AC1 | P0 |
| 1.5-UNIT-014 | `stripMarkup('%s รายการ')` → `%s` format string replaced with spaces | AC1 | P1 |
| 1.5-UNIT-015 | `stripMarkup('')` → empty string unchanged | Edge | P1 |
| 1.5-UNIT-016 | stripped text length === original text length (position preservation contract) | AC1 | P0 |
| 1.5-UNIT-017 | `chunkText()` with text ≤ 30,000 chars → single chunk, offset=0 | AC1 | P0 |
| 1.5-UNIT-018 | `chunkText()` with text = 60,001 chars → 3 chunks with correct offsets | AC1 | P0 |
| 1.5-UNIT-019 | chunk at exact 30,000 char boundary → term is not split across chunks | AC1 | P1 |

#### glossaryMatcher.ts — validateBoundary (Task 3.1) — P0

| ID | Scenario | AC | Priority |
|----|----------|----|----------|
| 1.5-UNIT-020 | `validateBoundary()` with perfect word boundary start+end → `'high'` | AC1 | P0 |
| 1.5-UNIT-021 | `validateBoundary()` with term inside compound word → `'low'` | AC2 | P0 |
| 1.5-UNIT-022 | `validateBoundary()` at start of string (position=0) → `'high'` | AC1 | P1 |
| 1.5-UNIT-023 | `validateBoundary()` at end of string → `'high'` | AC1 | P1 |
| 1.5-UNIT-024 | `validateBoundary()` with match near 30,000-char chunk boundary → works correctly | AC1 | P1 |

#### glossaryMatcher.ts — checkGlossaryCompliance (Task 3.1) — P0

| ID | Scenario | AC | Priority |
|----|----------|----|----------|
| 1.5-UNIT-025 | Thai term found with `boundaryConfidence: 'high'` in `matches[]` | AC1 | P0 |
| 1.5-UNIT-026 | Thai compound found with `boundaryConfidence: 'low'` in `lowConfidenceMatches[]` | AC2 | P0 |
| 1.5-UNIT-027 | Audit log called with `action: 'glossary_boundary_mismatch'` for low confidence | AC2 | P0 |
| 1.5-UNIT-028 | Pino logger `warn()` called with structured data for low confidence | AC2 | P0 |
| 1.5-UNIT-029 | No duplicate audit log for same term appearing twice in segment | AC2 | P0 |
| 1.5-UNIT-030 | Term not found → appears in `missingTerms[]` | AC1 | P0 |
| 1.5-UNIT-031 | `foundText` reflects actual text at position (case differs from `targetTerm`) | AC1 | P1 |
| 1.5-UNIT-032 | NFKC normalization: fullwidth ABC（ＡＢＣ）matches term 'ABC' | AC1 | P1 |
| 1.5-UNIT-033 | Japanese katakana term found | AC3 | P0 |
| 1.5-UNIT-034 | Japanese kanji compound found | AC3 | P1 |
| 1.5-UNIT-035 | Chinese term found despite segmenter splitting | AC4 | P0 |
| 1.5-UNIT-036 | European (EN→FR) term found with word boundary, no Intl.Segmenter call | AC5 | P0 |
| 1.5-UNIT-037 | Empty text → empty `matches[]`, term in `missingTerms[]` | Edge | P1 |
| 1.5-UNIT-038 | Multiple occurrences of same term → only first position in `matches[]` | Edge | P1 |
| 1.5-UNIT-039 | caseSensitive=true → case mismatch fails to match | AC1 | P1 |
| 1.5-UNIT-040 | HTML markup preserved correctly: term found in `<b>ข้อความ</b>` | AC1 | P0 |

### Priority Summary

| Priority | Count | Criteria |
|----------|-------|----------|
| **P0** | 22 | Core algorithm correctness, dual logging, AC1-AC5 primary paths |
| **P1** | 18 | Edge cases, BCP-47 subtags, chunk boundaries, European fallback |
| **Total** | 40 | Vitest unit tests only |

### Red Phase Requirements

All 40 tests will **FAIL** before implementation because:
- Files don't exist yet (`segmenterCache.ts`, `markupStripper.ts`, `matchingTypes.ts`, `glossaryMatcher.ts`)
- TypeScript import errors will appear immediately

*Step 3 complete.*

---

## Step 4 + 4C: Test Generation & Aggregation (TDD RED PHASE)

### Test Files Generated

> **Note:** Story 1.5 = pure TypeScript library (no API endpoints, no UI). Subprocess A = utility unit tests, Subprocess B = engine unit tests. Vitest RED phase = "Cannot find module" errors (not `test.skip()` — that's Playwright's mechanism).

| File | Tests | RED Reason |
|------|-------|------------|
| `src/lib/language/segmenterCache.test.ts` | 10 | Module `./segmenterCache` not found |
| `src/lib/language/markupStripper.test.ts` | 13 | Module `./markupStripper` not found |
| `src/features/glossary/matching/glossaryMatcher.test.ts` | 27 | Module `./glossaryMatcher` not found |
| **Total** | **50** | **3 suites FAIL** |

### TDD Red Phase Evidence

```
FAIL src/lib/language/markupStripper.test.ts
Error: Failed to resolve import "./markupStripper" from "markupStripper.test.ts"

FAIL src/lib/language/segmenterCache.test.ts
Error: Failed to resolve import "./segmenterCache" from "segmenterCache.test.ts"

FAIL src/features/glossary/matching/glossaryMatcher.test.ts
Error: Failed to resolve import "./glossaryMatcher" from "glossaryMatcher.test.ts"

Test Files: 3 failed (3) | Tests: no tests | Duration: 4.43s
```

### Factory Needs

`buildGlossaryTerm()` factory used inline in `glossaryMatcher.test.ts` — no addition to `src/test/factories.ts` needed (test-local helper, not shared).

### AC Coverage (RED Phase)

| AC | Tests Written | Files |
|----|--------------|-------|
| AC1: Thai Hybrid Matching | 1.5-UNIT-001–024, 031–032 | segmenterCache + markupStripper + glossaryMatcher |
| AC2: Boundary Mismatch + Dual Logging | 1.5-UNIT-026–029 | glossaryMatcher |
| AC3: Japanese Mixed Script | 1.5-UNIT-033–034 | glossaryMatcher |
| AC4: Chinese Support | 1.5-UNIT-035 | glossaryMatcher |
| AC5: European Fallback | 1.5-UNIT-036 | glossaryMatcher |

*Step 4 + 4C complete.*

---

## Step 5: Validation & Completion

### Checklist Validation

| Category | Item | Status |
|----------|------|--------|
| Prerequisites | Story 1.5 approved with AC1–AC5 | ✅ |
| Prerequisites | Vitest + Playwright configured | ✅ |
| Prerequisites | Test dependencies installed | ✅ |
| Step 1 | Story file loaded, AC extracted | ✅ |
| Step 1 | Affected components identified (4 new files) | ✅ |
| Step 1 | Knowledge fragments: data-factories, test-quality, test-levels-framework, api-testing-patterns | ✅ |
| Step 1 | fixture-architecture, network-first, component-tdd | ➖ N/A (no UI, no network) |
| Step 2 | Test levels: Unit (Vitest) — E2E/API/Component not applicable | ✅ |
| Step 2 | Duplicate coverage avoided | ✅ |
| Step 2 | P0–P1 priorities assigned | ✅ |
| Step 3 | 3 test files created at correct locations | ✅ |
| Step 3 | RED phase verified: 3/3 suites FAIL with "Cannot find module" | ✅ |
| Step 3 | Deterministic: fixed UUIDs, mockReset in beforeEach | ✅ |
| Step 3 | No hardcoded collisions (test-local UUIDs) | ✅ |
| Step 4 | Test data factory: `buildGlossaryTerm()` inline | ✅ |
| Step 4 | `vi.mock('server-only')` FIRST pattern | ✅ |
| Step 4 | Dynamic import pattern for server-only modules | ✅ |
| Step 4 | Mock Requirements documented | ✅ |
| Step 4 | data-testid: N/A (no UI) | ➖ N/A |
| CLI sessions | No browser sessions opened | ✅ |
| Temp artifacts | Checklist in `_bmad-output/test-artifacts/` | ✅ |

### Gaps Fixed

None — all applicable items pass. Inapplicable items (fixture-architecture, network-first, data-testid) are documented as N/A for this pure-library story.

---

## Failing Tests (RED Phase) Summary

### `src/lib/language/segmenterCache.test.ts` — 10 tests

- **Status:** 🔴 RED — module not found
- **Verifies:** AC1 (Intl.Segmenter singleton), `isNoSpaceLanguage()` for all locales

| Test | AC | Priority |
|------|----|----------|
| `getSegmenter('th')` returns Intl.Segmenter instance | AC1 | P0 |
| Second call returns **same** cached instance | AC1 | P0 |
| Different locales → different instances | AC1 | P1 |
| After `clearSegmenterCache()` → fresh instance | AC1 | P1 |
| Segmenter produces word segments for Thai | AC1 | P1 |
| `isNoSpaceLanguage('th')` → true | AC1 | P0 |
| `isNoSpaceLanguage('ja')` → true | AC3 | P0 |
| `isNoSpaceLanguage('zh')` → true | AC4 | P0 |
| `isNoSpaceLanguage('zh-Hans')` BCP-47 subtag → true | AC4 | P1 |
| `isNoSpaceLanguage('TH')` case-insensitive → true | AC1 | P1 |

---

### `src/lib/language/markupStripper.test.ts` — 13 tests

- **Status:** 🔴 RED — module not found
- **Verifies:** AC1 (equal-length markup replacement), chunk boundary

| Test | AC | Priority |
|------|----|----------|
| HTML bold tags replaced with spaces | AC1 | P0 |
| Position preserved: XLIFF inline tag → spaces at same offset | AC1 | P0 |
| `{0}` placeholder → spaces | AC1 | P0 |
| `{name}` placeholder → spaces | AC1 | P1 |
| `%s` format → spaces | AC1 | P1 |
| `%1$s` format → spaces | AC1 | P1 |
| Empty string handled without error | Edge | P1 |
| Plain text (no markup) unchanged | AC1 | P1 |
| XLIFF g-tag wrapping: inner text preserved | AC1 | P1 |
| Multiple markup patterns in one string | AC1 | P1 |
| Short text → single chunk, offset=0 | AC1 | P0 |
| Text ≤ MAX → single chunk | AC1 | P0 |
| Text > MAX → 2 chunks with correct offsets | AC1 | P0 |

---

### `src/features/glossary/matching/glossaryMatcher.test.ts` — 27 tests

- **Status:** 🔴 RED — module not found
- **Verifies:** AC1–AC5, Architecture Decisions 5.5 + 5.6

| Test | AC | Priority |
|------|----|----------|
| `validateBoundary` high when perfect boundaries | AC1 | P0 |
| `validateBoundary` low inside compound word | AC2 | P0 |
| `validateBoundary` at string start/end | AC1 | P1 |
| `validateBoundary` near 30k chunk boundary | AC1 | P1 |
| Thai term found, `boundaryConfidence: 'high'` | AC1 | P0 |
| Term not found → `missingTerms[]` | AC1 | P0 |
| NFKC normalization: fullwidth ABC matches 'ABC' | AC1 | P1 |
| HTML markup stripped before search | AC1 | P0 |
| XLIFF `{0}` stripped before search | AC1 | P0 |
| `foundText` reflects actual text (case differs) | AC1 | P1 |
| Empty text → no matches, term in missingTerms | Edge | P1 |
| Empty glossary → no matches, no missingTerms | Edge | P1 |
| Audit log written for boundary mismatch | AC2 | P0 |
| Pino warn written for boundary mismatch | AC2 | P0 |
| No duplicate audit log for same term | AC2 | P0 |
| Low confidence match in `lowConfidenceMatches[]` | AC2 | P0 |
| Japanese katakana term found | AC3 | P0 |
| Japanese kanji compound found | AC3 | P1 |
| Chinese term found | AC4 | P0 |
| Chinese Traditional found | AC4 | P1 |
| French term: word-boundary fallback | AC5 | P0 |
| German term: word-boundary fallback | AC5 | P1 |
| European: Intl.Segmenter NOT called | AC5 | P1 |
| caseSensitive=true: different case → no match | AC1 | P1 |
| caseSensitive=false: different case → match | AC1 | P1 |

---

## Mock Requirements

| Mock | Path | Used In |
|------|------|---------|
| `server-only` | `vi.mock('server-only', () => ({}))` | glossaryMatcher.test.ts |
| `writeAuditLog` | `@/features/audit/actions/writeAuditLog` | glossaryMatcher.test.ts |
| `logger` (pino) | `@/lib/logger` | glossaryMatcher.test.ts |
| `getCachedGlossaryTerms` | `@/lib/cache/glossaryCache` | glossaryMatcher.test.ts |

---

## Implementation Checklist (DEV → GREEN Phase)

### Phase 1: Create Pure Utility Files (no deps)

- [ ] **Create** `src/lib/language/segmenterCache.ts`
  - [ ] Module-level `Map<string, Intl.Segmenter>` singleton cache
  - [ ] `getSegmenter(locale: string): Intl.Segmenter` — lazy init + cache
  - [ ] `clearSegmenterCache(): void` — for test isolation
  - [ ] `isNoSpaceLanguage(lang: string): boolean` — primary-subtag lookup
  - [ ] Run: `npx vitest run src/lib/language/segmenterCache.test.ts`
  - [ ] ✅ 10 tests pass → GREEN

- [ ] **Create** `src/lib/language/markupStripper.ts`
  - [ ] `export const MAX_SEGMENTER_CHUNK = 30_000`
  - [ ] `stripMarkup(text: string): string` — equal-length space replacement for `<tags>`, `{placeholders}`, `%formats%`
  - [ ] `chunkText(text: string): Array<{ chunk: string; offset: number }>` — splits at 30k boundary
  - [ ] Run: `npx vitest run src/lib/language/markupStripper.test.ts`
  - [ ] ✅ 13 tests pass → GREEN

### Phase 2: Create Types

- [ ] **Create** `src/features/glossary/matching/matchingTypes.ts`
  - [ ] `BoundaryConfidence = 'high' | 'low'`
  - [ ] `GlossaryTermMatch` type (termId, sourceTerm, expectedTarget, foundText, position, boundaryConfidence)
  - [ ] `GlossaryCheckResult` type (matches, missingTerms, lowConfidenceMatches)
  - [ ] `SegmentContext` type (segmentId, projectId, tenantId, userId?)
  - [ ] No runtime code — TypeScript types only (no test needed)

### Phase 3: Create Main Engine

- [ ] **Create** `src/features/glossary/matching/glossaryMatcher.ts`
  - [ ] `import 'server-only'` at top
  - [ ] Import from: `segmenterCache`, `markupStripper`, `matchingTypes`, `getCachedGlossaryTerms`, `writeAuditLog`, `logger`
  - [ ] `validateBoundary(cleanText, matchIndex, termLen, locale): BoundaryConfidence` — exported for testing
  - [ ] `validateEuropeanBoundary(text, matchIndex, termLen): BoundaryConfidence` — `\W` check
  - [ ] `findTermInText(targetText, searchTerm, lang, caseSensitive): Array<{position, confidence}>`
  - [ ] `logBoundaryMismatch(ctx, term, position)` — dedup with `Set<string>`
  - [ ] `checkGlossaryCompliance(sourceLang, targetLang, targetText, ctx): Promise<GlossaryCheckResult>`
  - [ ] Run: `npx vitest run src/features/glossary/matching/glossaryMatcher.test.ts`
  - [ ] ✅ 27 tests pass → GREEN

### Phase 4: Verify No Regressions

- [ ] Run full unit test suite: `npm run test:unit`
  - [ ] ✅ All 190+ existing tests still pass
  - [ ] ✅ New 50 tests pass
  - [ ] ✅ Total: 240+ tests GREEN

---

## Running Tests

```bash
# Run all 3 new test files
npx vitest run src/lib/language/segmenterCache.test.ts src/lib/language/markupStripper.test.ts src/features/glossary/matching/glossaryMatcher.test.ts

# Run individual test files
npx vitest run src/lib/language/segmenterCache.test.ts
npx vitest run src/lib/language/markupStripper.test.ts
npx vitest run src/features/glossary/matching/glossaryMatcher.test.ts

# Watch mode (during development)
npx vitest --project unit src/lib/language/

# Full unit suite (after all files implemented)
npm run test:unit
```

---

## Red-Green-Refactor Workflow

### 🔴 RED Phase (Complete) ✅

**TEA Agent Responsibilities:**
- ✅ All 50 tests written and failing (module not found)
- ✅ Mock requirements documented (vi.mock patterns)
- ✅ data-testid: N/A (pure library)
- ✅ Implementation checklist created

---

### 🟢 GREEN Phase (DEV Team)

**DEV Agent Responsibilities:**

1. Pick Phase 1: Create `segmenterCache.ts` → run 10 tests → all GREEN
2. Pick Phase 1: Create `markupStripper.ts` → run 13 tests → all GREEN
3. Pick Phase 2: Create `matchingTypes.ts` (types only)
4. Pick Phase 3: Create `glossaryMatcher.ts` → run 27 tests → all GREEN
5. Run full suite → 240+ tests GREEN

**One file at a time** — each file makes a specific set of tests pass.

---

### ♻️ REFACTOR Phase (DEV Team — After All GREEN)

1. Verify all tests pass
2. Check: NFKC normalization path optimizations
3. Check: Chunk range filter in `validateBoundary` correct
4. Ensure audit log deduplication Set is properly scoped per `checkGlossaryCompliance` call
5. Run full suite after each refactor

---

## Knowledge Base References Applied

| Fragment | Applied? |
|----------|----------|
| `data-factories.md` | ✅ `buildGlossaryTerm(overrides?)` inline factory |
| `test-quality.md` | ✅ Determinism, isolation, mockReset, unique IDs |
| `test-levels-framework.md` | ✅ Unit = correct level for pure library |
| `api-testing-patterns.md` | ✅ Service logic → unit preferred |
| `fixture-architecture.md` | ➖ N/A (no UI fixtures) |
| `network-first.md` | ➖ N/A (no network requests) |
| `component-tdd.md` | ➖ N/A (no UI components) |

---

## Completion Summary

| Item | Value |
|------|-------|
| Story | 1.5 — Glossary Matching Engine for No-space Languages |
| Primary Test Level | **Unit (Vitest)** |
| Unit Test Files | 3 |
| Total Tests | **50** (10 + 13 + 27) |
| Priority Coverage | P0: 22 tests, P1: 28 tests |
| AC Coverage | AC1 ✅ AC2 ✅ AC3 ✅ AC4 ✅ AC5 ✅ |
| RED Phase Status | **VERIFIED** — 3/3 suites fail with "Cannot find module" |
| Checklist Path | `_bmad-output/test-artifacts/atdd-checklist-1-5.md` |
| Next Step | `bmad-agent-bmm-dev` to implement Story 1.5 |

*Step 5 complete — ATDD workflow done.*
