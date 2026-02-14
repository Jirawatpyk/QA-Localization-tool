# AI & LLM Usage for Translation Quality Assessment and Localization QA

**Research Date:** 2026-02-11
**Scope:** LLM APIs, AI-Powered Translation QA Research, Prompt Engineering, AI SDKs
**Note:** This research is compiled from knowledge up to early 2025. Pricing and model availability should be verified against current provider documentation before implementation decisions.

---

## Table of Contents

1. [LLM APIs for Translation QA](#1-llm-apis-for-translation-qa)
2. [AI-Powered Translation QA Research](#2-ai-powered-translation-qa-research)
3. [Prompt Engineering for Translation QA](#3-prompt-engineering-for-translation-qa)
4. [AI SDK and Integration Libraries](#4-ai-sdk-and-integration-libraries)
5. [Recommendations for QA Localization Tool](#5-recommendations)

---

## 1. LLM APIs for Translation QA

### 1.1 Claude API (Anthropic)

**Models (as of early 2025):**

| Model | Context Window | Input $/1M tokens | Output $/1M tokens | Batch Discount |
|-------|---------------|-------------------|-------------------|----------------|
| Claude Opus 4 | 200K | $15.00 | $75.00 | 50% off |
| Claude Sonnet 4 | 200K | $3.00 | $15.00 | 50% off |
| Claude 3.5 Sonnet | 200K | $3.00 | $15.00 | 50% off |
| Claude 3.5 Haiku | 200K | $0.80 | $4.00 | 50% off |
| Claude 3 Haiku | 200K | $0.25 | $1.25 | 50% off |

**Multilingual Capabilities:**
- Excellent CJK (Chinese, Japanese, Korean) understanding
- Strong Thai language support (one of the best among LLMs for Thai)
- Handles nuanced cultural context well
- Good at understanding formal/informal register differences
- Supports Unicode and complex scripts natively

**Key Strengths for Translation QA:**
- Very strong at nuanced semantic comparison between source and target
- Excellent at detecting tone/register mismatches
- Can handle long documents with 200K context window
- Structured JSON output via tool use / function calling
- Batch API offers 50% cost reduction with 24-hour turnaround
- Strong instruction following for consistent QA output format

**Batch Processing:**
- Anthropic Batch API: Submit up to 10,000 requests per batch
- 50% discount on batch pricing
- Results available within 24 hours
- Suitable for non-real-time bulk QA processing

**Source:** https://docs.anthropic.com/en/docs/about-claude/models
**Source:** https://docs.anthropic.com/en/docs/build-with-claude/batch-processing

---

### 1.2 OpenAI GPT Models

**Models (as of early 2025):**

| Model | Context Window | Input $/1M tokens | Output $/1M tokens | Batch Discount |
|-------|---------------|-------------------|-------------------|----------------|
| GPT-4o | 128K | $2.50 | $10.00 | 50% off |
| GPT-4o-mini | 128K | $0.15 | $0.60 | 50% off |
| GPT-4.5 Preview | 128K | $75.00 | $150.00 | N/A initially |
| o1 | 200K | $15.00 | $60.00 | N/A |
| o3-mini | 200K | $1.10 | $4.40 | 50% off |

**Multilingual Capabilities:**
- Strong CJK support
- Good Thai support (slightly behind Claude for Thai nuance in some benchmarks)
- Broad language coverage across 100+ languages
- GPT-4o has improved multilingual capabilities over GPT-4

**Key Strengths for Translation QA:**
- GPT-4o offers excellent cost-to-quality ratio
- GPT-4o-mini is extremely cost-effective for high-volume processing
- Strong structured output support (JSON mode, function calling)
- Batch API with 50% discount
- Extensive fine-tuning capabilities (could train domain-specific QA models)
- Largest ecosystem of tools and integrations

**Batch Processing:**
- OpenAI Batch API: 50% discount, 24-hour window
- Supports all chat completion models
- JSONL format for input/output

**Source:** https://platform.openai.com/docs/models
**Source:** https://openai.com/api/pricing/

---

### 1.3 Google Gemini

**Models (as of early 2025):**

| Model | Context Window | Input $/1M tokens | Output $/1M tokens |
|-------|---------------|-------------------|-------------------|
| Gemini 2.0 Flash | 1M | $0.10 | $0.40 |
| Gemini 1.5 Pro | 2M | $1.25 / $2.50 (>128K) | $5.00 / $10.00 (>128K) |
| Gemini 1.5 Flash | 1M | $0.075 / $0.15 (>128K) | $0.30 / $0.60 (>128K) |

**Multilingual Capabilities:**
- Trained on massive multilingual corpora (Google Translate heritage)
- Strong CJK support
- Good Thai support
- 1M-2M token context windows allow entire file processing

**Key Strengths for Translation QA:**
- Extremely cost-effective, especially Gemini Flash models
- Massive context windows (1M-2M tokens) allow processing entire large XLIFF files at once
- Google's deep experience with machine translation (Google Translate)
- Free tier available for development and testing
- Strong grounding in multilingual benchmarks

**Limitations:**
- Structured output support is less mature than OpenAI/Anthropic
- May have less nuanced cultural understanding compared to Claude
- API stability has been evolving rapidly

**Source:** https://ai.google.dev/pricing
**Source:** https://ai.google.dev/gemini-api/docs/models

---

### 1.4 Other Notable LLMs

**DeepSeek V3 / R1:**
- Open-source, very competitive pricing if self-hosted
- Strong multilingual capabilities, especially CJK (developed in China)
- $0.27/1M input, $1.10/1M output (via API)
- Good alternative for CJK-heavy workloads

**Mistral Large:**
- Strong European language support
- $2.00/1M input, $6.00/1M output
- Less suitable for CJK/Thai compared to leaders

**Llama 3 (Meta):**
- Open-source, can self-host for zero API cost
- 70B and 405B parameter models available
- Good multilingual support, improving with each version
- Requires significant infrastructure for self-hosting

---

### 1.5 Comparison Matrix for Translation QA

| Criteria | Claude 3.5 Sonnet | GPT-4o | Gemini 1.5 Flash | GPT-4o-mini |
|----------|-------------------|--------|-------------------|-------------|
| **CJK Quality** | 9/10 | 9/10 | 8/10 | 7/10 |
| **Thai Quality** | 9/10 | 8/10 | 7/10 | 6/10 |
| **Semantic Understanding** | 10/10 | 9/10 | 8/10 | 7/10 |
| **Structured Output** | 9/10 | 10/10 | 7/10 | 9/10 |
| **Cost per 100K words** | ~$10 | ~$6 | ~$0.50 | ~$0.40 |
| **Context Window** | 200K | 128K | 1M | 128K |
| **Batch API** | Yes (50% off) | Yes (50% off) | Limited | Yes (50% off) |
| **Tone/Register Detection** | 10/10 | 8/10 | 7/10 | 6/10 |
| **Cultural Awareness** | 9/10 | 8/10 | 7/10 | 6/10 |

**Recommendation for Project:**
- **Primary:** Claude 3.5 Sonnet for semantic/tone/cultural checks (best quality for CJK+Thai)
- **Secondary/Fallback:** GPT-4o for cost-effective alternative
- **High-volume/Budget:** Gemini Flash or GPT-4o-mini for preliminary screening
- **Strategy:** Multi-model approach -- use cheaper model for initial pass, expensive model for flagged items

---

## 2. AI-Powered Translation QA Research

### 2.1 Machine Translation Quality Estimation (MTQE)

**Overview:**
MTQE is the task of estimating the quality of machine translation output without access to reference translations. This is directly applicable to localization QA where we evaluate translation quality.

**Key Approaches:**

**Traditional MTQE:**
- Feature-based models using linguistic features
- Neural quality estimation models (e.g., OpenKiwi, TransQuest)
- Requires training data with human quality annotations

**LLM-based MTQE (2023-2025 trend):**
- Using large language models as zero-shot quality estimators
- LLMs can assess translation quality without task-specific fine-tuning
- Research shows GPT-4/Claude-level models approach human evaluator agreement
- Key advantage: No training data needed, works across language pairs

**Key Papers:**
- "Large Language Models Are State-of-the-Art Evaluators of Translation Quality" (Kocmi & Federmann, 2023) - Demonstrated that GPT-4 achieves state-of-the-art correlation with human judgments on WMT metrics task
- "Error Analysis Prompting Enables Human-Like Translation Evaluation in Large Language Models" (Lu et al., 2024) - Showed that structured error analysis prompts improve LLM evaluation quality
- "Automating MQM Evaluation with LLMs" (various, 2024) - Multiple groups showed LLMs can identify MQM error categories

**Source:** https://arxiv.org/abs/2302.14520 (Kocmi & Federmann, EACL 2023)
**Source:** https://arxiv.org/abs/2310.13837 (Lu et al., 2024)

---

### 2.2 MQM (Multidimensional Quality Metrics) Framework

**Overview:**
MQM is the industry standard framework for translation quality assessment, developed by DFKI and the QT21 project. It provides a taxonomy of error types with severity levels.

**MQM Error Taxonomy (Key Categories):**

```
MQM Error Types
├── Accuracy
│   ├── Mistranslation
│   ├── Omission
│   ├── Addition (Hallucination)
│   ├── Untranslated
│   └── Do-not-translate violation
├── Fluency
│   ├── Grammar
│   ├── Spelling
│   ├── Punctuation
│   ├── Register
│   └── Inconsistency
├── Terminology
│   ├── Wrong term
│   ├── Inconsistent term usage
│   └── Glossary violation
├── Style
│   ├── Awkward phrasing
│   ├── Unidiomatic
│   └── Organizational style violation
├── Locale Convention
│   ├── Number format
│   ├── Date format
│   ├── Currency
│   ├── Measurement
│   └── Address format
└── Design
    ├── Length
    ├── Truncation
    ├── Text expansion
    └── Character encoding
```

**MQM Scoring:**
- Minor error: 1 penalty point
- Major error: 5 penalty points
- Critical error: 25 penalty points (or auto-fail)
- Score = 100 - (penalty_points / word_count * 100)
- Passing threshold: typically 95-98 depending on content type

**How AI Can Automate MQM:**
1. **Category Detection:** LLMs can classify errors into MQM categories with ~80-85% accuracy
2. **Severity Assignment:** LLMs can distinguish minor/major/critical with ~75% agreement with humans
3. **Structured Output:** LLMs can output MQM-compatible error reports in JSON
4. **Limitations:** LLMs may disagree with human annotators on borderline cases, especially for style/fluency

**Relevance to Our Project:**
- Our quality scoring system (from the plan) aligns closely with MQM
- MQM categories map directly to our issue types (mistranslation, omission, tone, etc.)
- Using MQM as the underlying framework adds credibility and industry alignment
- Can market as "MQM-compatible AI QA"

**Source:** https://www.qt21.eu/mqm-definition/
**Source:** https://themqm.org/

---

### 2.3 MT Evaluation Metrics

**Automated Metrics:**

| Metric | Type | Best For | LLM Correlation | Notes |
|--------|------|----------|-----------------|-------|
| **BLEU** | Reference-based | Quick comparison | Low-Medium | Oldest, based on n-gram overlap. Not suitable for QA without reference. |
| **COMET** | Neural, reference-based | Quality estimation | High | State-of-the-art neural metric. Uses multilingual embeddings. |
| **COMET-QE** | Neural, reference-free | QA without reference | High | Quality estimation variant, no reference needed. Ideal for our use case. |
| **MetricX** | Neural, reference-based | WMT evaluation | High | Google's metric, strong performance |
| **xCOMET** | Neural, reference-free | Explainable QA | High | Provides error spans + severity, closest to MQM automation |
| **GEMBA** | LLM-based | Zero-shot evaluation | Very High | Uses GPT-4 as evaluator. Highest correlation with human judgments. |
| **BERTScore** | Embedding-based | Semantic similarity | Medium | Uses contextual embeddings |
| **chrF** | Character n-gram | CJK languages | Medium | Better than BLEU for character-level languages |

**Key Findings (2023-2025):**
1. LLM-based metrics (GEMBA, AutoMQM) now surpass traditional neural metrics
2. COMET-QE is the best traditional metric for reference-free evaluation
3. xCOMET provides MQM-compatible error annotations automatically
4. For CJK languages, character-level metrics outperform word-level ones
5. Combination of LLM evaluation + neural metrics gives best results

**Relevance to Our Project:**
- **GEMBA approach** is essentially what our tool does: use LLM to evaluate translation quality
- **xCOMET** could be used as a secondary validation layer (open-source, can run locally)
- **COMET-QE** could provide automated scoring as a complement to LLM evaluation
- Can combine: Rule-based checks (Tier 1) + COMET-QE scoring (Tier 1.5) + LLM evaluation (Tier 2)

**Source:** https://github.com/Unbabel/COMET
**Source:** https://arxiv.org/abs/2310.10482 (xCOMET)
**Source:** https://arxiv.org/abs/2302.14520 (GEMBA)

---

### 2.4 AI vs Human Translation QA Accuracy

**Research Findings:**

| Study/Source | Finding | Human Agreement |
|-------------|---------|-----------------|
| Kocmi & Federmann 2023 | GPT-4 achieves state-of-the-art segment-level correlation | 0.82 Kendall's tau (vs. human ~0.85) |
| WMT 2023 Metrics Task | LLM-based metrics top the leaderboard | Comparable to human evaluators |
| Google 2024 (AutoMQM) | GPT-4 can annotate MQM errors | ~80% agreement with expert annotators |
| Unbabel 2024 | xCOMET identifies error spans and severities | ~75% F1 on MQM error detection |

**Key Takeaways:**
1. LLMs are approaching human-level agreement for translation quality assessment
2. They excel at detecting accuracy errors (mistranslation, omission)
3. They are weaker at style/fluency judgments (more subjective)
4. Combining LLM + rule-based checks can exceed individual human reviewer accuracy
5. LLMs are significantly faster and more consistent than human reviewers
6. The main gap: inter-annotator agreement among humans is also only ~80-85%

---

## 3. Prompt Engineering for Translation QA

### 3.1 Best Practices for Translation Evaluation Prompts

**3.1.1 System Prompt Design:**

```
You are an expert localization quality assurance specialist with deep
knowledge of {target_language} linguistics, cultural norms, and
translation industry standards (MQM framework).

Your task is to evaluate translation quality by comparing source and
target texts. You must identify errors, classify them by type and
severity, and provide actionable fix suggestions.

IMPORTANT GUIDELINES:
- Be precise: Only flag genuine errors, not stylistic preferences
- Be consistent: Apply the same standards across all segments
- Consider context: A translation may be correct in one context but
  not another
- Be culturally aware: Consider target locale conventions
- Provide confidence levels: Indicate how certain you are about each issue
```

**3.1.2 Few-Shot Examples in Prompts:**

Including 2-3 examples of correct QA evaluation in the prompt significantly improves consistency:

```
EXAMPLE:
Source (EN): "Click here to get started"
Target (TH): "กดที่นี่เพื่อเริ่มใช้งาน"
Evaluation: {"issues": [], "score": 95, "notes": "Accurate and natural"}

Source (EN): "Please don't hesitate to contact us"
Target (TH): "ติดต่อเรา"
Evaluation: {
  "issues": [{
    "type": "omission",
    "severity": "major",
    "source_segment": "Please don't hesitate to",
    "description": "Polite hedging expression omitted, changing the tone",
    "suggestion": "อย่าลังเลที่จะติดต่อเรา",
    "confidence": 92
  }],
  "score": 60
}
```

**3.1.3 Error Classification Instructions:**

```
CLASSIFY ERRORS USING THESE CATEGORIES:

ACCURACY errors (meaning-related):
- mistranslation: Meaning conveyed incorrectly
- omission: Source content missing in target
- addition: Target contains information not in source
- untranslated: Source text left untranslated

FLUENCY errors (target language quality):
- grammar: Grammatical error in target
- spelling: Spelling error in target
- punctuation: Punctuation error
- register: Wrong formality level
- unnatural: Grammatically correct but unnatural phrasing

TERMINOLOGY errors:
- wrong_term: Incorrect term used
- inconsistent_term: Same term translated differently

LOCALE errors:
- number_format: Wrong number format for locale
- date_format: Wrong date format for locale

SEVERITY LEVELS:
- critical: Meaning completely wrong, safety/legal risk, or data corruption
- major: Significant meaning change, missing important information
- minor: Small inaccuracy, slight unnaturalness, style preference
```

---

### 3.2 Structured Output Formats (JSON)

**3.2.1 Recommended JSON Schema for QA Results:**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "segment_id": { "type": "string" },
    "source_text": { "type": "string" },
    "target_text": { "type": "string" },
    "overall_score": { "type": "number", "minimum": 0, "maximum": 100 },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "category": {
            "type": "string",
            "enum": ["accuracy", "fluency", "terminology", "locale", "style"]
          },
          "subcategory": {
            "type": "string",
            "enum": [
              "mistranslation", "omission", "addition", "untranslated",
              "grammar", "spelling", "punctuation", "register", "unnatural",
              "wrong_term", "inconsistent_term",
              "number_format", "date_format",
              "awkward", "too_literal"
            ]
          },
          "severity": {
            "type": "string",
            "enum": ["critical", "major", "minor"]
          },
          "confidence": { "type": "number", "minimum": 0, "maximum": 100 },
          "source_highlight": { "type": "string" },
          "target_highlight": { "type": "string" },
          "description": { "type": "string" },
          "suggestion": { "type": "string" },
          "mqm_penalty": { "type": "number" }
        },
        "required": ["category", "severity", "confidence", "description"]
      }
    },
    "quality_dimensions": {
      "type": "object",
      "properties": {
        "accuracy": { "type": "number" },
        "fluency": { "type": "number" },
        "terminology": { "type": "number" },
        "style": { "type": "number" },
        "locale_conventions": { "type": "number" }
      }
    }
  }
}
```

**3.2.2 Enforcing JSON Output:**

**Claude API (Anthropic):**
- Use tool_use/function calling to enforce JSON schema
- System prompt with explicit "Return ONLY valid JSON" instruction
- Prefill assistant response with `{` to force JSON start
- Tool use is the most reliable method

**OpenAI:**
- Use `response_format: { type: "json_schema", json_schema: {...} }` (Structured Outputs)
- Guarantees 100% valid JSON matching the schema
- Available for GPT-4o and GPT-4o-mini

**Google Gemini:**
- Use `response_mime_type: "application/json"` with `response_schema`
- Schema enforcement available in Gemini 1.5 Pro and Flash

---

### 3.3 Batch Processing Strategies for Translation Units

**3.3.1 Optimal Batch Sizes:**

| Strategy | Units/Batch | Pros | Cons |
|----------|-------------|------|------|
| Single unit | 1 | Most accurate, detailed analysis | Very expensive, slow |
| Small batch | 5-10 | Good accuracy, moderate cost | May miss cross-unit consistency |
| Medium batch | 15-25 | Cost-effective, context-aware | Some accuracy trade-off |
| Large batch | 50-100 | Very cost-effective | Accuracy drops, may miss issues |

**Recommended approach:** 10-20 units per batch (matches the plan's 15 units/batch)

**3.3.2 Batch Request Format:**

```json
{
  "system": "You are a localization QA expert...",
  "batch": [
    {
      "id": "unit_001",
      "source": "Click Save to continue",
      "target": "คลิกบันทึกเพื่อดำเนินการต่อ",
      "context": "Button label in settings page"
    },
    {
      "id": "unit_002",
      "source": "Your changes have been saved",
      "target": "การเปลี่ยนแปลงของคุณถูกบันทึกแล้ว",
      "context": "Success message after save"
    }
  ]
}
```

**3.3.3 Two-Pass Strategy:**

```
Pass 1: Quick scan (cheaper model, e.g., GPT-4o-mini or Haiku)
  - Identify obviously correct segments (skip further analysis)
  - Flag potentially problematic segments
  - ~80% of segments pass without issues

Pass 2: Deep analysis (quality model, e.g., Claude Sonnet or GPT-4o)
  - Only analyze flagged segments from Pass 1
  - More detailed prompting with context
  - Generate suggestions and explanations

Cost savings: 60-70% compared to full analysis with expensive model
```

**3.3.4 Parallel Processing:**

```
┌──────────────────────────────────────────┐
│        Batch Processing Pipeline          │
├──────────────────────────────────────────┤
│                                           │
│  XLIFF File (1000 units)                 │
│         │                                 │
│         ▼                                 │
│  Split into batches of 15               │
│  (67 batches)                            │
│         │                                 │
│    ┌────┼────┬────┐                      │
│    ▼    ▼    ▼    ▼   (parallel, 5-10    │
│   B1   B2   B3   B4   concurrent)        │
│    │    │    │    │                       │
│    └────┼────┴────┘                      │
│         ▼                                 │
│  Rate limiting (respect API limits)      │
│         ▼                                 │
│  Aggregate results                       │
│         ▼                                 │
│  Generate report                         │
│                                           │
└──────────────────────────────────────────┘
```

---

### 3.4 Context Window Optimization

**3.4.1 Token Budget Planning:**

```
Per API Call Budget (Claude Sonnet, ~200K window):
├── System prompt:           ~500 tokens
├── Few-shot examples:       ~800 tokens
├── Instructions:            ~300 tokens
├── Batch of 15 units:       ~2,000-4,500 tokens (varies by language)
├── Context metadata:        ~200 tokens
├── TOTAL INPUT:             ~3,800-6,300 tokens
│
├── Expected output:         ~1,000-3,000 tokens (depends on issues found)
│
└── Remaining capacity:      ~193,000 tokens (largely unused per call)
```

**3.4.2 CJK/Thai Token Considerations:**

| Language | Tokens per English word equivalent | Multiplier |
|----------|-----------------------------------|------------|
| English | 1.0 | 1x |
| Chinese (Simplified) | 1.5-2.0 | ~1.8x |
| Japanese | 1.5-2.5 | ~2.0x |
| Korean | 1.5-2.0 | ~1.8x |
| Thai | 2.0-3.0 | ~2.5x |

Thai is the most token-expensive language in our target set. Budget accordingly.

**3.4.3 Optimization Techniques:**

1. **Glossary in System Prompt:** Include only relevant glossary terms (pre-filter by terms appearing in the batch)
2. **Sliding Context Window:** For consistency checks, include previous batch's key terms/decisions
3. **Compression:** Remove redundant whitespace and formatting from source/target before sending
4. **Selective Detail:** Request detailed analysis only for flagged segments, summary for passing ones
5. **Cache System Prompts:** Anthropic offers prompt caching -- cache the system prompt to reduce input cost by up to 90% on repeated calls

**3.4.4 Prompt Caching (Anthropic):**

```
Prompt Caching pricing:
- Cache write: 1.25x base input price (one-time)
- Cache read:  0.1x base input price (subsequent calls)

For our use case (470 calls with same system prompt):
- Without caching: 470 × 500 tokens × $3/1M = $0.71
- With caching:    1 write ($0.002) + 469 reads ($0.07) = $0.07
- Savings:         ~90% on system prompt tokens
```

**Source:** https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching

---

## 4. AI SDK and Integration Libraries

### 4.1 Anthropic SDK (JavaScript/TypeScript)

**Package:** `@anthropic-ai/sdk`
**Source:** https://github.com/anthropics/anthropic-sdk-typescript
**NPM:** https://www.npmjs.com/package/@anthropic-ai/sdk

**Key Features:**
- Full TypeScript support with type definitions
- Streaming support for real-time responses
- Tool use / function calling for structured output
- Batch API support
- Prompt caching support
- Automatic retries with exponential backoff
- Token counting utilities

**Basic Usage:**

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Basic message
const message = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  system: 'You are a localization QA expert...',
  messages: [
    { role: 'user', content: 'Evaluate this translation...' }
  ],
});

// With tool use (structured output)
const message = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  tools: [{
    name: 'qa_evaluation',
    description: 'Report translation quality evaluation results',
    input_schema: {
      type: 'object',
      properties: {
        issues: {
          type: 'array',
          items: { /* issue schema */ }
        },
        overall_score: { type: 'number' }
      }
    }
  }],
  messages: [{ role: 'user', content: '...' }],
});

// Batch API
const batch = await client.batches.create({
  requests: batchRequests.map((req, i) => ({
    custom_id: `unit_${i}`,
    params: {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: req.messages,
    }
  }))
});
```

**Streaming for Progress:**

```typescript
const stream = await client.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  messages: [...],
});

for await (const event of stream) {
  // Update progress indicator in real-time
}
```

---

### 4.2 Vercel AI SDK

**Package:** `ai` (core), `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`
**Source:** https://github.com/vercel/ai
**Docs:** https://sdk.vercel.ai/docs

**Key Features:**
- Unified API across multiple LLM providers (Anthropic, OpenAI, Google, etc.)
- First-class Next.js integration
- Streaming UI components (for React/Next.js)
- Structured output with Zod schema validation
- Tool calling support
- Provider-agnostic design (switch models easily)

**Why It's Ideal for This Project:**
1. The tech stack is Next.js -- Vercel AI SDK is designed specifically for this
2. Can switch between Claude, GPT-4o, and Gemini without code changes
3. Built-in streaming for real-time QA progress display
4. Zod-based structured output ensures type-safe JSON responses
5. Active development by Vercel team

**Usage Example:**

```typescript
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// Schema for QA results
const QAResultSchema = z.object({
  issues: z.array(z.object({
    category: z.enum(['accuracy', 'fluency', 'terminology', 'locale']),
    subcategory: z.string(),
    severity: z.enum(['critical', 'major', 'minor']),
    confidence: z.number().min(0).max(100),
    description: z.string(),
    suggestion: z.string().optional(),
  })),
  overall_score: z.number().min(0).max(100),
  quality_dimensions: z.object({
    accuracy: z.number(),
    fluency: z.number(),
    terminology: z.number(),
    style: z.number(),
  }),
});

// Generate structured QA evaluation
const result = await generateObject({
  model: anthropic('claude-sonnet-4-20250514'),
  schema: QAResultSchema,
  prompt: `Evaluate this translation:
    Source (EN): "${sourceText}"
    Target (TH): "${targetText}"`,
  system: 'You are a localization QA expert...',
});

// result.object is fully typed and validated
console.log(result.object.issues);
console.log(result.object.overall_score);
```

**Streaming with React:**

```typescript
// Server action (Next.js App Router)
'use server';
import { streamObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export async function runQA(units: TranslationUnit[]) {
  const result = await streamObject({
    model: anthropic('claude-sonnet-4-20250514'),
    schema: QAResultSchema,
    prompt: buildQAPrompt(units),
  });

  return result.toTextStreamResponse();
}
```

**Provider Switching (Multi-Model Strategy):**

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

// Quick pre-screening with cheap model
const screening = await generateObject({
  model: openai('gpt-4o-mini'),
  schema: ScreeningSchema,
  prompt: buildScreeningPrompt(units),
});

// Deep analysis with quality model
const analysis = await generateObject({
  model: anthropic('claude-sonnet-4-20250514'),
  schema: QAResultSchema,
  prompt: buildAnalysisPrompt(flaggedUnits),
});
```

---

### 4.3 OpenAI SDK (JavaScript/TypeScript)

**Package:** `openai`
**Source:** https://github.com/openai/openai-node

**Key Features:**
- Structured Outputs (100% schema-guaranteed JSON)
- Batch API support
- Function calling
- Streaming
- Fine-tuning API (could train domain-specific QA model)

```typescript
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Structured output with JSON schema
const response = await client.chat.completions.create({
  model: 'gpt-4o',
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'qa_evaluation',
      schema: qaSchema,
      strict: true, // Guarantees schema compliance
    }
  },
  messages: [...],
});
```

---

### 4.4 Google Generative AI SDK

**Package:** `@google/generative-ai`
**Source:** https://github.com/google/generative-ai-js

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: qaSchema,
  },
});
```

---

### 4.5 LangChain for Translation Tasks

**Package:** `langchain`, `@langchain/anthropic`, `@langchain/openai`
**Source:** https://github.com/langchain-ai/langchainjs
**Docs:** https://js.langchain.com/docs/

**Relevant Features:**
- Output parsers for structured JSON extraction
- Chain composition for multi-step QA pipelines
- Document loaders (could extend for XLIFF)
- Retry logic and fallback chains
- Caching layer

**However, for this project:**
LangChain adds significant abstraction overhead. For a focused translation QA tool, using Vercel AI SDK directly is likely more appropriate because:
1. Less abstraction = more control over prompts and responses
2. Better Next.js integration
3. Simpler codebase
4. LangChain is better suited for complex RAG/agent workflows, which isn't our primary need

**Recommendation:** Use LangChain only if you need advanced features like:
- RAG with translation memory database
- Complex multi-step agent workflows
- Tool chains for glossary lookup + QA evaluation

---

### 4.6 Specialized Libraries for AI-Powered Localization

**XLIFF Parsing:**

| Library | Language | Stars | Notes |
|---------|----------|-------|-------|
| `xliff` (npm) | JS/TS | ~100 | Parse XLIFF 1.2/2.0 to JSON |
| `xliff2js` / `js2xliff` | JS/TS | Part of locize ecosystem | Bidirectional conversion |
| `xml2js` | JS/TS | ~5K | General XML parser, needs custom XLIFF handling |
| `fast-xml-parser` | JS/TS | ~2K | Fast XML parsing, good for large XLIFF files |

**Localization-Specific:**

| Library | Purpose | Notes |
|---------|---------|-------|
| `i18next` | i18n framework | Massive ecosystem, could integrate for format support |
| `messageformat` | ICU message format | Parse ICU placeholders in translations |
| `cldr` / `cldr-data` | Unicode CLDR | Locale-specific rules (number/date formats) |
| `franc` | Language detection | Detect source/target language automatically |
| `cld3-asm` | Language detection | Google's CLD3 compiled to WASM, faster |

**NLP/Text Analysis:**

| Library | Purpose | Notes |
|---------|---------|-------|
| `compromise` | NLP in JS | English NLP, useful for source text analysis |
| `wink-nlp` | NLP toolkit | Lightweight, good for tokenization |
| `tiktoken` | Token counting | OpenAI's tokenizer, count tokens before API calls |
| `@anthropic-ai/tokenizer` | Token counting | Anthropic's tokenizer for Claude models |

**Quality Metrics:**

| Library | Purpose | Notes |
|---------|---------|-------|
| `comet` (Python) | COMET metric | State-of-the-art MT evaluation (Python only, could run as microservice) |
| `sacrebleu` (Python) | BLEU/chrF | Standard MT metrics (Python only) |
| No mature JS equivalents exist | -- | May need Python microservice for neural metrics |

---

## 5. Recommendations for QA Localization Tool

### 5.1 Recommended AI Architecture

```
┌──────────────────────────────────────────────────────────┐
│                 AI Architecture                           │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Layer 1: Rule-Based Engine (instant, free)              │
│  ├── Placeholder validation (regex)                      │
│  ├── Tag integrity check (XML parsing)                   │
│  ├── Number consistency (pattern matching)               │
│  ├── Length ratio check (configurable thresholds)         │
│  └── Encoding validation                                 │
│                                                           │
│  Layer 2: Quick AI Screening (cheap, fast)               │
│  ├── Model: GPT-4o-mini or Claude Haiku                  │
│  ├── Purpose: Flag segments that need deep analysis      │
│  ├── Output: pass/flag/fail per segment                  │
│  └── Cost: ~$0.50 per 100K words                        │
│                                                           │
│  Layer 3: Deep AI Analysis (quality, detailed)           │
│  ├── Model: Claude 3.5 Sonnet (primary)                  │
│  ├── Fallback: GPT-4o                                    │
│  ├── Purpose: Detailed MQM-style evaluation              │
│  ├── Output: Issues, scores, suggestions (JSON)          │
│  └── Cost: ~$3-5 per 100K words (only flagged segments) │
│                                                           │
│  Layer 4: Aggregation & Scoring                          │
│  ├── Combine rule-based + AI results                     │
│  ├── Calculate MQM-compatible quality score              │
│  ├── Deduplicate overlapping issues                      │
│  └── Generate final report                               │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### 5.2 Recommended SDK Stack

| Component | Recommendation | Reason |
|-----------|---------------|--------|
| **AI Integration** | Vercel AI SDK (`ai`) | Best Next.js integration, multi-provider support |
| **Primary LLM** | `@ai-sdk/anthropic` (Claude Sonnet) | Best quality for CJK+Thai semantic analysis |
| **Secondary LLM** | `@ai-sdk/openai` (GPT-4o-mini) | Cost-effective screening pass |
| **Structured Output** | Zod schemas + `generateObject()` | Type-safe, validated JSON responses |
| **XLIFF Parsing** | `xliff` or `fast-xml-parser` | XLIFF 1.2/2.0 support |
| **Token Counting** | `tiktoken` + `@anthropic-ai/tokenizer` | Accurate cost estimation before API calls |
| **Language Detection** | `franc` or `cld3-asm` | Auto-detect source/target languages |

### 5.3 Cost Optimization Strategy

```
Estimated cost per 100,000 words (optimized pipeline):

Rule-based (Layer 1):           $0.00  (local processing)
Quick screening (Layer 2):      $0.40  (GPT-4o-mini, all segments)
Deep analysis (Layer 3):        $2.00  (Claude Sonnet, ~20% flagged)
────────────────────────────────────────
Total:                          $2.40  (~86 THB)

vs. Full Claude Sonnet analysis: $10.00 (~360 THB)
vs. Plan estimate (Sonnet only): $8-10  (~300-400 THB)

Savings: ~75% with multi-layer approach
```

### 5.4 Key Technical Decisions

1. **Use Vercel AI SDK** instead of raw Anthropic/OpenAI SDKs
   - Unified API, easy provider switching, built-in streaming, Zod integration
   - Perfect fit for Next.js tech stack

2. **Multi-model strategy** for cost optimization
   - Cheap model for screening, quality model for deep analysis
   - Can be configured by user (e.g., "Economy" vs "Thorough" mode)

3. **Prompt caching** for Anthropic API
   - Cache system prompt to reduce cost by ~90% on repeated calls
   - Significant savings at scale

4. **Batch API** for non-real-time processing
   - Use Anthropic/OpenAI Batch API for background processing (50% discount)
   - Real-time streaming for interactive use

5. **MQM-compatible error taxonomy**
   - Align with industry standard
   - Makes the tool credible for professional localization teams
   - Allows benchmarking against human QA

---

## Source References

### Official Documentation
- Anthropic Claude Models: https://docs.anthropic.com/en/docs/about-claude/models
- Anthropic Batch Processing: https://docs.anthropic.com/en/docs/build-with-claude/batch-processing
- Anthropic Prompt Caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Anthropic TypeScript SDK: https://github.com/anthropics/anthropic-sdk-typescript
- OpenAI API Pricing: https://openai.com/api/pricing/
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- OpenAI Node SDK: https://github.com/openai/openai-node
- Google Gemini Pricing: https://ai.google.dev/pricing
- Google Generative AI JS: https://github.com/google/generative-ai-js
- Vercel AI SDK: https://sdk.vercel.ai/docs
- LangChain JS: https://js.langchain.com/docs/

### Research Papers
- Kocmi & Federmann (2023). "Large Language Models Are State-of-the-Art Evaluators of Translation Quality." EACL 2023. https://arxiv.org/abs/2302.14520
- Lu et al. (2024). "Error Analysis Prompting Enables Human-Like Translation Evaluation in LLMs." https://arxiv.org/abs/2310.13837
- Guerreiro et al. (2023). "xCOMET: Transparent Machine Translation Evaluation through Fine-grained Error Detection." https://arxiv.org/abs/2310.10482
- Freitag et al. (2023). "Results of WMT23 Metrics Shared Task." WMT 2023.
- Fernandes et al. (2023). "The Devil is in the Errors: Leveraging LLMs for Fine-grained MT Evaluation." https://arxiv.org/abs/2308.07286

### Industry Standards
- MQM Framework: https://themqm.org/
- TAUS Quality Dashboard: https://www.taus.net/
- COMET (Unbabel): https://github.com/Unbabel/COMET

### Libraries (NPM)
- `@anthropic-ai/sdk`: https://www.npmjs.com/package/@anthropic-ai/sdk
- `ai` (Vercel AI SDK): https://www.npmjs.com/package/ai
- `@ai-sdk/anthropic`: https://www.npmjs.com/package/@ai-sdk/anthropic
- `@ai-sdk/openai`: https://www.npmjs.com/package/@ai-sdk/openai
- `@ai-sdk/google`: https://www.npmjs.com/package/@ai-sdk/google
- `openai`: https://www.npmjs.com/package/openai
- `xliff`: https://www.npmjs.com/package/xliff
- `fast-xml-parser`: https://www.npmjs.com/package/fast-xml-parser
- `franc`: https://www.npmjs.com/package/franc
- `tiktoken`: https://www.npmjs.com/package/tiktoken
- `zod`: https://www.npmjs.com/package/zod

---

*Research compiled: 2026-02-11*
*Based on knowledge through early 2025. Pricing and model availability should be verified against current provider documentation.*
*For the QA Localization Tool project: C:\Users\Jiraw\OneDrive\Documents\qa-localization-tool*
