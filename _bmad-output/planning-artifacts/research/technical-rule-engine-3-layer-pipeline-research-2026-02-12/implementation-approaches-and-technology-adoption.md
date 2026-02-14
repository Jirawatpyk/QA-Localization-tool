# Implementation Approaches and Technology Adoption

### 1. Testing Strategy — Multi-Layer Test Pyramid

Testing a rule engine + AI pipeline requires a **specialized testing approach** different from standard web apps.

#### 1.1 Rule Engine Testing

**Unit Tests (per rule):**
Each of the 10 rules gets its own test suite with crafted input segments:

```typescript
// Example: Tag Integrity Rule Test Suite
describe('TagIntegrityRule', () => {
  const rule = new TagIntegrityRule();

  it('passes when source and target tags match', () => {
    const segment = {
      source: ['Click ', { GenericSpan: { id: '1' } }, ' here'],
      target: ['คลิก', { GenericSpan: { id: '1' } }, 'ที่นี่'],
    };
    expect(rule.execute(segment)).toEqual([]);
  });

  it('flags missing tag in target', () => {
    const segment = {
      source: ['Click ', { GenericSpan: { id: '1' } }, ' here'],
      target: ['คลิกที่นี่'],  // tag missing
    };
    const findings = rule.execute(segment);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
  });

  it('flags extra tag in target', () => { /* ... */ });
  it('handles nested tags correctly', () => { /* ... */ });
  it('handles self-closing tags (<x/>)', () => { /* ... */ });
  it('handles XLIFF 2.0 tag names (<pc>, <ph>)', () => { /* ... */ });
});
```

**Golden Test Set (Xbench Parity):**
A curated set of real XLIFF files run through **both Xbench and our engine**, comparing results:

```
Golden Test Pipeline:
1. Collect 50+ real XLIFF files from production QA workflow
2. Run through Xbench → capture Xbench output (CSV/XML export)
3. Run through our rule engine → capture our output
4. Compare: every Xbench finding must exist in our results
5. Any gap = test failure → fix rule → re-run
6. Automate as CI regression test
```

| Test Category | Test Count (target) | Purpose |
|--------------|:-------------------:|---------|
| **Per-rule unit tests** | 10-20 per rule (100-200 total) | Each rule works correctly in isolation |
| **Xbench parity tests** | 50+ real files | Our engine >= Xbench on real data |
| **Edge case tests** | 30+ per language pair | Thai, CJK, RTL-specific edge cases |
| **Integration tests** | 20+ | Full pipeline: parse → rules → results |
| **Regression tests** | Auto-generated | Previous findings must still be caught |

_Source: [Golden Tests in AI](https://www.shaped.ai/blog/golden-tests-in-ai), [Testing Rule-Based Systems](https://www.brcommunity.com/articles.php?id=b809)_

#### 1.2 AI Layer Testing

AI outputs are non-deterministic — requires a different testing approach:

**Prompt Regression Testing:**

```typescript
// Use promptfoo or custom eval framework
const testCases = [
  {
    input: {
      source: "Click here to install",
      target: "คลิกที่นี่เพื่อติดตั้ง",
      language_pair: "en-th",
    },
    expected: {
      has_issues: false,  // clean translation
    },
  },
  {
    input: {
      source: "The server is running",
      target: "เซิร์ฟเวอร์กำลังวิ่ง",  // mistranslation: "running" → "วิ่ง" (literal)
      language_pair: "en-th",
    },
    expected: {
      has_issues: true,
      issue_type: "mistranslation",
      severity: "major",
    },
  },
];

// Run evaluation
// Compare AI output vs expected → track precision & recall
// Alert if metrics drop > 10% from baseline (AI drift detection)
```

**AI Evaluation Metrics:**

| Metric | Target | How to Measure |
|--------|:------:|---------------|
| **Precision** (false positive rate) | > 95% | AI findings confirmed by expert / total AI findings |
| **Recall** (false negative rate) | > 90% | Issues caught by AI / total real issues |
| **F1 Score** | > 0.92 | Harmonic mean of precision and recall |
| **Consistency** | < 5% variance | Same input → same output across 10 runs |
| **Drift detection** | Δ < 10% per week | Track metrics weekly; alert on significant change |

**Tools:**
- [**promptfoo**](https://github.com/promptfoo/promptfoo) — open-source prompt testing, regression detection, red teaming
- **DeepEval** — LLM evaluation framework with built-in metrics
- **Custom eval scripts** — run test cases, compare with golden answers

_Source: [LLM Testing 2026](https://www.confident-ai.com/blog/llm-testing-in-2024-top-methods-and-strategies), [promptfoo](https://github.com/promptfoo/promptfoo), [Drift Detection](https://towardsdatascience.com/drift-detection-in-robust-machine-learning-systems/)_

#### 1.3 End-to-End Testing

```
E2E Test Flow:
1. Upload real XLIFF file via API
2. Wait for Inngest pipeline to complete
3. Verify: qa_run status = 'complete'
4. Verify: findings match expected (golden test)
5. Verify: score matches expected (within tolerance)
6. Verify: auto-pass decision correct
7. Test accept/reject/flag actions
8. Verify: feedback stored correctly
```

### 2. AI Integration — Vercel AI SDK Structured Output

**AI SDK 6 (current) key patterns for our pipeline:**

```typescript
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// Layer 2: AI Screening — structured output
const ScreeningResultSchema = z.object({
  segments: z.array(z.object({
    segmentId: z.string(),
    needsDeepAnalysis: z.boolean(),
    reason: z.string().optional(),
    quickSeverity: z.enum(['critical', 'major', 'minor']).optional(),
  })),
  summary: z.string(),
});

async function aiScreen(segments: Segment[], ruleFindings: QAFinding[]) {
  const result = await generateObject({
    model: anthropic('claude-haiku-4-5-20251001'),
    schema: ScreeningResultSchema,
    system: buildScreeningPrompt(ruleFindings),  // inject Layer 1 context
    prompt: formatSegmentsForScreening(segments),
  });

  return result.object;
}

// Layer 3: Deep Analysis — structured output with suggestions
const DeepAnalysisSchema = z.object({
  findings: z.array(z.object({
    segmentId: z.string(),
    category: z.string(),
    severity: z.enum(['critical', 'major', 'minor']),
    message: z.string(),
    sourceSnippet: z.string(),
    targetSnippet: z.string(),
    suggestion: z.string(),
    confidence: z.number().min(0).max(100),
    explanation: z.string(),
  })),
});

async function aiDeepAnalysis(
  flaggedSegments: Segment[],
  ruleFindings: QAFinding[],
  glossary: GlossaryEntry[]
) {
  const result = await generateObject({
    model: anthropic('claude-sonnet-4-5-20250929'),
    schema: DeepAnalysisSchema,
    system: buildDeepAnalysisPrompt(ruleFindings, glossary),
    prompt: formatSegmentsForDeepAnalysis(flaggedSegments),
  });

  return result.object;
}
```

**Key AI SDK Patterns:**
- **`generateObject`** with Zod schema → type-safe AI output, no parsing errors
- **Model-agnostic:** swap `anthropic()` → `openai()` → `google()` without changing logic
- **AI SDK 6:** supports Standard JSON Schema interface → any schema library works
- **Streaming:** `streamObject` for real-time progress on long analysis
- **Batch processing:** process 15 segments per API call (optimal from existing research)

_Source: [AI SDK 6](https://vercel.com/blog/ai-sdk-6), [Structured Outputs with AI SDK](https://www.aihero.dev/structured-outputs-with-vercel-ai-sdk)_

### 3. Development Order — Critical Path

Based on our architecture, the optimal build order that allows **continuous demo-ability**:

```
Phase 1: Foundation (Sprint 1-2)
├── Supabase setup: auth, DB schema, storage, RLS
├── Next.js scaffolding: project structure, routing, shadcn/ui
├── File upload: XLIFF parser integration (xliff npm)
├── Basic segment viewer: show parsed source/target
└── Demo: "Upload XLIFF → see segments" ✅

Phase 2: Rule Engine (Sprint 3-5)
├── Rule engine core: registry, runner, collector
├── Implement 4 Critical rules: tag, missing, number, placeholder
├── Implement 3 Major rules: glossary, punctuation, symbol
├── Implement 3 Minor rules: capitalization, spacing, text format
├── Score calculation: MQM formula
├── Finding display: issue list with severity colors
└── Demo: "Upload → see rule-based findings + score" ✅

Phase 3: Xbench Parity (Sprint 5)
├── Build golden test set from real Xbench output
├── Run parity tests → fix gaps
├── Add bonus rules if needed (URL, unpaired quotes, etc.)
├── Automate as CI regression test
└── Gate: "Rule-based >= Xbench" ✅

Phase 4: AI Pipeline (Sprint 6-8)
├── Inngest setup: durable workflow, step functions
├── Layer 2: AI screening with structured output
├── Layer 3: deep analysis with suggestions
├── Context-aware prompts: inject Layer 1 results
├── Result merger: deduplication logic
├── Progressive streaming: Supabase Realtime updates
├── Economy vs Thorough mode
└── Demo: "Full 3-layer pipeline with streaming results" ✅

Phase 5: Auto-pass & Dashboard (Sprint 8-10)
├── Auto-pass decision engine
├── Content-type warnings
├── Audit trail
├── Dashboard: summary cards, trend chart, export
├── Client feedback (simple ✅/❌)
├── Batch upload + batch summary
├── Report export (PDF/Excel, smart report mode)
└── Demo: "VP sees dashboard, PM auto-passes files" ✅

Phase 6: Polish & Launch (Sprint 10-12)
├── Bulk accept/reject
├── Role-based access control
├── Onboarding flow
├── E2E testing
├── Performance optimization
├── AI prompt tuning from test data
├── Bug fixing
└── Launch gate: all MVP criteria met ✅
```

### 4. Risk Assessment — Implementation Risks

| Risk | Probability | Impact | Mitigation |
|------|:-----------:|:------:|-----------|
| **XLIFF parsing edge cases** — malformed files, non-standard tags | High | Major | Build robust error handling; test with 50+ real files from production; graceful error messages |
| **AI false positive rate too high** | Medium | Critical | Start with conservative prompts; tune iteratively with golden test set; promptfoo regression tests |
| **Inngest cold start latency** | Medium | Minor | Inngest Checkpointing (Dec 2025) reduces inter-step latency by 50%; acceptable for async pipeline |
| **MQM score not intuitive** — users don't understand 0-100 | Medium | Major | Add color-coded ranges (green/yellow/red); show plain language summary ("3 critical issues found") |
| **Glossary import complexity** — TBX is XML-heavy | Low | Minor | Start with CSV/Excel glossary; add TBX in Phase 2 if needed |
| **AI cost overrun** | Low | Major | Economy mode default; Layer 2 filters 80% of segments; monitor cost per file; set spending alerts |
| **Supabase Realtime reliability** | Low | Minor | Polling fallback (5-second interval); retry subscription on disconnect |
| **Tag order validation for CJK/RTL** | Medium | Minor | Make tag order check configurable per language pair; warning not error for reordered tags |

### 5. Key Technical Decisions for Development

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| **XLIFF parser** | `xliff` npm package (no alternatives needed) | 55K downloads/week, supports 1.2+2.0, inline tags, notes |
| **Rule testing framework** | Vitest | Fast, TypeScript-native, good for unit + integration tests |
| **AI evaluation** | promptfoo + custom eval scripts | Open-source, supports multiple providers, regression tracking |
| **Schema validation** | Zod | Works with AI SDK `generateObject`, TypeScript-native |
| **Glossary format MVP** | CSV + Excel only | TBX requires XML parsing library; CSV/Excel trivial with existing parsers |
| **Tag normalization** | Custom adapter: XLIFF 1.2 tags → common format ← XLIFF 2.0 tags | Different tag names between versions; normalize before rule execution |
| **Number locale handling** | Intl.NumberFormat + regex fallback | Browser-native locale awareness; regex for edge cases |
| **Score display** | Integer (round to whole number) | MQM research: decimal places imply false precision at file level |

### 6. AI Cost Optimization Strategies

| Strategy | Savings | Implementation |
|----------|:-------:|---------------|
| **Layer 2 screening** (80% segments skip Layer 3) | ~75% AI cost | Built into architecture — already designed |
| **Economy mode** (no Layer 3) | ~83% AI cost | User choice per run |
| **Batch processing** (15 segments/API call) | ~30% token overhead | Optimal batch size from existing research |
| **Claude Batch API** (async, 50% discount) | ~50% on Layer 3 | For non-urgent/overnight processing |
| **Prompt caching** (Anthropic) | ~90% on cached prefixes | System prompt + glossary cached across segments |
| **Short-circuit** (skip AI if rule score = 100) | Variable | If no rule-based issues found, maybe skip AI entirely |

**Estimated costs at scale:**

| Volume | Economy | Thorough | With optimizations |
|--------|:-------:|:--------:|:-----------------:|
| 10K words/day | ~$0.04/day | ~$0.24/day | ~$0.12/day |
| 100K words/day | ~$0.40/day | ~$2.40/day | ~$1.20/day |
| 1M words/day | ~$4.00/day | ~$24.00/day | ~$12.00/day |

### Implementation Summary

| Area | Status | Confidence |
|------|--------|:----------:|
| **Testing strategy** | Multi-layer test pyramid with golden test sets, prompt regression, AI eval metrics | 🟢 High |
| **AI integration** | Vercel AI SDK 6 `generateObject` with Zod schema — type-safe, model-agnostic | 🟢 High |
| **Development order** | 6 phases, continuously demo-able, critical path defined | 🟢 High |
| **Risk mitigations** | 8 risks identified with concrete mitigations | 🟢 High |
| **Technical decisions** | All key decisions documented with rationale | 🟢 High |
| **Cost optimization** | 6 strategies, 75-90% potential savings | 🟢 High |

---
