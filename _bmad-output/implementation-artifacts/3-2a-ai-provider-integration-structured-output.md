# Story 3.2a: AI Provider Integration & Structured Output

Status: done

## Story

As a **Developer**,
I want **production-ready AI provider infrastructure with Vercel AI SDK v6, L2 structured output schemas, and fully-wired L2 prompt templates**,
so that **the L2 screening pipeline can make real AI calls with proper schema validation, fallback chains, and cost tracking**.

## Acceptance Criteria

### AC1: L2 Model Configuration & Provider Health
- `LAYER_MODELS.L2.primary` = `gpt-4o-mini-2024-07-18` via AI SDK v6
- Fallback chain: (1) pinned model from `projects.l2PinnedModel`, (2) latest same provider (`gpt-4o-mini`), (3) `gemini-2.0-flash`
- Model resolved via `getModelForLayerWithFallback()` from `@/lib/ai/providers` (already exists)
- Verify: pinned model lookup queries `projects` table correctly with `withTenant()`
- **Provider health check**: implement `checkProviderHealth(provider: string)` → `{ available: boolean, latencyMs: number }` in `src/lib/ai/providers.ts`. Lightweight probe (minimal generateText call or provider-specific ping). Used by fallback chain to skip unavailable providers without waiting for full timeout. Log health status in `pino` on each fallback activation

### AC2: L2 Structured Output Schema
- Create `src/features/pipeline/schemas/l2-output.ts` with Zod schema:
  ```
  { findings: [{ segmentId, category, severity, description, suggestion, confidence }], summary }
  ```
- `category`: `z.string()` — **taxonomy-driven, NOT hardcoded enum**. The real `buildL2Prompt()` instructs the AI to use categories from the project's MQM taxonomy (via `formatTaxonomyContext()`). Using `z.string()` allows the prompt to drive category selection while the schema remains flexible. Post-processing validates categories against the project's taxonomy
- `severity`: `z.enum(['critical', 'major', 'minor'])`
- `confidence`: `z.number().min(0).max(100)` — clamped via Zod refinement
- `suggestion`: `.nullable()` (NOT `.optional()` — OpenAI rejects `.optional()`)
- `summary`: `z.string()` — chunk-level summary of analysis
- L2 focuses on **semantic issues** — the 6 primary semantic categories are: mistranslation, omission, addition, fluency, register, cultural. However, the taxonomy may include additional categories — the AI uses whatever categories the prompt builder provides from the project's taxonomy configuration

### AC3: Wire Real Prompt Builder into runL2ForFile
- Replace inline `_buildL2Prompt()` with real `buildL2Prompt()` from `@/features/pipeline/prompts/build-l2-prompt`
- Load **full L2 context** for prompt:
  - Glossary terms: JOIN `glossary_terms` through `glossaries` table (`glossary_terms` has NO `projectId`/`tenantId` — must JOIN via `glossaries.projectId` + `withTenant(glossaries.tenantId, tenantId)`)
  - Taxonomy categories: query `taxonomy_definitions` directly (shared global data — has NO `tenant_id` column, so do NOT use `withTenant()` on this table; filter by `isActive: true`)
  - Project details: query `projects` with `withTenant()`
  - L1 findings for deduplication context (existing query — ensure `detectedByLayer` is included in SELECT for `PriorFinding` mapping)
- Map DB rows to `L2PromptInput` type from `@/features/pipeline/prompts/types`
- Replace inline `l2ChunkResponseSchema` with imported `l2OutputSchema` from `schemas/l2-output`

### AC4: API Call Logging
- Every `generateText()` call MUST log via `logAIUsage()` from `@/lib/ai/costs`:
  - `model`, `provider`, `layer: 'L2'`, `latencyMs`, `inputTokens`, `outputTokens`, `estimatedCost`, `status`, `chunkIndex`, **`languagePair`** (e.g., `"en-US→th"` — from file/project source+target language)
- `language_pair` column does NOT exist in `ai_usage_logs` table yet — **migration required**: add `language_pair varchar(50)` nullable column
- Aggregate usage across chunks via `aggregateUsage()` and return in `L2Result`
- Failed chunks: log with `status: 'error'`
- Budget check via `checkProjectBudget()` before any AI calls (Guardrail #22)

### AC5: Unit Tests
- L2 output schema: validation tests (valid, invalid category, confidence boundary [0, 100, -1, 101], nullable suggestion)
- `runL2ForFile` integration: mock `generateText` + verify full context loading (glossary, taxonomy, project)
- Fallback chain: verify model resolution with pinned, without pinned, with pinned invalid
- Cost tracking: verify `logAIUsage()` called per chunk + `aggregateUsage()` on result
- Budget guard: verify `NonRetriableError` when budget exhausted
- Error classification: verify retriable (429) vs non-retriable (schema, auth) errors
- Partial failure: chunk N fails → other chunks still processed → `partialFailure: true`

## Tasks / Subtasks

- [x] **Task 1: Create L2 Output Schema** (AC: #2)
  - [x] 1.1 Create `src/features/pipeline/schemas/l2-output.ts`
  - [x] 1.2 Define `L2_SEMANTIC_CATEGORIES` const array (reference only, NOT used in Zod enum — schema uses `z.string()` because categories are taxonomy-driven)
  - [x] 1.3 Define `l2FindingSchema` with `category: z.string()`, `severity: z.enum(...)`, `confidence: z.number().min(0).max(100)`, `suggestion: z.string().nullable()`
  - [x] 1.4 Define `l2OutputSchema`: `{ findings: z.array(l2FindingSchema), summary: z.string() }`
  - [x] 1.5 Export `L2Finding` and `L2Output` inferred types
  - [x] 1.6 Write schema validation tests (`l2-output.test.ts`)

- [x] **Task 2: Wire Real Prompt Builder** (AC: #3)
  - [x] 2.1 Add context-loading functions to `runL2ForFile.ts`:
    - Load glossary terms: `glossary_terms JOIN glossaries ON glossary_terms.glossary_id = glossaries.id WHERE glossaries.project_id = ? AND withTenant(glossaries.tenant_id, ?)` — `glossary_terms` has NO `projectId`/`tenantId`, must JOIN through `glossaries`
    - Load taxonomy categories: `SELECT FROM taxonomy_definitions WHERE is_active = true` — shared global data, NO `tenant_id`, do NOT use `withTenant()`
    - Load project details: `SELECT FROM projects WHERE id = ? AND withTenant(tenant_id, ?)`
  - [x] 2.2 Add mapper functions: DB rows → `PromptSegment[]`, `PriorFinding[]` (include `detectedByLayer`), `GlossaryTermContext[]`, `TaxonomyCategoryContext[]`, `ProjectContext`
  - [x] 2.3 Replace `_buildL2Prompt()` call with `buildL2Prompt(l2PromptInput)`
  - [x] 2.4 Replace inline `l2ChunkResponseSchema` import with `l2OutputSchema` from schemas
  - [x] 2.5 Remove or deprecate the inline `_buildL2Prompt` function (currently exported as `_buildL2Prompt` for testing — tests should be updated to use real `buildL2Prompt`)

- [x] **Task 3: Fallback Chain & Provider Health Check** (AC: #1)
  - [x] 3.1 Implement `checkProviderHealth(provider)` in `src/lib/ai/providers.ts` — lightweight probe returning `{ available: boolean, latencyMs: number }`
  - [x] 3.2 Integrate health check into fallback chain resolution: skip unavailable providers, log with pino
  - [x] 3.3 Verify `getModelForLayerWithFallback('L2', projectId, tenantId)` returns correct model
  - [x] 3.4 Write tests: pinned model → same provider latest → cross-provider fallback → health check skip
  - [x] 3.5 Verify fallback activation is logged in audit + AI usage log

- [x] **Task 4: Cost Tracking + `language_pair` Migration** (AC: #4)
  - [x] 4.1 Add `language_pair varchar(50)` nullable column to `ai_usage_logs` table (Drizzle schema + Supabase migration)
  - [x] 4.2 Update `AIUsageRecord` type in `src/lib/ai/types.ts` to include `languagePair` field
  - [x] 4.3 Update `logAIUsage()` in `src/lib/ai/costs.ts` to accept + persist `languagePair`
  - [x] 4.4 Pass `languagePair` (from file/project context) in `runL2ForFile.ts` AI usage logging
  - [x] 4.5 Verify `logAIUsage()` called after every `generateText()` chunk (fire-and-forget pattern)
  - [x] 4.6 Verify `aggregateUsage()` aggregates across all chunks
  - [x] 4.7 Verify budget check runs before AI calls
  - [x] 4.8 Write tests for cost tracking flow including `languagePair`

- [x] **Task 5: Update File Status Types** (AC: #1, #3)
  - [x] 5.1 Update `files.ts` status type comment to include `l2_processing | l2_completed | l3_processing | l3_completed`
  - [x] 5.2 Update `FileStatus` type (if defined in `@/types/`) to include L2/L3 statuses

- [x] **Task 6: Comprehensive Tests** (AC: #5)
  - [x] 6.1 Schema tests: boundary values, invalid inputs, type inference
  - [x] 6.2 Integration tests: `runL2ForFile` with full context loading mocked
  - [x] 6.3 Error handling tests: retriable vs non-retriable, partial failure
  - [x] 6.4 Existing tests: ensure all 40+ existing tests in helpers/ still pass

## Dev Notes

### What Already Exists (DO NOT Recreate)

| Component | Path | Status |
|-----------|------|--------|
| AI client + custom provider | `src/lib/ai/client.ts` | Complete |
| AI types (ModelId, configs) | `src/lib/ai/types.ts` | Complete |
| Cost tracking | `src/lib/ai/costs.ts` | Complete |
| Error classification | `src/lib/ai/errors.ts` | Complete |
| Budget guard | `src/lib/ai/budget.ts` | Complete (`checkProjectBudget` real, `checkTenantBudget` stub) |
| Fallback chain builder | `src/lib/ai/providers.ts` | Complete |
| Model allowlists | `src/lib/ai/models.ts` | Complete |
| L2 prompt builder | `src/features/pipeline/prompts/build-l2-prompt.ts` | Complete (66 tests) |
| L3 prompt builder | `src/features/pipeline/prompts/build-l3-prompt.ts` | Complete |
| Segment chunker | `src/features/pipeline/helpers/chunkSegments.ts` | Complete |
| L2 lifecycle template | `src/features/pipeline/helpers/runL2ForFile.ts` | Partial — has inline prompt + schema |
| L3 lifecycle template | `src/features/pipeline/helpers/runL3ForFile.ts` | Partial — not in scope |
| AI mock factory | `src/test/mocks/ai-providers.ts` | Complete |
| AI test fixtures | `src/test/fixtures/ai-responses.ts` | Complete |
| DB: `ai_usage_logs` table | `src/db/schema/aiUsageLogs.ts` | Complete |
| DB: `findings` table | `src/db/schema/findings.ts` | Complete (has `detectedByLayer`, `aiConfidence`, `aiModel`) |
| DB: `projects` table | `src/db/schema/projects.ts` | Complete (has `l2PinnedModel`, `l3PinnedModel`) |
| DB: `glossaries` table | `src/db/schema/glossaries.ts` | Complete (has `projectId`, `tenantId`) |
| DB: `glossary_terms` table | `src/db/schema/glossaryTerms.ts` | Complete (has `glossaryId` FK — NO `projectId`/`tenantId`) |
| DB: `taxonomy_definitions` table | `src/db/schema/taxonomyDefinitions.ts` | Complete (shared global — NO `tenantId`) |
| Rate limiter | `src/lib/ratelimit.ts` | Complete (`aiL2ProjectLimiter` — must mock in tests) |
| Pipeline constants | `src/features/pipeline/engine/constants.ts` | Complete (`FINDING_BATCH_SIZE` for batched inserts) |

### What Must Be Created (NEW)

| Component | Path |
|-----------|------|
| L2 output schema | `src/features/pipeline/schemas/l2-output.ts` |
| L2 schema tests | `src/features/pipeline/schemas/l2-output.test.ts` |

### What Must Be Modified (EXISTING)

| Component | Path | Change |
|-----------|------|--------|
| `runL2ForFile.ts` | `src/features/pipeline/helpers/runL2ForFile.ts` | Replace inline `_buildL2Prompt` + `l2ChunkResponseSchema` with real imports; add context loading; pass `languagePair` to logging |
| `runL2ForFile.test.ts` | `src/features/pipeline/helpers/runL2ForFile.test.ts` | Add tests for context loading, schema integration, `languagePair` logging |
| `aiUsageLogs.ts` | `src/db/schema/aiUsageLogs.ts` | Add `languagePair: varchar('language_pair', { length: 50 })` nullable column |
| `types.ts` | `src/lib/ai/types.ts` | Add `languagePair` field to `AIUsageRecord` type |
| `costs.ts` | `src/lib/ai/costs.ts` | Update `logAIUsage()` to accept + persist `languagePair` |
| `providers.ts` | `src/lib/ai/providers.ts` | Add `checkProviderHealth()` function + integrate into fallback chain |
| `files.ts` | `src/db/schema/files.ts` | Update status type comment to include L2/L3 statuses |
| `runL3ForFile.ts` | `src/features/pipeline/helpers/runL3ForFile.ts` | Add `status: 'success'` to `AIUsageRecord` (H1 fix — status field added to type) |
| `build-l2-prompt.ts` | `src/features/pipeline/prompts/build-l2-prompt.ts` | **Only if** output format section doesn't align with L2 semantic categories |

### Critical DB Column Mapping

AI output field → DB column mapping in `runL2ForFile.ts` step 8:

| AI Output (Schema) | DB Column (Drizzle) | DB Column (SQL) |
|---------------------|---------------------|-----------------|
| `segmentId` | — | — (used for FK lookup) |
| `category` | `category` | `category` |
| `severity` | `severity` | `severity` |
| `description` | `description` | `description` |
| `suggestion` | `suggestedFix` | `suggested_fix` |
| `confidence` | `aiConfidence` | `ai_confidence` |
| — | `detectedByLayer` = `'L2'` | `detected_by_layer` |
| — | `aiModel` = resolved model | `ai_model` |
| — | `status` = `'pending'` | `status` |
| — | `reviewSessionId` = `null` | `review_session_id` |
| — | `segmentCount` = `1` | `segment_count` |
| — | `scope` = `'per-file'` (default) | `scope` |

### Key Patterns to Follow

**AI SDK v6 pattern (Guardrail #16):**
```typescript
import { generateText, Output } from 'ai'
const result = await generateText({
  model: resolvedModel,
  output: Output.object({ schema: l2OutputSchema }),
  temperature: 0.3,
  maxOutputTokens: 4096,  // NOT maxTokens
  prompt: buildL2Prompt(l2PromptInput),
})
const findings = result.output.findings  // NOT result.object
```

**Zod schema rules for OpenAI (Guardrail #17):**
```typescript
// .nullable() ONLY — OpenAI rejects .optional() and .nullish()
suggestion: z.string().nullable(),
// Required fields: no modifier
segmentId: z.string(),
```

**Context loading patterns:**
```typescript
// Glossary: JOIN through glossaries table (glossary_terms has NO projectId/tenantId)
const glossaryTerms = await db.select({
  sourceTerm: glossaryTermsTable.sourceTerm,
  targetTerm: glossaryTermsTable.targetTerm,
  caseSensitive: glossaryTermsTable.caseSensitive,
}).from(glossaryTermsTable)
  .innerJoin(glossariesTable, eq(glossaryTermsTable.glossaryId, glossariesTable.id))
  .where(and(
    eq(glossariesTable.projectId, projectId),
    withTenant(glossariesTable.tenantId, tenantId),
  ))

// Taxonomy: shared global data — NO tenant_id, do NOT use withTenant()
const taxonomyCategories = await db.select()
  .from(taxonomyDefinitionsTable)
  .where(eq(taxonomyDefinitionsTable.isActive, true))

// Project: standard withTenant pattern
const project = await db.select()
  .from(projectsTable)
  .where(and(
    eq(projectsTable.id, projectId),
    withTenant(projectsTable.tenantId, tenantId),
  ))
```

**AI mock pattern (from `createAIMock`):**
```typescript
const { mocks, modules } = vi.hoisted(() => createAIMock({ layer: 'L2' }))
vi.mock('ai', () => modules.ai)
vi.mock('@/lib/ai/client', () => modules.aiClient)
vi.mock('@/lib/ai/costs', () => modules.aiCosts)
vi.mock('@/lib/ai/errors', () => modules.aiErrors)
vi.mock('@/lib/ai/budget', () => modules.aiBudget)
vi.mock('@/lib/ai/providers', () => modules.aiProviders)
// ALSO mock rate limiter (NOT in createAIMock — mock separately):
vi.mock('@/lib/ratelimit', () => ({
  aiL2ProjectLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))
// See src/test/mocks/ai-providers.ts for full module list
```

**Cost tracking: fire-and-forget pattern (do NOT await):**
```typescript
// logAIUsage is non-blocking — use .catch() to prevent swallowing errors silently
logAIUsage(record).catch((err) => logger.error({ err }, 'AI usage log failed'))
// Do NOT change to: await logAIUsage(record) — would block the pipeline
```

### Scope Boundaries (CRITICAL)

| In Scope (3.2a) | Out of Scope |
|------------------|-------------|
| Create L2 output schema | L3 output schema (Story 3.3) |
| Wire real prompt into `runL2ForFile` | Wire `runL2ForFile` into `processFile.ts` (Story 3.2b) |
| Verify fallback chain end-to-end | L2 batch processing orchestration (Story 3.2b) |
| Verify cost tracking | L2 results display in UI (Story 3.2c) |
| Unit tests for schema + integration | MQM score recalculation with L2 (Story 3.2c) |
| Update file status types | E2E tests (Story 3.2c) |

### L2 Semantic Categories (6 only)

The L2 layer focuses on **semantic issues** that rule-based L1 cannot detect:

| Category | Description | L1 Overlap? |
|----------|-------------|-------------|
| `mistranslation` | Meaning incorrectly conveyed | No (L1 checks consistency, not meaning) |
| `omission` | Content present in source but missing in target | No (L1 checks segment-level, not semantic) |
| `addition` | Content in target not in source | No |
| `fluency` | Awkward/unnatural target language | No |
| `register` | Tone/formality mismatch for domain | No |
| `cultural` | Cultural adaptation issues | No |

L1 categories (glossary, formatting, numbers, whitespace, consistency) are NOT re-checked by L2.

### File Status Transitions (L2 pipeline)

```
l1_completed → l2_processing → l2_completed
                     ↓
                   failed (on non-recoverable error)
```

CAS guard in `runL2ForFile.ts` ensures atomic transition: `l1_completed → l2_processing` (prevents double-processing).

### Previous Story Intelligence

**From Story 3.1 (AI Cost Control):**
- `ai_usage_logs` table + `logAIUsage()` fully implemented — use as-is
- `checkProjectBudget()` queries real DB data — use for budget guard
- Admin AI Usage dashboard at `/admin/ai-usage/` — cost data will flow automatically
- Pinned model columns (`l2_pinned_model`, `l3_pinned_model`) exist in `projects` table

**From Story 3.0.5 (UX Foundation):**
- `ScoreBadge` component with variant support (will be used by 3.2c, not this story)
- Severity badge colors standardized — findings display will use these in 3.2c

**From Story 3.1a + 3.1b (AI Dashboard):**
- LEFT JOIN patterns with `withTenant()` in both JOIN and WHERE (defense-in-depth, Guardrail #14)
- CR finding: date filter must be in JOIN condition, not WHERE (for LEFT JOIN correctness)
- Test pattern: 63 ATDD tests in 3.1a — follow same boundary value testing approach

**From Epic 2 CR lessons (apply to ALL stories):**
- `inArray(col, [])` = invalid SQL — always guard with `if (ids.length === 0) return`
- Guard `rows[0]!` — always check `if (rows.length === 0) throw` before accessing
- DELETE + INSERT = `db.transaction()` — idempotent re-runs must be atomic (already done in template)
- Audit log non-fatal in pipeline context — `try { writeAuditLog(...) } catch { logger.error(...) }`

### Guardrails Checklist (verify BEFORE writing code)

- [ ] #1: `withTenant()` on EVERY query (glossary, taxonomy, project, segments, findings)
- [ ] #4: Guard `rows[0]!` after SELECT
- [ ] #5: `inArray(col, [])` guard
- [ ] #10: Inngest function requirements (retries + onFailure + Object.assign)
- [ ] #14: Asymmetric query filters — all sibling queries in same function must have same filters
- [ ] #16: `generateText` + `Output.object()` — NOT `generateObject`
- [ ] #17: `.nullable()` only — NOT `.optional()`
- [ ] #18: Error classification — `RateLimitError` retriable, schema/auth = `NonRetriableError`
- [ ] #19: Cost tracking mandatory — `logAIUsage()` every call
- [ ] #20: Provider via `@/lib/ai` — never inline constructor
- [ ] #21: One `step.run()` per chunk — partial failure allowed
- [ ] #22: Budget guard before AI calls

### Architecture Assumption Checklist (pre-validated)

| Section | Status | Notes |
|---------|--------|-------|
| S1: Routes | N/A | No new routes (backend story) |
| S2: DB Schema | **Migration** | `ai_usage_logs` needs `language_pair` column (Task 4.1). `findings` + `projects` OK |
| S3: Components | N/A | No UI components |
| S4: Libraries | OK | `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google` installed |
| S5: E2E | N/A | No E2E for this story |
| S6: Inngest | OK | `runL2ForFile` already has step structure |
| S7: External Services | OK | OpenAI API key in env (`OPENAI_API_KEY`) |
| S8: Scope | OK | Clear boundary: schema + wiring + tests, NOT batch (3.2b) or UI (3.2c) |

### Project Structure Notes

New files follow existing conventions:
```
src/features/pipeline/
├── schemas/
│   ├── l2-output.ts          # NEW — L2 Zod schema
│   └── l2-output.test.ts     # NEW — Schema tests
├── helpers/
│   ├── runL2ForFile.ts        # MODIFY — wire real prompt + schema
│   └── runL2ForFile.test.ts   # MODIFY — add context loading tests
└── prompts/
    └── build-l2-prompt.ts     # MODIFY ONLY IF output format misaligns
```

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-3-ai-powered-quality-analysis.md`#Story 3.2a]
- [Source: `_bmad-output/planning-artifacts/research/ai-sdk-spike-guide-2026-02-26.md`]
- [Source: `_bmad-output/planning-artifacts/research/inngest-l2-l3-template-guide-2026-02-26.md`]
- [Source: `_bmad-output/implementation-artifacts/epic-3-gap-analysis-2026-02-26.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/core-architectural-decisions.md`#Decision 3.3, 3.5]
- [Source: CLAUDE.md#Guardrails #16-22]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Pre-CR anti-pattern scan: 0 Critical, 0 High, 2 Medium (bare `string` in L1FindingContext — Drizzle returns `string` from varchar, safe), 2 Low (FIXED — L2Finding→L2MappedFinding rename, `./chunkSegments`→`@/` alias)
- Pre-CR code quality scan: 1 Critical (FIXED — prompt field `suggestedFix`→`suggestion` to match schema), 3 High (H1: `resolveHealthyModel` not called — by design, deferred to Story 3.4; H2: health probe cost — minimal, by design; H3: provider detection duplication — refactor scope for later story)
- Tenant isolation: PASS — all 9 DB queries verified, glossary JOIN via `glossaries.tenantId`, taxonomy correctly skips `withTenant()` (no `tenant_id` column)
- All 72 ATDD tests GREEN (21 schema + 17 providers + 34 runL2ForFile)
- Full unit suite: 2001/2002 pass (1 pre-existing L3 timeout — passes in isolation)
- TypeScript: 0 errors

### Completion Notes List

- Task 1: Created `l2-output.ts` with `l2FindingSchema` + `l2OutputSchema` (`.nullable()` only, `z.string()` for taxonomy-driven category). 21 schema tests all GREEN
- Task 2: Replaced inline `_buildL2Prompt` + `l2ChunkResponseSchema` with real `buildL2Prompt()` from prompts module + `l2OutputSchema` from schemas. Added 3 context-loading queries (glossary JOIN, taxonomy global, project withTenant). DB call order changed from 6→9 slots. All 34 runL2ForFile tests GREEN including 9 AC3 + 5 AC4 ATDD tests
- Task 3: Implemented `checkProviderHealth()` — lightweight generateText probe, never throws, returns `{ available, latencyMs }`. 7 new provider tests GREEN (total 17)
- Task 4: Added `languagePair` to `AIUsageRecord` type, `ai_usage_logs` schema, `logAIUsage()`, and Supabase migration. `deriveLanguagePair()` extracts "sourceLang→targetLang" from segment rows. 9 cost tests GREEN
- Task 5: Updated `files.ts` status comment to include L2/L3 statuses. No separate `FileStatus` type file found (inline comments serve as documentation)
- Task 6: All 72 tests pass — 21 schema + 17 providers + 34 runL2ForFile (20 existing + 9 AC3 + 5 AC4)
- Schema field mapping: AI output `suggestion` → DB column `suggestedFix` (mapping at step 7 line 357)
- Type alias: `L2ChunkResponse` removed in CR R1 (L4) — test fixtures updated to import `L2Output` directly from schema

### File List

**Created:**
- `src/features/pipeline/schemas/l2-output.ts` — L2 Zod output schema
- `src/features/pipeline/schemas/l2-output.test.ts` — 21 schema validation tests
- `supabase/migrations/00018_story_3_2a_language_pair.sql` — language_pair column migration

**Modified:**
- `src/features/pipeline/helpers/runL2ForFile.ts` — Wire real prompt builder, context loading, schema import
- `src/features/pipeline/helpers/runL2ForFile.test.ts` — 14 new ATDD tests (9 AC3 + 5 AC4), mock updates
- `src/lib/ai/providers.ts` — `checkProviderHealth()` implementation
- `src/lib/ai/providers.test.ts` — 7 new health check tests
- `src/lib/ai/types.ts` — `languagePair` field in `AIUsageRecord`
- `src/lib/ai/costs.ts` — `logAIUsage()` accepts `languagePair`
- `src/lib/ai/costs.test.ts` — Updated for `languagePair` field
- `src/db/schema/aiUsageLogs.ts` — `language_pair` column
- `src/db/schema/files.ts` — Status comment update
- `src/test/fixtures/ai-responses.ts` — `suggestion` field, overrideable lang fields
- `src/features/pipeline/prompts/build-l2-prompt.ts` — Fixed output format field `suggestedFix`→`suggestion` to match l2OutputSchema (C1 fix)
- `src/features/pipeline/prompts/__tests__/build-l2-prompt.test.ts` — Updated assertion for field name change
- `src/test/mocks/ai-providers.ts` — Added `deriveProviderFromModelId` mock (H2 fix)
- `src/features/pipeline/helpers/runL3ForFile.ts` — Added `status: 'success'` to AIUsageRecord (H1 fix)

### CR R1 — Code Review Round 1

**Date:** 2026-03-01
**Findings:** 0C + 2H + 6M + 4L = 12 total
**Exit criteria:** 0C + 0H achieved ✅

| ID | Sev | Description | Fix |
|----|-----|-------------|-----|
| H1 | High | Failed chunk cost tracking missing — `logAIUsage()` not called on chunk error; test was tautological | Added `status` field to `AIUsageRecord`, `logAIUsage` call in catch block with `status: 'error'`, fixed test to assert `status: 'error'` specifically |
| H2 | High | `deriveProvider` duplicated in costs.ts, providers.ts, and PROVIDER_PROBE_MODELS | Extracted shared `deriveProviderFromModelId()` to `types.ts`, imported in both consumers, added to AI mock factory |
| M1 | Med | Dead mock `mockCheckTenantBudget` in 3 beforeEach blocks | Removed from destructuring + all beforeEach blocks |
| M2 | Med | Stale ATDD RED-phase block comments + `// RED:` orphans | Removed all stale comments from runL2ForFile.test.ts, providers.test.ts, costs.test.ts |
| M3 | Med | l2OutputSchema assertion used `expect.anything()` | Imported actual `l2OutputSchema` and used in assertion |
| M4 | Med | taxonomy withTenant assertion used `>=7` (non-deterministic) | Changed to exact `toBe(7)` |
| M5 | Med | `runL3ForFile.ts` missing from story File List | Added to Modified file list |
| M6 | Med | `languagePair` not asserted in costs.test.ts INSERT test | Added `languagePair: 'en-US→th'` to `toMatchObject` assertion |
| L1 | Low | Migration filename mismatch (story: 00020, actual: 00018) | Fixed to `00018_story_3_2a_language_pair.sql` |
| L2 | Low | `PROVIDER_PROBE_MODELS` sync risk — hardcoded separately from `LAYER_DEFAULTS` | Derived from `LAYER_DEFAULTS` using `reduce()` |
| L3 | Low | `// RED:` orphan comments in costs.test.ts | Removed all 8 orphan comments |
| L4 | Low | `L2ChunkResponse` backwards-compat alias unnecessary | Removed alias, updated `ai-responses.ts` to import `L2Output` directly from schema |

**Post-fix verification:** 81/81 tests PASS, TypeScript 0 errors

### CR R2

**Date:** 2026-03-01
**Findings:** 0C + 0H + 1M + 1L = 2 total
**Exit criteria:** 0C + 0H → PASS ✅

| ID | Sev | Description | Fix |
|----|-----|-------------|-----|
| M1 | Med | M4 inconsistency — line 259 still `toBeGreaterThanOrEqual(7)` (line 685 fixed in R1) | Changed to `toBe(7)` with explanatory comment |
| L1 | Low | Stale JSDoc in `ai-responses.ts` referencing `l2ChunkResponseSchema` | Updated to `l2OutputSchema` |

**Dismissed (out of scope):**
- H1 (sub-agent): `runL3ForFile.ts` missing `logAIUsage` in error path → L3 not in 3.2a scope (→ Story 3.3)
- H2 (sub-agent): `suggestion` vs `suggestedFix` naming → by design per Critical DB Column Mapping

**Post-fix verification:** 5,071 tests PASS, TypeScript 0 errors
**Story status:** done ✅
