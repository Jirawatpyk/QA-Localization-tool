# Integration Patterns Analysis

> This section addresses the **most critical research gap**: how the 3 layers work together without overlap, how data flows between them, and how results merge into a unified experience.

### 1. Layer Responsibility Matrix — The Boundary Problem Solved

The core question: "Which checks belong in which layer?" Here is the definitive boundary:

**Principle: Each layer checks what the other layers CANNOT check.**

| Responsibility | Layer 1 (Rules) | Layer 2 (AI Screen) | Layer 3 (AI Deep) |
|---------------|:---------------:|:-------------------:|:-----------------:|
| **Tag integrity** | ✅ Deterministic | ❌ Skip | ❌ Skip |
| **Missing text / untranslated** | ✅ Deterministic | ❌ Skip | ❌ Skip |
| **Numeric consistency** | ✅ Deterministic | ❌ Skip | ❌ Skip |
| **Placeholder matching** | ✅ Deterministic | ❌ Skip | ❌ Skip |
| **Glossary term matching** | ✅ Deterministic | ❌ Skip | Semantic terminology (beyond glossary) |
| **Punctuation validation** | ✅ Deterministic | ❌ Skip | ❌ Skip |
| **Symbol/numbering** | ✅ Deterministic | ❌ Skip | ❌ Skip |
| **Capitalization** | ✅ Deterministic | ❌ Skip | ❌ Skip |
| **Unnecessary spacing** | ✅ Deterministic | ❌ Skip | ❌ Skip |
| **Text format (bold/italic tags)** | ✅ Deterministic | ❌ Skip | ❌ Skip |
| **URL/email matching** | ✅ Deterministic | ❌ Skip | ❌ Skip |
| **Unpaired symbols** | ✅ Deterministic | ❌ Skip | ❌ Skip |
| **Semantic accuracy** | ❌ Cannot | ✅ Quick flag | ✅ Deep analysis |
| **Mistranslation** | ❌ Cannot | ✅ Quick flag | ✅ Confirm + suggestion |
| **Omission (partial)** | ❌ Cannot | ✅ Quick flag | ✅ Confirm + suggestion |
| **Tone/register** | ❌ Cannot | ❌ Skip | ✅ Full analysis |
| **Style guide compliance** | ❌ Cannot | ❌ Skip | ✅ Full analysis |
| **Cultural appropriateness** | ❌ Cannot | ❌ Skip | ✅ Full analysis |
| **Fluency/naturalness** | ❌ Cannot | ❌ Skip | ✅ Full analysis |
| **Instructions compliance** | ❌ Cannot | ❌ Skip | ✅ Full analysis |

**Key Boundary Rules:**
1. **If it can be checked with regex/comparison → Layer 1.** No exceptions.
2. **Layer 2 does NOT re-check anything Layer 1 covers.** It only screens for semantic issues.
3. **Layer 3 does NOT re-check anything Layer 1 covers.** It only deep-analyzes what Layer 2 flagged.
4. **Glossary is the only overlap point** — Layer 1 checks exact term match, Layer 3 checks semantic terminology consistency (different words meaning the same thing). These produce different finding types, not duplicates.

### 2. Overlap Prevention — The Context-Aware Prompt Strategy

**The Innovation: Layer 1 results feed INTO Layer 2-3 prompts as context.**

This is not just "don't re-check" — it's "know what was already checked and focus elsewhere."

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PROMPT CONTEXT INJECTION                        │
│                                                                     │
│  Layer 2 prompt receives:                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ SYSTEM: You are a translation QA screening assistant.        │  │
│  │                                                              │  │
│  │ CONTEXT: The following structural checks have ALREADY been   │  │
│  │ completed by the rule-based engine. DO NOT flag these types: │  │
│  │ - Tags ✅ (0 issues found)                                   │  │
│  │ - Numbers ✅ (0 issues found)                                │  │
│  │ - Placeholders ⚠️ (1 issue found in segment #23)            │  │
│  │ - Glossary ⚠️ (2 mismatches found in segments #7, #45)      │  │
│  │                                                              │  │
│  │ YOUR FOCUS: Screen ONLY for semantic issues:                 │  │
│  │ - Does the translation convey the correct meaning?           │  │
│  │ - Is there any content omission beyond what rules detected?  │  │
│  │ - Is there potential mistranslation that rules can't catch?   │  │
│  │                                                              │  │
│  │ Flag segments that need deep analysis. Be concise.           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Layer 3 prompt receives:                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ SYSTEM: You are a senior translation quality analyst.         │  │
│  │                                                              │  │
│  │ CONTEXT:                                                     │  │
│  │ - Rule-based findings: [summary of Layer 1 results]          │  │
│  │ - Screening flags: [Layer 2 flags for this segment]          │  │
│  │ - Source language: EN, Target language: {target_lang}         │  │
│  │ - XLIFF notes/context: [if available]                        │  │
│  │ - Glossary terms: [relevant terms for this segment]          │  │
│  │                                                              │  │
│  │ ANALYZE this segment for:                                    │  │
│  │ 1. Semantic accuracy — is the meaning correct?               │  │
│  │ 2. Tone/register — appropriate for context?                  │  │
│  │ 3. Cultural — any cultural issues?                           │  │
│  │ 4. Fluency — natural in target language?                     │  │
│  │                                                              │  │
│  │ For each issue, provide:                                     │  │
│  │ - MQM category, severity, explanation, fix suggestion        │  │
│  │ - Confidence score (0-100%)                                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**Why this works:**
- Layer 2 receives Layer 1 summary → knows what to skip → focuses on semantic screening
- Layer 3 receives both Layer 1 + Layer 2 context → richer analysis → fewer false positives
- Each layer sees what came before → no duplication, only value-add

_Source: [Context Engineering](https://jtanruan.medium.com/context-engineering-in-llm-based-agents-d670d6b439bc), [Prompt Chaining](https://www.promptingguide.ai/techniques/prompt_chaining)_

### 3. Data Flow Architecture — The Complete Pipeline

```
                         ┌─────────────────────────────┐
                         │     FILE UPLOAD              │
                         │  XLIFF / Excel               │
                         └──────────┬──────────────────┘
                                    │
                                    ▼
                         ┌─────────────────────────────┐
                         │     FILE PARSER              │
                         │  xliff npm / Excel parser    │
                         │  Output: Segment[]           │
                         └──────────┬──────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               │               │
          ┌─────────────────┐      │               │
          │  LAYER 1        │      │               │
          │  Rule Engine    │      │               │
          │  (instant)      │      │               │
          │                 │      │               │
          │  10+ rules      │      │               │
          │  execute()      │      │               │
          │                 │      │               │
          │  Output:        │      │               │
          │  RuleFinding[]  │      │               │
          │  confidence=1.0 │      │               │
          └────────┬────────┘      │               │
                   │               │               │
    ┌──────────────┤               │               │
    │              │               │               │
    ▼              ▼               │               │
  ┌────┐  ┌──────────────────┐    │               │
  │ DB │  │  LAYER 2         │    │               │
  │ +  │  │  AI Screening    │    │               │
  │ UI │  │  (GPT-4o-mini/   │    │               │
  │    │  │   Haiku)          │    │               │
  │ 🔴 │  │                  │    │               │
  │ R  │  │  Input:          │    │               │
  │ e  │  │  - Segment[]     │    │               │
  │ a  │  │  - RuleFinding[] │    │               │
  │ l  │  │    (as context)  │    │               │
  │ t  │  │                  │    │               │
  │ i  │  │  Output:         │    │               │
  │ m  │  │  - flagged[]     │    │               │
  │ e  │  │  - passed[]      │    │               │
  │    │  └────────┬─────────┘    │               │
  │ U  │           │              │               │
  │ p  │           ▼              │               │
  │ d  │  ┌──────────────────┐    │               │
  │ a  │  │  LAYER 3         │    │               │
  │ t  │  │  Deep Analysis   │    │               │
  │ e  │  │  (Claude Sonnet) │    │               │
  │ s  │  │                  │    │               │
  │    │  │  Input:          │    │               │
  │    │  │  - flagged[]     │    │               │
  │    │  │  - RuleFinding[] │    │               │
  │    │  │  - XLIFF notes   │    │               │
  │    │  │  - Glossary      │    │               │
  │    │  │                  │    │               │
  │    │  │  Output:         │    │               │
  │    │  │  - AIFinding[]   │    │               │
  │    │  │  - suggestions[] │    │               │
  │    │  │  - confidence[]  │    │               │
  │    │  └────────┬─────────┘    │               │
  │    │           │              │               │
  └────┘           ▼              │               │
          ┌──────────────────┐    │               │
          │  RESULT MERGER   │◄───┘               │
          │  + SCORER        │◄───────────────────┘
          │                  │
          │  - Deduplicate   │
          │  - MQM Score     │
          │  - Auto-pass     │
          │    decision      │
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │  FINAL RESULTS   │
          │  - Score          │
          │  - All findings   │
          │  - Auto-pass Y/N  │
          │  - Audit trail    │
          └──────────────────┘
```

**Key Data Flow Decisions:**

| Decision Point | Approach | Rationale |
|---------------|----------|-----------|
| **Layer 1 → UI** | Stream immediately via Supabase Realtime | User sees value in < 10 seconds |
| **Layer 1 → Layer 2** | Pass as prompt context (summary) | AI knows what to skip |
| **Layer 2 → Layer 3** | Pass only flagged segment IDs | ~80% segments skip Layer 3 = cost savings |
| **Layer 1 + 2 + 3 → Merger** | All findings share unified `QAFinding` interface | Single format for dedup and scoring |
| **Merger → DB** | Single transaction, update progress via Supabase Realtime | Frontend subscribes to row changes |

### 4. Progressive Result Streaming — UX Innovation

**The Problem:** AI processing takes 1-3 minutes. Users shouldn't wait.

**The Solution:** Progressive streaming using Inngest steps + Supabase Realtime.

```
Timeline:
0s ──────── 5s ──────── 30s ──────── 120s ──────── 180s
│           │            │             │              │
│  Upload   │  Layer 1   │  Layer 2    │  Layer 3     │  Done
│  Parse    │  Complete  │  Complete   │  Complete    │
│           │            │             │              │
│           ▼            ▼             ▼              ▼
│     ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌────────┐
│     │ Show     │ │ Update   │ │ Show AI      │ │ Final  │
│     │ rule     │ │ progress │ │ findings +   │ │ score  │
│     │ findings │ │ "AI      │ │ suggestions  │ │ auto-  │
│     │ + count  │ │ screening│ │ streaming in │ │ pass   │
│     │ + temp   │ │ 80%      │ │              │ │ decision│
│     │ score    │ │ passed"  │ │              │ │        │
│     └──────────┘ └──────────┘ └──────────────┘ └────────┘
```

**Implementation Pattern with Inngest + Supabase:**

```typescript
// Database: qa_runs table
// status: 'parsing' | 'rules' | 'screening' | 'analyzing' | 'scoring' | 'complete'
// layer1_complete: boolean
// layer2_complete: boolean
// layer3_complete: boolean
// score_interim: number (updated after each layer)
// score_final: number (set at completion)

// Inngest function
inngest.createFunction(
  { id: "qa-pipeline" },
  { event: "qa/file.uploaded" },
  async ({ event, step }) => {

    // Step 1: Parse file
    const segments = await step.run("parse", async () => {
      await updateStatus(runId, 'parsing');
      return parseFile(file);
    });

    // Step 2: Layer 1 — Rule-based (instant)
    const ruleFindings = await step.run("layer-1-rules", async () => {
      await updateStatus(runId, 'rules');
      const findings = ruleEngine.execute(segments);
      // Save findings + interim score immediately
      await saveFindings(runId, findings, { layer: 1 });
      await updateInterimScore(runId, findings);
      // → Supabase Realtime pushes update to frontend
      return findings;
    });

    // Economy mode? Stop here.
    if (mode === 'economy' && !includeLayer3) {
      // Layer 2 only
      const screenFindings = await step.run("layer-2-screen", async () => {
        await updateStatus(runId, 'screening');
        const results = await aiScreen(segments, ruleFindings);
        await saveFindings(runId, results.findings, { layer: 2 });
        await updateInterimScore(runId, [...ruleFindings, ...results.findings]);
        return results;
      });
      return await step.run("finalize", async () => {
        return finalizeScore(runId, ruleFindings, screenFindings);
      });
    }

    // Thorough mode: Layer 2 + Layer 3
    const screenResults = await step.run("layer-2-screen", async () => {
      await updateStatus(runId, 'screening');
      return await aiScreen(segments, ruleFindings);
    });

    const deepFindings = await step.run("layer-3-deep", async () => {
      await updateStatus(runId, 'analyzing');
      const flagged = screenResults.flaggedSegments;
      const findings = await aiDeepAnalysis(flagged, ruleFindings, glossary);
      await saveFindings(runId, findings, { layer: 3 });
      return findings;
    });

    return await step.run("finalize", async () => {
      return finalizeScore(runId, ruleFindings, screenResults, deepFindings);
    });
  }
);
```

**Frontend Subscription (Supabase Realtime):**

```typescript
// Subscribe to qa_run row changes
supabase
  .channel('qa-run-progress')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'qa_runs',
    filter: `id=eq.${runId}`
  }, (payload) => {
    // Update UI progressively
    setStatus(payload.new.status);
    setInterimScore(payload.new.score_interim);
    if (payload.new.layer1_complete) showRuleFindings();
    if (payload.new.layer2_complete) showScreeningResults();
    if (payload.new.layer3_complete) showDeepFindings();
  })
  .subscribe();
```

**Inngest Checkpointing (Dec 2025):** Near-zero inter-step latency and 50% reduction in workflow duration — critical for our pipeline where Layer 1→2→3 transitions must be fast.

_Source: [Inngest Steps & Workflows](https://www.inngest.com/docs/features/inngest-functions/steps-workflows), [Inngest Checkpointing](https://www.inngest.com/changelog), [Supabase Realtime](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)_

### 5. Result Merger & Deduplication Strategy

**The Problem:** What if Layer 1 finds "missing text" and Layer 3 finds "omission" for the same segment?

**Solution: Segment-based Deduplication with Layer Priority**

```typescript
interface UnifiedFinding {
  id: string;
  segmentId: string;
  layer: 1 | 2 | 3;
  ruleId?: string;          // Layer 1 only
  category: string;         // MQM category
  severity: 'critical' | 'major' | 'minor';
  message: string;
  suggestion?: string;
  confidence: number;       // 1.0 for rules, 0-1 for AI
  sourceSnippet?: string;
  targetSnippet?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'flagged';
}

// Deduplication Rules:
function mergeFindings(
  layer1: UnifiedFinding[],
  layer2: UnifiedFinding[],
  layer3: UnifiedFinding[]
): UnifiedFinding[] {

  const merged: UnifiedFinding[] = [...layer1]; // Rules always included

  for (const aiFinding of [...layer2, ...layer3]) {
    const duplicate = merged.find(existing =>
      existing.segmentId === aiFinding.segmentId &&
      isSameIssueType(existing.category, aiFinding.category)
    );

    if (duplicate) {
      // RULE: If same segment + same category → keep higher confidence
      if (duplicate.layer === 1) {
        // Layer 1 (deterministic) wins — enrich with AI explanation
        duplicate.aiExplanation = aiFinding.message;
        duplicate.aiSuggestion = aiFinding.suggestion;
      } else {
        // Between AI layers — keep higher confidence
        if (aiFinding.confidence > duplicate.confidence) {
          merged.splice(merged.indexOf(duplicate), 1, aiFinding);
        }
      }
    } else {
      // New finding — add to results
      merged.push(aiFinding);
    }
  }

  return merged;
}

// Category overlap mapping
function isSameIssueType(cat1: string, cat2: string): boolean {
  const OVERLAP_MAP: Record<string, string[]> = {
    'missing-text':     ['omission', 'missing-translation', 'untranslated'],
    'glossary-mismatch': ['terminology-inconsistency'],
    'tag-integrity':     ['markup-error', 'formatting-error'],
    'number-mismatch':   ['numeric-error'],
  };
  // ... check if categories map to the same root issue
}
```

**Deduplication Decision Matrix:**

| Scenario | Layer 1 Found | AI Found | Action |
|----------|:------------:|:--------:|--------|
| Same segment, same category | ✅ "Missing text" | ✅ "Omission" | **Keep Layer 1** — enrich with AI explanation |
| Same segment, different category | ✅ "Tag mismatch" | ✅ "Mistranslation" | **Keep both** — different issues |
| Layer 1 only | ✅ "Number mismatch" | ❌ | **Keep** — deterministic finding |
| AI only | ❌ | ✅ "Tone mismatch" | **Keep** — AI-exclusive finding |
| Layer 2 + Layer 3 same segment | — | ✅ Both flag | **Keep Layer 3** — more detailed analysis |

**Result: Zero duplicates in the final finding list.**

### 6. Feedback Loop Architecture — The Quality Moat Engine

User actions on findings create data that improves the system over time:

```
                    ┌──────────────────────────────┐
                    │      USER ACTIONS            │
                    │                              │
                    │  Accept ✅  Reject ❌  Flag 🏳 │
                    └──────────┬───────────────────┘
                               │
                    ┌──────────▼───────────────────┐
                    │      FEEDBACK STORE           │
                    │                              │
                    │  finding_id, action, user_id  │
                    │  language_pair, segment_text   │
                    │  ai_confidence, timestamp      │
                    └──────────┬───────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
    ┌────────────────┐ ┌──────────────┐ ┌──────────────┐
    │ PROMPT TUNING  │ │ THRESHOLD    │ │ RULE         │
    │                │ │ CALIBRATION  │ │ GENERATION   │
    │ AI rejected    │ │              │ │ (Innovation) │
    │ findings →     │ │ False pos    │ │              │
    │ add as few-    │ │ rate per     │ │ AI flags     │
    │ shot negative  │ │ lang pair    │ │ same pattern │
    │ examples in    │ │ → auto-      │ │ 10+ times →  │
    │ prompt         │ │ adjust AI    │ │ suggest new  │
    │                │ │ sensitivity  │ │ rule for     │
    │ AI accepted    │ │              │ │ Layer 1      │
    │ findings →     │ │ Auto-pass    │ │              │
    │ positive       │ │ accuracy     │ │ Rule cheaper │
    │ examples       │ │ tracking     │ │ than AI      │
    └────────────────┘ └──────────────┘ └──────────────┘
```

**Innovation — AI-to-Rule Promotion:**
When AI flags the same pattern repeatedly (e.g., Thai spacing before ครับ/ค่ะ, Chinese fullwidth punctuation inconsistency 。vs., Japanese katakana-only segments flagged as untranslated), the system can suggest promoting it to a **Layer 1 rule**:
- Cheaper (free vs AI cost)
- Faster (instant vs seconds)
- Deterministic (confidence 1.0 vs variable)
- **This creates a competitive moat** — rules grow from real data, not guesswork

**Feedback Data Schema:**
```sql
CREATE TABLE qa_feedback (
  id UUID PRIMARY KEY,
  finding_id UUID REFERENCES qa_findings(id),
  qa_run_id UUID REFERENCES qa_runs(id),
  action TEXT CHECK (action IN ('accept', 'reject', 'flag')),
  user_id UUID REFERENCES auth.users(id),
  language_pair TEXT,        -- e.g., 'en-th'
  ai_confidence DECIMAL,     -- original AI confidence
  segment_source TEXT,
  segment_target TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Analytics view for prompt tuning
CREATE VIEW feedback_analytics AS
SELECT
  language_pair,
  COUNT(*) FILTER (WHERE action = 'reject') AS rejected_count,
  COUNT(*) FILTER (WHERE action = 'accept') AS accepted_count,
  COUNT(*) FILTER (WHERE action = 'reject')::DECIMAL /
    NULLIF(COUNT(*), 0) AS false_positive_rate,
  AVG(ai_confidence) FILTER (WHERE action = 'reject') AS avg_confidence_on_reject
FROM qa_feedback
GROUP BY language_pair;
```

### 7. Graceful Degradation — When Things Go Wrong

| Failure | Impact | Fallback |
|---------|--------|----------|
| **AI API timeout** (Layer 2) | No AI screening | Return Layer 1 results only + flag "AI unavailable" |
| **AI API timeout** (Layer 3) | No deep analysis | Return Layer 1 + Layer 2 results + flag |
| **AI rate limit** | Processing delayed | Inngest automatic retry with backoff |
| **File parse error** | Cannot process | Return specific parse error to user |
| **Rule engine crash** | No rule results | Log error, attempt AI-only mode (degraded) |
| **Supabase Realtime down** | No live updates | Polling fallback (5-second interval) |

**Key Principle:** The tool ALWAYS returns at least Layer 1 results. AI layers are additive, never blocking.

### Integration Patterns Summary

| Pattern | Implementation | Innovation Level |
|---------|---------------|:----------------:|
| **Layer boundary isolation** | Responsibility matrix — no overlap | Foundation |
| **Context-aware prompts** | Layer 1 results feed AI context | ⭐ Innovation |
| **Progressive streaming** | Inngest steps + Supabase Realtime | ⭐ Innovation |
| **Segment-based dedup** | Category overlap map + layer priority | Foundation |
| **AI-to-Rule promotion** | Feedback loop → pattern detection → new rule | ⭐⭐ Major Innovation |
| **Graceful degradation** | Layer 1 always available, AI additive | Foundation |

---
