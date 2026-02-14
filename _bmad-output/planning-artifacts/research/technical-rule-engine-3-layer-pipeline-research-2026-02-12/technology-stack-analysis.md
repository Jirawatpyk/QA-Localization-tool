# Technology Stack Analysis

> **Note:** General tech stack (Next.js 16, Supabase, Inngest, Vercel AI SDK, shadcn/ui) was thoroughly researched in `technical-qa-localization-tools-and-frameworks-research-2026-02-11.md`. This section focuses exclusively on technology relevant to the **3 research gaps**.

### 1. XLIFF Parsing Library — `xliff` npm Package

The foundation of our rule-based engine depends on correctly parsing XLIFF files into a workable data structure.

**Package:** [`xliff`](https://github.com/locize/xliff) (55K+ downloads/week)

| Capability | Status | Detail |
|-----------|:------:|--------|
| XLIFF 1.2 parsing | ✅ | `<trans-unit>`, `<body>` elements |
| XLIFF 2.0 parsing | ✅ | `<unit>`, `<segment>` elements |
| Inline tag support (1.2) | ✅ | `<g>`, `<x/>`, `<bx/>`, `<ex/>`, `<ph>`, `<bpt>`, `<ept>`, `<it>`, `<sub>` |
| Inline tag support (2.0) | ✅ | Generic elements: `GenericSpan`, `GenericCode` |
| Bidirectional conversion | ✅ | `xliff2js()` (parse) and `js2xliff()` (generate) |
| Translation notes | ✅ | Via `ntKeys` parameter — critical for context-aware AI |
| Source/target extraction | ✅ | `sourceOfjs()` / `targetOfjs()` utilities |

**Output Structure:**
```javascript
{
  resources: {
    namespace: {
      "segment-key": {
        source: "Hello {name}",     // string or array with inline elements
        target: "สวัสดี {name}",
        note: "Greeting message"     // context for AI Layer 3
      }
    }
  },
  sourceLanguage: "en",
  targetLanguage: "th"
}
```

**Critical Finding — Inline Tags as Arrays:**
When inline tags are present, source/target become arrays mixing text and tag objects:
```javascript
source: ["Click ", { GenericSpan: { id: "1", contents: "here" } }, " to continue"]
target: ["คลิก", { GenericSpan: { id: "1", contents: "ที่นี่" } }, " เพื่อดำเนินการต่อ"]
```
This array structure is **essential for tag integrity validation** — our rule engine must compare tag objects (by id and type) between source and target arrays.

**XLIFF Inline Tag Categories (1.2):**

| Tag | Type | Purpose | Validation |
|-----|------|---------|------------|
| `<g>` | Paired wrapper | Wraps text with formatting (bold, italic, link) | Must exist in both source and target with same id |
| `<x/>` | Self-closing standalone | Represents standalone code (line break, image) | Count and id must match |
| `<bx/>` + `<ex/>` | Begin/end pair | Opening/closing codes (paired via `rid`) | Must be paired; `rid` must match |
| `<ph>` | Placeholder | Native standalone codes (variables, tags) | Must match by content or id |
| `<bpt>` + `<ept>` | Begin/end pair | Native paired codes | Must be paired with matching `rid` |
| `<it>` | Isolated | Orphaned paired code (no matching partner) | Flag as warning |
| `<sub>` | Sub-flow | Translatable text within code | Contains text that needs QA too |

_Source: [XLIFF 1.2 Specification](https://docs.oasis-open.org/xliff/v1.2/os/xliff-core.html), [xliff npm package](https://github.com/locize/xliff)_

### 2. Xbench QA Check Categories — Parity Target

Our rule-based engine must match or exceed every Xbench check. Complete Xbench check catalog:

**Content Checks:**

| Xbench Check | Our Engine | Implementation Approach |
|--------------|:----------:|----------------------|
| Untranslated segments | ✅ MVP | Empty target or target === source detection |
| Target identical to source | ✅ MVP | String equality check (with language-pair exceptions for proper nouns, brand names) |

**Formal/Structural Checks:**

| Xbench Check | Our Engine | Implementation Approach |
|--------------|:----------:|----------------------|
| Tag mismatches | ✅ MVP | Compare tag arrays from xliff parser (id, type, count, order) |
| Number mismatches | ✅ MVP | Regex extraction + set comparison (handle locale-specific formats: 1,000.00 vs 1.000,00) |
| URL mismatches | ⚡ Bonus | URL regex extraction + exact match |
| Alphanumeric mismatches | ⚡ Bonus | Extract alphanumeric tokens + compare |
| Unpaired symbols | ✅ MVP | Stack-based bracket/parenthesis matching: `()`, `[]`, `{}` |
| Unpaired quotes | ✅ MVP | Quote pair detection (handle locale-specific quotes: "" vs «» vs「」) |
| Repeated words | ⚡ Bonus | Consecutive duplicate word detection |
| Double blanks | ✅ MVP | Regex: `/\s{2,}/` — maps to our "Unnecessary spacing" check |

**Consistency Checks:**

| Xbench Check | Our Engine | Implementation Approach |
|--------------|:----------:|----------------------|
| Same source → different target | 🔄 Phase 2 | Cross-segment comparison — requires file-level or project-level index |
| Same target → different source | 🔄 Phase 2 | Reverse consistency check |
| Case-sensitive inconsistencies | 🔄 Phase 2 | Variant of above with case normalization |

**Terminology Checks:**

| Xbench Check | Our Engine | Implementation Approach |
|--------------|:----------:|----------------------|
| Key terms deviation | ✅ MVP | Glossary import + term matching (our "Glossary import + term matching" check) |
| Custom checklist rules | ⚡ Bonus | Regex-based custom rules (extensible) |

**Capitalization & Other:**

| Xbench Check | Our Engine | Implementation Approach |
|--------------|:----------:|----------------------|
| UPPERCASE word matching | ✅ MVP | Regex: `/\b[A-Z]{2,}\b/` — extract from source, verify in target |
| CamelCase word matching | ⚡ Bonus | Regex: `/\b[A-Z][a-z]+[A-Z][a-z]+\b/` |
| Spell-checking | ❌ Cut | Removed from scope — AI Layer 3 handles typos |

**Parity Summary:**

| Category | Xbench Checks | Our MVP | Our Bonus | Gap |
|----------|:------------:|:-------:|:---------:|:---:|
| Content | 2 | 2 | — | 0 |
| Formal/Structural | 8 | 4 | 4 | 0 |
| Consistency | 3 | — | — | 3 (Phase 2) |
| Terminology | 2 | 1 | 1 | 0 |
| Capitalization | 2 | 1 | 1 | 0 |
| Spelling | 1 | — | — | AI covers |
| **Total** | **18** | **8** | **6** | **3 (Phase 2) + 1 (AI)** |

> **Key Finding:** Xbench has 18 check types. Our MVP covers 8 core + 6 bonus = 14 directly. The 3 consistency checks require cross-segment analysis (Phase 2). Spelling is handled by AI Layer 3. **We achieve functional parity at MVP if we include the 6 bonus checks.**

_Source: [Xbench QA Features](https://docs.xbench.net/user-guide/work-qa-features/), [Xbench QA Dialog](https://docs.xbench.net/user-guide/dialogs/main-window/qa/)_

### 3. Rule Engine Design Pattern — TypeScript

The rules engine pattern is ideal for our use case: modular, extensible, and testable.

**Core Architecture Pattern:**

```typescript
// Rule Interface — every check implements this
interface QARule {
  id: string;                    // e.g., "tag-integrity"
  name: string;                  // e.g., "Tag Integrity Validation"
  severity: 'critical' | 'major' | 'minor';
  category: string;             // MQM category
  execute(segment: Segment): QAFinding[];
}

// Segment — parsed from XLIFF/Excel
interface Segment {
  id: string;
  source: string | InlineContent[];
  target: string | InlineContent[];
  sourceLanguage: string;
  targetLanguage: string;
  notes?: string[];
  context?: Record<string, string>;
}

// Finding — output of each rule
interface QAFinding {
  ruleId: string;
  segmentId: string;
  severity: 'critical' | 'major' | 'minor';
  category: string;             // MQM category
  message: string;
  sourceSnippet?: string;
  targetSnippet?: string;
  suggestion?: string;          // Rule-based auto-fix suggestion
  confidence: number;           // 1.0 for rule-based (deterministic)
  layer: 1;                     // Always Layer 1 for rule-based
}

// Rule Engine — orchestrates all rules
class RuleEngine {
  private rules: QARule[] = [];

  register(rule: QARule): void { ... }

  execute(segments: Segment[]): QAFinding[] {
    return segments.flatMap(segment =>
      this.rules.flatMap(rule => rule.execute(segment))
    );
  }
}
```

**Key Design Principles:**
- **Each rule is independent** — can be tested, enabled/disabled individually
- **Rules are registered dynamically** — extensible without modifying engine core
- **Deterministic confidence** — rule-based findings always have confidence = 1.0
- **MQM-compatible categories** — findings tagged with MQM error types from day 1

_Source: [Rules Engine Design Pattern](https://softwarehut.com/blog/tech/design-patterns-rules-engine), [Rules Engine TypeScript](https://github.com/andrewvo89/rules-engine-ts)_

### 4. MQM Scoring Framework — Industry Standard

MQM (Multidimensional Quality Metrics) is the industry standard for translation quality scoring. Our scoring algorithm should be **MQM-compatible** for credibility.

**MQM Severity Penalty Multipliers (SPM):**

| Severity | Multiplier | Rationale |
|----------|:---------:|-----------|
| Neutral | 0 | Acceptable variation — flag for attention only |
| Minor | 1 | Limited impact — doesn't impede understanding |
| Major | 5 | Seriously affects usability or comprehension |
| Critical | 25 | Renders content unfit for purpose |

The 0-1-5-25 progression is **exponential by design** — a single Critical error equals 25 Minor errors in penalty weight.

**Scoring Formula:**

```
Step 1: Calculate Absolute Penalty Total (APT)
  APT = Σ (Error Count × SPM × Error Type Weight)

Step 2: Calculate Per-Word Penalty Total (PWPT)
  PWPT = APT / EWC (Evaluation Word Count)

Step 3: Normalize to Reference Word Count (NPT)
  NPT = PWPT × RWC (Reference Word Count, typically 1000)

Step 4: Calculate Quality Score (QS)
  QS = MSV - NPT  (where MSV = 100)
```

**Practical Example:**
For a 5,000-word file with: 2 Critical, 3 Major, 8 Minor errors (all equal error type weight = 1):
```
APT = (2 × 25) + (3 × 5) + (8 × 1) = 50 + 15 + 8 = 73
PWPT = 73 / 5000 = 0.0146
NPT = 0.0146 × 1000 = 14.6
QS = 100 - 14.6 = 85.4 → FAIL (below 95 threshold)
```

**Multi-Range Theory (sample size matters):**

| Range | Sample Size | Scoring Model |
|-------|:-----------:|---------------|
| Small | < 300 words | Statistical Quality Control only — score unreliable |
| Medium | 300–5,000 words | Linear calibrated scoring (our primary range) |
| Large | > 5,000 words | Non-linear calibrated scoring |

> **Critical Insight:** MQM explicitly states that "segment-level scores cannot be accurate in principle." Scores are reliable at **file level** (>200 segments), which aligns with our design of file-level scoring + segment-level issue navigation.

_Source: [MQM Scoring Models](https://themqm.org/error-types-2/the-mqm-scoring-models/), [Multi-Range Theory](https://arxiv.org/html/2405.16969v5)_

### 5. Multi-Layer Pipeline Orchestration Patterns

**Current Industry Patterns (2025-2026):**

The dominant pattern for hybrid rule-based + AI systems is a **layered pipeline with orchestration**:

```
Data Ingestion → Rule Engine → AI Screening → Deep Analysis → Result Fusion → Delivery
```

**Key Orchestration Concepts:**

| Concept | Application to Our Pipeline |
|---------|---------------------------|
| **Context Engineering** | Layer 1 results become context for Layer 2-3 prompts |
| **Hybrid Routing** | If small model uncertain → escalate to powerful model |
| **Role Separation** | Each layer has distinct, non-overlapping responsibilities |
| **Agent Communication Protocol** | Standardized finding format across all layers |
| **Automatic Failover** | If AI API fails → graceful degradation to rule-based only |

**Inngest as Pipeline Orchestrator:**
Inngest's step function pattern maps perfectly to our 3-layer pipeline:

```typescript
inngest.createFunction(
  { id: "qa-pipeline" },
  { event: "qa/file.uploaded" },
  async ({ event, step }) => {
    // Layer 1: Rule-based (instant, free)
    const ruleResults = await step.run("layer-1-rules", async () => {
      return ruleEngine.execute(segments);
    });
    // → Stream Layer 1 results to UI immediately

    // Layer 2: AI Screening (cost-effective)
    const screenResults = await step.run("layer-2-screen", async () => {
      return aiScreen(segments, ruleResults); // Pass rule results as context
    });

    // Layer 3: Deep Analysis (only flagged segments)
    const flaggedSegments = screenResults.flagged;
    const deepResults = await step.run("layer-3-deep", async () => {
      return aiDeepAnalysis(flaggedSegments, ruleResults);
    });

    // Merge & Score
    const merged = await step.run("merge-score", async () => {
      return mergeAndScore(ruleResults, screenResults, deepResults);
    });

    return merged;
  }
);
```

**Clear role separation reduces task failure rates by up to 35%** in multi-agent systems (2026 research), validating our 3-layer isolation approach.

_Source: [LLM Orchestration 2026](https://research.aimultiple.com/llm-orchestration/), [Multi-Agent Systems 2026](https://dasroot.net/posts/2026/02/multi-agent-multi-llm-systems-future-ai-architecture-guide-2026/), [AI Architecture Patterns](https://medium.com/@angelosorte1/ai-architectures-in-2025-components-patterns-and-practical-code-562f1a52c462)_

### 6. Verifika vs Xbench — Competitive Feature Matrix

| Feature | Xbench | Verifika | Our Tool (MVP) |
|---------|:------:|:--------:|:--------------:|
| Tag validation | ✅ | ✅ | ✅ |
| Number validation | ✅ | ✅ | ✅ |
| Terminology check | ✅ | ✅ | ✅ |
| Consistency check | ✅ | ✅ | 🔄 Phase 2 |
| Spell-checking | ✅ | ✅ | AI Layer 3 |
| Custom regex rules | ✅ | ✅ | ⚡ Bonus |
| Direct in-tool correction | ❌ | ✅ | ❌ (accept/reject only) |
| AI semantic analysis | ❌ | ❌ | ✅ |
| AI fix suggestions | ❌ | ❌ | ✅ |
| Auto-pass scoring | ❌ | ❌ | ✅ |
| Cloud/web-based | ❌ | ❌ | ✅ |
| Batch processing | Limited | ✅ | ✅ |
| Dashboard/reporting | ❌ | Limited | ✅ |

> **Key Finding:** Both Xbench and Verifika are **desktop-only, rule-only** tools. Neither has AI capabilities, cloud access, scoring, or auto-pass. Our tool is the first to combine rule-based + AI in a web application. The competitive moat is real.

_Source: [Xbench](https://www.xbench.net/), [Verifika](https://e-verifika.com/), [QA Tools Comparison](https://www.nimdzi.com/translation-quality-assurance-tools/)_

### Technology Stack Summary for Research Gaps

| Research Gap | Key Technology | Confidence |
|-------------|---------------|:----------:|
| **Rule-based Engine** | TypeScript Rule Engine Pattern + `xliff` npm parser | 🟢 High |
| **3-Layer Pipeline** | Inngest step functions + context engineering pattern | 🟢 High |
| **Score Algorithm** | MQM scoring framework (0-1-5-25 multipliers) | 🟢 High |
| **Xbench Parity** | 14/18 checks at MVP + 3 Phase 2 + 1 AI | 🟢 High |
| **XLIFF Tag Validation** | Array-based inline element comparison | 🟡 Medium (edge cases need testing) |

---
