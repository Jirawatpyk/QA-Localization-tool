# Back-Translation Spike: Epic 5 Story 5.1 — Language Bridge

**Date:** 2026-03-26
**Owner:** Dev Team
**Status:** Complete
**Story:** 5.1 — Language Bridge: Back-translation & Contextual Explanation
**FRs:** FR29, FR35, FR38, FR39

---

## 1. Executive Summary

Story 5.1 adds a **LanguageBridge sidebar panel** that shows AI-generated back-translation, contextual explanation, and confidence score for each focused segment. This enables non-native reviewers to understand target text without reading the target language.

**Key decisions needed:**
- Model selection (gpt-4o-mini vs claude-sonnet)
- Caching strategy (DB table vs in-memory)
- Trigger mechanism (on-focus vs batch pre-compute)
- Cost management integration

**Recommendation:** Use **gpt-4o-mini** for back-translation (fast, cheap, sufficient quality for translation tasks). Cache in a dedicated DB table with 24h TTL. Trigger on segment focus with debounce. Estimated cost: **$0.04-0.08 per 500-segment session**.

---

## 2. Existing AI Infrastructure Analysis

### 2.1 Provider Setup (`src/lib/ai/client.ts`)

The project uses `customProvider` from Vercel AI SDK with two models:
- `l2-screening` -> `gpt-4o-mini` (OpenAI)
- `l3-analysis` -> `claude-sonnet-4-5-20250929` (Anthropic)

Back-translation needs a new model alias registered in the same `qaProvider`:

```typescript
// Proposed addition to client.ts
export const qaProvider = customProvider({
  languageModels: {
    'l2-screening': openai('gpt-4o-mini'),
    'l3-analysis': anthropic('claude-sonnet-4-5-20250929'),
    'back-translation': openai('gpt-4o-mini'),  // NEW — same model, distinct alias
  },
})
```

Using a distinct alias lets us swap models per feature without affecting L2 screening. Both aliases point to the same model instance (no extra cost).

### 2.2 Cost Tracking (`src/lib/ai/costs.ts`)

Existing `logAIUsage()` writes to `ai_usage_logs` table. Back-translation will use the same system with a new layer value.

**AILayer type extension needed:**

```typescript
// Current
export type AILayer = 'L2' | 'L3'

// Proposed
export type AILayer = 'L2' | 'L3' | 'BT'  // BT = Back-Translation
```

The `ai_usage_logs.layer` column is `varchar(10)` — no migration needed, just add the new value to the union type.

### 2.3 Budget Integration (`src/lib/ai/budget.ts`)

`checkProjectBudget()` already sums ALL `ai_usage_logs` for the current month. Back-translation costs will automatically be included once logged with the project's `tenantId`/`projectId`. No changes needed — budget guard works as-is.

### 2.4 Prompt Patterns (`src/features/pipeline/prompts/`)

Existing prompts follow a modular builder pattern:
- `buildL2Prompt()` / `buildL3Prompt()` assemble sections from sub-modules
- Language-specific instructions via `getLanguageInstructions(targetLang)`
- Segments formatted as `[uuid] (#N, sourceLang->targetLang)\nSource: ...\nTarget: ...`

Back-translation prompt will follow the same modular pattern but is simpler (single segment, no taxonomy/glossary context needed).

---

## 3. Structured Output Schema Design

### 3.1 Zod Schema (Guardrail #17: `.nullable()` only)

```typescript
import { z } from 'zod'

export const backTranslationSchema = z.object({
  backTranslation: z.string(),
  contextualExplanation: z.string(),
  confidence: z.number().min(0).max(1),
  languageNotes: z.array(z.object({
    noteType: z.enum([
      'tone_marker',
      'politeness_particle',
      'compound_word',
      'cultural_adaptation',
      'register',
      'idiom',
      'ambiguity',
    ]),
    originalText: z.string(),
    explanation: z.string(),
  })),
  translationApproach: z.string().nullable(),
})

export type BackTranslationResult = z.infer<typeof backTranslationSchema>
```

**Field explanations:**

| Field | Type | Purpose |
|-------|------|---------|
| `backTranslation` | `string` | Target text translated back to source language |
| `contextualExplanation` | `string` | 2-3 sentences on nuances, register, cultural context |
| `confidence` | `number (0-1)` | AI confidence in back-translation accuracy |
| `languageNotes` | `array` | Language-specific annotations (Thai particles, tone markers, etc.) |
| `languageNotes[].noteType` | `enum` | Category of the note for UI grouping/icons |
| `languageNotes[].originalText` | `string` | The specific text being annotated |
| `languageNotes[].explanation` | `string` | Human-readable explanation |
| `translationApproach` | `string \| null` | Optional note on whether translation is literal, adapted, etc. |

### 3.2 Why This Schema Works

1. **No `.optional()` fields** — compliant with OpenAI structured output (Guardrail #17)
2. **`languageNotes` as array** — flexible for any number of language-specific annotations
3. **`noteType` enum** — enables UI to show appropriate icons (e.g., speech bubble for particles, musical note for tone markers)
4. **`confidence` as 0-1 float** — matches AC requirement, enables threshold comparison
5. **`translationApproach` nullable** — not always relevant, but useful when AI detects significant adaptation

---

## 4. Prompt Design

### 4.1 Back-Translation Prompt Builder

```typescript
import { getLanguageInstructions } from '@/features/pipeline/prompts/language-instructions'

export type BackTranslationPromptInput = {
  sourceText: string
  targetText: string
  sourceLang: string
  targetLang: string
  segmentNumber: number
  surroundingContext: {
    previousSource: string | null
    previousTarget: string | null
    nextSource: string | null
    nextTarget: string | null
  } | null
}

export function buildBackTranslationPrompt(input: BackTranslationPromptInput): string {
  const sections: string[] = [
    SYSTEM_ROLE_BT,
    formatSegment(input),
    input.surroundingContext ? formatContext(input.surroundingContext) : '',
    getLanguageInstructions(input.targetLang),
    LANGUAGE_NOTES_INSTRUCTIONS,
    CONFIDENCE_INSTRUCTIONS_BT,
  ]

  return sections.filter(Boolean).join('\n\n')
}

const SYSTEM_ROLE_BT = `You are a professional translator performing back-translation for localization QA review.

Your task: Translate the TARGET text back into the SOURCE language so a non-native reviewer can understand what the target text actually says.

Requirements:
- Back-translation must be LITERAL enough to expose meaning differences vs the original source
- Do NOT "fix" the translation — translate what is ACTUALLY written in the target, even if wrong
- If the target contains errors (mistranslation, omission, addition), the back-translation should make those errors visible
- Preserve the register (formal/informal) and tone of the target text
- Note any cultural adaptations, idioms, or language-specific features`

const LANGUAGE_NOTES_INSTRUCTIONS = `## Language-Specific Notes

For each notable language feature in the target text, provide a note:
- **tone_marker:** Tone marks that affect meaning (Thai: ่ ้ ๊ ๋, Chinese tones, etc.)
- **politeness_particle:** Particles indicating formality/politeness (Thai: ครับ/ค่ะ/นะ/คะ, Japanese: です/ます)
- **compound_word:** Compound words that should be translated as single concepts
- **cultural_adaptation:** Content adapted for target culture (dates, units, references)
- **register:** Formality level choices (formal/informal, honorific usage)
- **idiom:** Idiomatic expressions that don't translate literally
- **ambiguity:** Cases where target text has multiple possible interpretations

Only include notes that are genuinely useful for understanding. Do not over-annotate.`

const CONFIDENCE_INSTRUCTIONS_BT = `## Confidence Score

Rate your confidence (0.0 to 1.0) in the back-translation accuracy:
- **0.95-1.0:** Near-perfect — straightforward text, high certainty of exact meaning
- **0.80-0.94:** High — minor ambiguities but overall meaning is clear
- **0.60-0.79:** Medium — some interpretation required, multiple valid readings possible
- **0.40-0.59:** Low — significant ambiguity, cultural context needed, possible meaning gaps
- **Below 0.40:** Very low — highly ambiguous, idiom-heavy, or domain-specific jargon

Be honest about uncertainty. A low confidence score is more useful than a falsely confident one.`
```

### 4.2 Thai-Specific Prompt Enhancement

The existing `getLanguageInstructions('th')` covers Thai QA rules. For back-translation, we add Thai-specific context in the prompt:

```typescript
const THAI_BT_ENHANCEMENT = `### Thai Back-Translation Notes
- Thai has NO spaces between words — word boundaries are inferred from context
- Thai tone markers (่ ้ ๊ ๋) change word meaning entirely:
  - ใกล้ (glâi = near) vs ไกล (glai = far) — tone is the ONLY difference
  - มา (maa = come) vs ม้า (máa = horse) vs หมา (mǎa = dog)
- ALWAYS note tone markers in languageNotes when they affect meaning
- Thai politeness particles (ครับ/ค่ะ for formal, นะ/คะ for softening) indicate register — note in languageNotes as 'politeness_particle'
- Thai compound words (โรงพยาบาล = hospital, มหาวิทยาลัย = university) must be translated as single concepts
- Buddhist Era year (พ.ศ.) = Gregorian + 543 — note as 'cultural_adaptation' if present
- Royal/honorific language (ราชาศัพท์) = distinct register — note as 'register'`
```

This enhancement is injected when `targetLang` starts with `'th'`.

---

## 5. Caching Strategy

### 5.1 Cache Key Design

```
cache_key = SHA256(segment_id + language_pair + model_version + target_text_hash)
```

**Why include `target_text_hash`?** If a file is re-uploaded with changed translations, the same `segment_id` may have different target text. Including the hash ensures stale cache is not served.

### 5.2 Storage: New DB Table (Recommended)

**Why DB over Redis/in-memory:**
- Already have Supabase PostgreSQL — no new infrastructure
- TTL enforcement via `created_at` + query filter (simple, no external scheduler)
- Survives server restarts (unlike in-memory Map)
- Multi-tenant isolation via `tenant_id` + `withTenant()` (Guardrail #1)
- Can query cache hit rates for observability
- RLS compatible (future: native reviewer can see back-translations for assigned segments)

**Why NOT Redis:**
- Project doesn't use Redis — adding it increases infra complexity for one feature
- PostgreSQL JSONB is sufficient for the cache value structure
- Back-translation is not latency-critical (segment focus has debounce)

**Why NOT in-memory:**
- Lost on server restart / Vercel cold start
- No multi-instance sharing (serverless = many instances)
- No observability on cache hit rates

### 5.3 DB Schema

```typescript
// src/db/schema/backTranslationCache.ts
import {
  pgTable,
  uuid,
  varchar,
  text,
  real,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'

import { segments } from './segments'
import { tenants } from './tenants'

type LanguageNote = {
  noteType: string
  originalText: string
  explanation: string
}

export const backTranslationCache = pgTable(
  'back_translation_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    segmentId: uuid('segment_id')
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    languagePair: varchar('language_pair', { length: 50 }).notNull(), // e.g. "th→en"
    modelVersion: varchar('model_version', { length: 100 }).notNull(),
    targetTextHash: varchar('target_text_hash', { length: 64 }).notNull(), // SHA-256
    backTranslation: text('back_translation').notNull(),
    contextualExplanation: text('contextual_explanation').notNull(),
    confidence: real('confidence').notNull(),
    languageNotes: jsonb('language_notes').$type<LanguageNote[]>().notNull(),
    translationApproach: text('translation_approach'), // nullable
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    estimatedCostUsd: real('estimated_cost_usd').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Unique constraint: one cache entry per segment+language+model+content
    unique('uq_bt_cache_segment_lang_model_hash').on(
      table.segmentId,
      table.languagePair,
      table.modelVersion,
      table.targetTextHash,
    ),
    // Index for cache lookup (hot path)
    index('idx_bt_cache_lookup').on(
      table.segmentId,
      table.languagePair,
      table.modelVersion,
    ),
    // Index for TTL cleanup
    index('idx_bt_cache_created').on(table.createdAt),
  ],
)
```

### 5.4 Cache Operations

```typescript
// Cache lookup (hot path — called on every segment focus)
async function getCachedBackTranslation(
  segmentId: string,
  languagePair: string,
  modelVersion: string,
  tenantId: string,
): Promise<BackTranslationResult | null> {
  const ttlCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24h ago

  const [cached] = await db
    .select()
    .from(backTranslationCache)
    .where(
      and(
        withTenant(backTranslationCache.tenantId, tenantId),
        eq(backTranslationCache.segmentId, segmentId),
        eq(backTranslationCache.languagePair, languagePair),
        eq(backTranslationCache.modelVersion, modelVersion),
        gte(backTranslationCache.createdAt, ttlCutoff),
      ),
    )

  if (!cached) return null

  return {
    backTranslation: cached.backTranslation,
    contextualExplanation: cached.contextualExplanation,
    confidence: cached.confidence,
    languageNotes: cached.languageNotes,
    translationApproach: cached.translationApproach,
  }
}

// Cache write (after successful AI call)
async function cacheBackTranslation(
  params: {
    segmentId: string
    tenantId: string
    languagePair: string
    modelVersion: string
    targetTextHash: string
    result: BackTranslationResult
    usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number }
  },
): Promise<void> {
  await db
    .insert(backTranslationCache)
    .values({
      segmentId: params.segmentId,
      tenantId: params.tenantId,
      languagePair: params.languagePair,
      modelVersion: params.modelVersion,
      targetTextHash: params.targetTextHash,
      backTranslation: params.result.backTranslation,
      contextualExplanation: params.result.contextualExplanation,
      confidence: params.result.confidence,
      languageNotes: params.result.languageNotes,
      translationApproach: params.result.translationApproach,
      inputTokens: params.usage.inputTokens,
      outputTokens: params.usage.outputTokens,
      estimatedCostUsd: params.usage.estimatedCostUsd,
    })
    .onConflictDoUpdate({
      target: [
        backTranslationCache.segmentId,
        backTranslationCache.languagePair,
        backTranslationCache.modelVersion,
        backTranslationCache.targetTextHash,
      ],
      set: {
        backTranslation: params.result.backTranslation,
        contextualExplanation: params.result.contextualExplanation,
        confidence: params.result.confidence,
        languageNotes: params.result.languageNotes,
        translationApproach: params.result.translationApproach,
        createdAt: new Date(), // refresh TTL
      },
    })
}
```

### 5.5 Cache Invalidation Triggers

Per AC: cache invalidated on file re-upload, glossary update, model version change.

| Trigger | Mechanism | Scope |
|---------|-----------|-------|
| File re-upload | Parser DELETE+INSERT segments -> `ON DELETE CASCADE` on `segment_id` FK | Automatic — segments are recreated with new IDs |
| Glossary update | Server Action calls `invalidateBTCache(projectId, languagePair)` | DELETE WHERE `segmentId IN (SELECT id FROM segments WHERE projectId = ?)` |
| Model version change | `modelVersion` is part of cache key | Automatic — new version = cache miss, old entries expire via TTL |

### 5.6 TTL Cleanup (Scheduled)

A lightweight cron job (Inngest scheduled function) cleans expired entries:

```typescript
// Clean entries older than 24 hours — runs daily at 03:00 UTC
export const cleanBTCache = inngest.createFunction(
  { id: 'clean-bt-cache', retries: 2 },
  { cron: '0 3 * * *' },
  async ({ step }) => {
    await step.run('delete-expired', async () => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const result = await db
        .delete(backTranslationCache)
        .where(lt(backTranslationCache.createdAt, cutoff))
      return { deleted: result.rowCount }
    })
  },
)
```

---

## 6. API & Data Flow Design

### 6.1 Trigger: Server Action (Not Route Handler)

Back-translation is triggered by segment focus in the review UI. This is a UI mutation pattern -> Server Action.

```
User focuses segment -> debounce 300ms -> Server Action -> cache check -> (miss?) AI call -> return result
```

### 6.2 Server Action Signature

```typescript
// src/features/bridge/actions/getBackTranslation.action.ts

export type BackTranslationInput = {
  segmentId: string
  projectId: string
}

export type BackTranslationOutput = ActionResult<{
  backTranslation: string
  contextualExplanation: string
  confidence: number
  languageNotes: Array<{
    noteType: string
    originalText: string
    explanation: string
  }>
  translationApproach: string | null
  cached: boolean
  latencyMs: number
}>
```

### 6.3 Flow Diagram

```
1. Client: user focuses segment #42
2. Client: debounce 300ms (prevents rapid-fire on J/K navigation)
3. Client: call getBackTranslation({ segmentId, projectId })
4. Server: requireRole('reviewer') — auth check
5. Server: load segment from DB (get sourceText, targetText, sourceLang, targetLang)
6. Server: compute targetTextHash = SHA-256(targetText)
7. Server: getCachedBackTranslation(segmentId, languagePair, modelVersion, tenantId)
8.   -> HIT: return cached result (latencyMs ~ 20-50ms)
9.   -> MISS: continue to AI call
10. Server: checkProjectBudget(projectId, tenantId)
11.   -> No quota: return error "AI quota exhausted"
12. Server: buildBackTranslationPrompt(segment + surrounding context)
13. Server: generateText({ model, output: Output.object({ schema }), prompt })
14. Server: logAIUsage({ layer: 'BT', ... })
15. Server: cacheBackTranslation(result)
16. Server: return result
```

### 6.4 Client-Side Integration

```typescript
// In LanguageBridge panel component
const [btResult, setBtResult] = useState<BackTranslationResult | null>(null)
const [loading, setLoading] = useState(false)

// Debounced fetch on focus change
useEffect(() => {
  if (!activeFindingId) return
  const segment = getSegmentForFinding(activeFindingId)
  if (!segment) return

  setLoading(true)
  const timer = setTimeout(async () => {
    const result = await getBackTranslation({ segmentId: segment.id, projectId })
    if (result.success) {
      setBtResult(result.data)
    }
    setLoading(false)
  }, 300)

  return () => clearTimeout(timer)
}, [activeFindingId, projectId])
```

---

## 7. Cost Estimation

### 7.1 Token Estimation Per Segment

| Component | Avg Characters | Est. Tokens |
|-----------|---------------|-------------|
| System prompt (fixed) | ~1,500 chars | ~400 tokens |
| Language instructions (Thai) | ~500 chars | ~130 tokens |
| Segment source text | ~150 chars | ~50 tokens |
| Segment target text (Thai) | ~120 chars | ~80 tokens (Thai = higher token density) |
| Surrounding context (2 segments) | ~500 chars | ~170 tokens |
| **Total input** | **~2,770 chars** | **~830 tokens** |
| **Output** (BT + explanation + notes) | ~400 chars | ~150 tokens |

### 7.2 Cost Per Segment By Model

| Model | Input Cost | Output Cost | Total/Segment | Notes |
|-------|-----------|-------------|--------------|-------|
| gpt-4o-mini | 830 * $0.00015/1K = $0.000125 | 150 * $0.0006/1K = $0.000090 | **$0.000215** | Fast (1-2s), good translation quality |
| claude-sonnet | 830 * $0.003/1K = $0.002490 | 150 * $0.015/1K = $0.002250 | **$0.004740** | Slower (3-5s), higher quality nuance detection |

### 7.3 Cost Per 500-Segment Session

Assumptions:
- Reviewer focuses ~60% of segments (300 segments)
- Cache hit rate after first pass: ~40% (reviewer re-visits some segments)
- Net AI calls: 300 * 0.6 (cache miss) = ~180 unique AI calls

| Model | Unique Calls | Cost/Call | Session Cost | Monthly (20 sessions) |
|-------|-------------|-----------|-------------|----------------------|
| gpt-4o-mini | 180 | $0.000215 | **$0.039** | **$0.77** |
| claude-sonnet | 180 | $0.004740 | **$0.853** | **$17.06** |

### 7.4 Cost Comparison Table

| Scenario | gpt-4o-mini | claude-sonnet | Ratio |
|----------|------------|--------------|-------|
| Per segment | $0.000215 | $0.004740 | 22x cheaper |
| Per 500-seg session | $0.039 | $0.853 | 22x cheaper |
| Per month (20 sessions) | $0.77 | $17.06 | 22x cheaper |
| Per month (team of 5) | $3.85 | $85.30 | 22x cheaper |

### 7.5 Budget Impact

Current L2+L3 pipeline costs ~$0.02-0.10 per file. Adding back-translation at gpt-4o-mini pricing adds ~$0.04 per file review session — roughly doubling the AI cost but still within practical limits (<$0.15 per file total).

With claude-sonnet, back-translation alone would cost 8-40x more than the entire L2+L3 pipeline per file, which is not practical.

---

## 8. Model Recommendation

### Primary: gpt-4o-mini (Recommended)

| Factor | gpt-4o-mini | claude-sonnet |
|--------|------------|--------------|
| **Cost** | $0.039/session | $0.853/session |
| **Latency** | 1-2s per segment | 3-5s per segment |
| **Translation quality** | Good — sufficient for back-translation | Excellent — better nuance |
| **Thai support** | Good — handles Thai script well | Very good — slightly better cultural context |
| **Structured output** | Native JSON mode | Works via `Output.object()` |

**Rationale:**
1. **Cost is 22x lower** — back-translation is called per-segment (high volume), not per-file like L2/L3
2. **Latency matters** — reviewer expects near-instant update when navigating segments. 1-2s is acceptable; 3-5s feels sluggish
3. **Quality is sufficient** — back-translation needs to be "accurate enough to expose errors", not literary-quality translation. gpt-4o-mini handles this well
4. **Same model as L2** — already proven in the pipeline, no additional API key or provider setup

### Fallback: claude-sonnet (for low-confidence retries)

If gpt-4o-mini returns confidence < 0.6 for a segment, optionally retry with claude-sonnet for better nuance detection. This keeps costs low (only ~5-10% of segments would trigger fallback) while improving quality where it matters most.

```typescript
// Pseudocode for fallback logic
const result = await generateBT(segment, 'gpt-4o-mini')
if (result.confidence < 0.6 && budgetCheck.hasQuota) {
  const retryResult = await generateBT(segment, 'claude-sonnet')
  if (retryResult.confidence > result.confidence) {
    return retryResult // Use higher-quality result
  }
}
return result
```

---

## 9. Thai-Specific Considerations

### 9.1 Thai Tone Marker Preservation (Target: >= 98%)

Thai has 4 tone markers that change word meaning entirely:

| Marker | Name | Example |
|--------|------|---------|
| ่ | mai ek | ใกล้ (near) |
| ้ | mai tho | น้ำ (water) |
| ๊ | mai tri | โน๊ต (note, informal) |
| ๋ | mai chattawa | จ๋า (darling) |

**Verification approach:** The prompt explicitly instructs the AI to note tone markers in `languageNotes` with `noteType: 'tone_marker'`. Automated check: count markers in source vs markers referenced in explanation.

**Implementation:**

```typescript
function countThaiToneMarkers(text: string): number {
  const THAI_TONE_MARKERS = /[\u0E48\u0E49\u0E4A\u0E4B]/g
  return (text.match(THAI_TONE_MARKERS) ?? []).length
}

function verifyToneMarkerPreservation(
  sourceText: string,
  languageNotes: LanguageNote[],
): { rate: number; sourceToneCount: number; notedCount: number } {
  const sourceToneCount = countThaiToneMarkers(sourceText)
  if (sourceToneCount === 0) return { rate: 1.0, sourceToneCount: 0, notedCount: 0 }

  const notedCount = languageNotes.filter((n) => n.noteType === 'tone_marker').length
  return {
    rate: Math.min(1.0, notedCount / sourceToneCount),
    sourceToneCount,
    notedCount,
  }
}
```

### 9.2 Thai Compound Word Recognition (Target: >= 90%)

Thai compound words (e.g., โรงพยาบาล = hospital, not "factory" + "sick") must be translated as single concepts.

**Approach:**
1. The prompt explicitly instructs: "Thai compound words must be translated as single concepts, not decomposed"
2. Language notes with `noteType: 'compound_word'` track which compounds were recognized
3. Reference corpus at `docs/test-data/back-translation/th-reference.json` validates accuracy

### 9.3 Politeness Particles (ครับ/ค่ะ/นะ/คะ)

These particles indicate formality level, not translation content. The prompt instructs the AI to:
- Note them in `languageNotes` as `noteType: 'politeness_particle'`
- NOT flag them as translation issues
- Include them in the contextual explanation for register awareness

### 9.4 Semantic Accuracy Target (>= 95%)

Measured against a bilingual reference corpus of 100 Thai segments. This is an evaluation metric, not a runtime check.

**Evaluation framework:**

```typescript
// Evaluation script (not production code)
type ReferenceEntry = {
  segmentId: string
  sourceText: string
  targetText: string
  referenceBackTranslation: string  // Human-verified ground truth
  acceptableVariants: string[]      // Alternative acceptable translations
}

function evaluateSemanticAccuracy(
  aiBackTranslation: string,
  reference: ReferenceEntry,
): number {
  // Use embedding similarity or bilingual evaluator scoring
  // Score: 1.0 = exact match, 0.0 = completely wrong
  // Threshold: >= 0.95 average across corpus
}
```

---

## 10. Module Structure

Proposed file layout following project conventions (feature-based co-location):

```
src/features/bridge/
├── actions/
│   └── getBackTranslation.action.ts    # Server Action (main entry point)
├── components/
│   ├── LanguageBridgePanel.tsx          # Sidebar panel (client component)
│   ├── BackTranslationSection.tsx       # BT text display
│   ├── ContextualExplanation.tsx        # Explanation + language notes
│   ├── ConfidenceIndicator.tsx          # 0-1 confidence visual
│   └── LanguageBridgeSkeleton.tsx       # Loading state
├── hooks/
│   └── useBackTranslation.ts           # Debounced fetch + state
├── helpers/
│   ├── buildBTPrompt.ts                # Prompt builder
│   ├── btCache.ts                      # Cache read/write operations
│   └── thaiAnalysis.ts                 # Thai-specific helpers
├── stores/
│   └── bridge.store.ts                 # UI state (panel open/closed, etc.)
├── validation/
│   └── btSchema.ts                     # Zod schemas
├── types.ts                            # Feature types
└── __tests__/                          # Co-located tests
    ├── buildBTPrompt.test.ts
    ├── btCache.test.ts
    ├── thaiAnalysis.test.ts
    └── getBackTranslation.action.test.ts
```

DB schema addition:
```
src/db/schema/backTranslationCache.ts
```

---

## 11. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| gpt-4o-mini Thai quality insufficient | Medium | Fallback to claude-sonnet for low-confidence results; evaluate on reference corpus before launch |
| Cost spike from rapid navigation | Medium | 300ms debounce + cache; budget guard per project |
| Cache bloat in DB | Low | TTL cleanup cron; CASCADE on segment delete; monitor table size |
| Latency spikes during peak | Medium | Cache warms on first pass; subsequent views instant |
| Token count exceeds estimate for long segments | Low | Max segment length already capped at 30K chars by pipeline; BT processes single segment |
| Model version change invalidates all cache | Low | By design — ensures quality; cache rebuilds organically as reviewers work |

---

## 12. Open Questions for Story Grooming

1. **Batch pre-compute vs on-demand?** Current design is on-demand (focus triggers). Alternative: pre-compute all BTs when file is opened (higher upfront cost but zero latency). Recommendation: on-demand for MVP, batch as enhancement.

2. **Panel auto-hide for native reviewers?** AC mentions "Hidden = not rendered (native pair detected)". How to detect native pair? Profile `user.languages` array vs file `targetLang`? Needs clarification.

3. **Confidence threshold per language pair?** AC mentions "confidence < language threshold" for warning state. Where is the threshold configured? Recommendation: `project_settings.bt_confidence_threshold` column, default 0.7.

4. **Streaming vs batch response?** Current design returns full result at once. `streamText` could show progressive back-translation. Recommendation: batch for MVP (simpler), streaming as enhancement if latency is an issue.

5. **Reference corpus creation timeline?** AC requires 100 Thai segments at `docs/test-data/back-translation/th-reference.json`. This needs bilingual evaluator effort — should be created before Story 5.1 implementation starts.

---

## 13. Implementation Checklist

- [ ] Extend `AILayer` type to include `'BT'`
- [ ] Add `'back-translation'` alias to `qaProvider` in `client.ts`
- [ ] Create DB migration: `back_translation_cache` table
- [ ] Create `src/features/bridge/` module structure
- [ ] Implement `buildBTPrompt()` with Thai enhancement
- [ ] Implement `btCache.ts` (read/write/invalidate)
- [ ] Implement `getBackTranslation.action.ts` Server Action
- [ ] Implement `LanguageBridgePanel` component (5 visual states)
- [ ] Implement `useBackTranslation` hook with 300ms debounce
- [ ] Integrate with `checkProjectBudget()` + `logAIUsage()`
- [ ] Add TTL cleanup Inngest cron function
- [ ] Create Thai reference corpus (100 segments)
- [ ] Add glossary update cache invalidation hook
- [ ] Unit tests for prompt builder, cache operations, Thai helpers
- [ ] E2E test for LanguageBridge panel (load, focus change, skeleton)
- [ ] Accessibility: `aria-live="polite"` on updates, `<mark>` with `aria-label`

---

## 14. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary model | gpt-4o-mini | 22x cheaper, 2-3x faster, sufficient quality |
| Fallback model | claude-sonnet (confidence < 0.6) | Better nuance for ambiguous segments |
| Cache storage | PostgreSQL table | No new infra, RLS compatible, observable |
| Cache TTL | 24 hours | Per AC requirement |
| Trigger | On-focus with 300ms debounce | Responsive without cost spikes |
| Feature module | `src/features/bridge/` | Follows project convention |
| AI layer | `'BT'` (new) | Separate cost tracking from L2/L3 |
