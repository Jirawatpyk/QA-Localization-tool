# Architectural Patterns and Design

### 1. Score Aggregation Algorithm — Complete Specification

This is the **definitive scoring system** for qa-localization-tool, adapted from MQM industry standard with modifications for our multi-layer pipeline.

#### 1.1 Severity Penalty Multipliers (SPM)

Adapted from MQM's exponential scale, calibrated for localization QA:

| Severity | Penalty Points | Rationale |
|----------|:-------------:|-----------|
| **Critical** | 25 | Renders content unfit — mistranslation, missing text, broken tags |
| **Major** | 5 | Seriously affects quality — glossary mismatch, meaning shift |
| **Minor** | 1 | Limited impact — spacing, capitalization, style preference |

> These multipliers are **MQM standard** (0-1-5-25). We drop "Neutral" (0) because our tool only reports actionable findings, not informational flags.

#### 1.2 Core Score Formula

```
Score = max(0, 100 - NPT)

Where:
  APT = Σ (Error Count × SPM × ETW)     — Absolute Penalty Total
  PWPT = APT / EWC                        — Per-Word Penalty Total
  NPT = PWPT × RWC                       — Normed Penalty Total
  EWC = Evaluation Word Count (actual file word count)
  RWC = Reference Word Count = 1000 (normalization constant)
  ETW = Error Type Weight = 1.0 (default, all types equal)
```

#### 1.3 Practical Examples

**Example 1: Clean file (auto-pass)**
- File: 2,000 words, 0 Critical, 1 Major, 3 Minor findings
- APT = (0 × 25) + (1 × 5) + (3 × 1) = 8
- PWPT = 8 / 2,000 = 0.004
- NPT = 0.004 × 1,000 = 4.0
- **Score = 100 - 4.0 = 96.0** → Auto-pass ✅ (> 95, 0 Critical)

**Example 2: Issues found (needs review)**
- File: 5,000 words, 1 Critical, 3 Major, 10 Minor findings
- APT = (1 × 25) + (3 × 5) + (10 × 1) = 50
- PWPT = 50 / 5,000 = 0.01
- NPT = 0.01 × 1,000 = 10.0
- **Score = 100 - 10.0 = 90.0** → Needs review ❌ (has Critical issue)

**Example 3: Poor quality**
- File: 1,000 words, 3 Critical, 5 Major, 15 Minor
- APT = (3 × 25) + (5 × 5) + (15 × 1) = 115
- PWPT = 115 / 1,000 = 0.115
- NPT = 0.115 × 1,000 = 115
- **Score = max(0, 100 - 115) = 0** → Floor at 0

#### 1.4 Auto-pass Decision Logic

```typescript
interface AutoPassDecision {
  passed: boolean;
  score: number;
  reason: string;
  warnings: string[];
}

function evaluateAutoPass(
  score: number,
  findings: QAFinding[],
  project: Project
): AutoPassDecision {
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const threshold = project.autoPassThreshold ?? 95; // configurable per project

  // Rule 1: Any Critical issue → NEVER auto-pass
  if (criticalCount > 0) {
    return {
      passed: false,
      score,
      reason: `${criticalCount} critical issue(s) found`,
      warnings: []
    };
  }

  // Rule 2: Score below threshold → FAIL
  if (score < threshold) {
    return {
      passed: false,
      score,
      reason: `Score ${score} below threshold ${threshold}`,
      warnings: []
    };
  }

  // Rule 3: Content-type warning (non-blocking)
  const warnings: string[] = [];
  if (project.contentType === 'legal' ||
      project.contentType === 'medical' ||
      project.contentType === 'financial') {
    warnings.push(
      `Auto-passed but recommended for QA review (${project.contentType} content)`
    );
  }

  return {
    passed: true,
    score,
    reason: `Score ${score} >= ${threshold} with 0 critical issues`,
    warnings
  };
}
```

#### 1.5 Interim Score — Progressive Calculation

The key innovation: score updates **progressively** as each layer completes.

```
Timeline:     Layer 1 done    Layer 2 done    Layer 3 done
              │                │                │
Score type:   Interim (rules)  Interim (rules   Final
                               + screen)        (all layers)
              │                │                │
Confidence:   🟡 Medium        🟡 Medium        🟢 High
              (rule-based      (+ AI screened   (complete
               findings only)   but no deep)     analysis)
```

**Interim Score Calculation:**

```typescript
function calculateScore(
  findings: QAFinding[],
  wordCount: number,
  mode: 'interim' | 'final'
): ScoreResult {
  const apt = findings.reduce((sum, f) => {
    const spm = { critical: 25, major: 5, minor: 1 }[f.severity];
    return sum + spm;  // ETW = 1.0 for all types
  }, 0);

  const pwpt = apt / wordCount;
  const npt = pwpt * 1000;
  const score = Math.max(0, Math.round((100 - npt) * 100) / 100);

  return {
    score,
    mode,                        // 'interim' or 'final'
    findingCount: findings.length,
    bySeverity: {
      critical: findings.filter(f => f.severity === 'critical').length,
      major: findings.filter(f => f.severity === 'major').length,
      minor: findings.filter(f => f.severity === 'minor').length,
    },
    wordCount,
    penaltyTotal: apt,
    confidence: mode === 'final' ? 'high' : 'medium',
  };
}
```

**Important Design Decision:**
- **Interim score can only go DOWN** — each new layer may find more issues
- **Never auto-pass on interim score** — wait for final score (or Economy mode which is L1+L2 final)
- **Display interim score with "Provisional" label** — user knows it may change
- **Economy mode: L1+L2 = final score** — no waiting for Layer 3

#### 1.6 Economy vs Thorough Mode Scoring

| Aspect | Economy Mode | Thorough Mode |
|--------|:------------:|:-------------:|
| **Layers used** | Layer 1 + Layer 2 | Layer 1 + Layer 2 + Layer 3 |
| **Score finality** | L1+L2 = **final** score | L1+L2+L3 = **final** score |
| **AI findings** | Screening flags only (no suggestions) | Full analysis + suggestions |
| **Auto-pass** | Allowed (based on L1+L2 score) | Allowed (based on full score) |
| **Typical score range** | Higher (fewer findings detected) | Lower (more findings detected) |
| **Cost** | ~$0.40/100K words | ~$2.40/100K words |
| **Use case** | High-volume screening, initial pass | Production QA, client delivery |

> **Key Insight:** Economy mode scores are generally **higher** than Thorough mode because Layer 3 catches issues that Layer 2 doesn't. This is by design — Economy trades depth for speed/cost.

_Source: [MQM Scoring Models](https://themqm.org/error-types-2/the-mqm-scoring-models/), [TQAuditor Formula](https://wiki.tqauditor.com/wiki/Quality_score_formula:Details_and_versions), [Lokalise Scoring](https://docs.lokalise.com/en/articles/11631905-scoring-translation-quality), [Multi-Range Theory](https://arxiv.org/html/2405.16969v5)_

### 2. Rule Engine Architecture — Implementation Detail for Each Check

#### 2.1 Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    RULE ENGINE                            │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ RuleRegistry │→│ RuleRunner  │→│ FindingCollector│   │
│  │             │  │             │  │               │     │
│  │ register()  │  │ execute()   │  │ collect()     │     │
│  │ getAll()    │  │ per segment │  │ deduplicate() │     │
│  │ getById()   │  │ parallel    │  │ sort()        │     │
│  │ enable()    │  │ safe (try/  │  │ format()      │     │
│  │ disable()   │  │  catch)     │  │               │     │
│  └─────────────┘  └─────────────┘  └───────────────┘     │
│                                                          │
│  Rules:                                                  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│  │ Tag    │ │ Missing│ │ Number │ │ Place- │ ...        │
│  │ Check  │ │ Text   │ │ Check  │ │ holder │            │
│  └────────┘ └────────┘ └────────┘ └────────┘           │
│  Each implements QARule interface                        │
│  Each tested independently                              │
│  Each can be enabled/disabled per project               │
└──────────────────────────────────────────────────────────┘
```

#### 2.2 The 10 MVP Rules — Implementation Specifications

**Rule 1: Tag Integrity Validation** — Severity: Critical

```typescript
// What: Source/target must have identical inline tags (by id, type, count, order)
// How: Compare parsed tag arrays from xliff package

function checkTagIntegrity(segment: Segment): QAFinding[] {
  const sourceTags = extractTags(segment.source);  // from xliff parsed array
  const targetTags = extractTags(segment.target);

  const findings: QAFinding[] = [];

  // Check: missing tags in target
  for (const sTag of sourceTags) {
    if (!targetTags.find(t => t.id === sTag.id && t.type === sTag.type)) {
      findings.push({
        severity: 'critical',
        message: `Missing tag <${sTag.type} id="${sTag.id}"> in target`,
      });
    }
  }

  // Check: extra tags in target
  for (const tTag of targetTags) {
    if (!sourceTags.find(s => s.id === tTag.id && s.type === tTag.type)) {
      findings.push({
        severity: 'critical',
        message: `Extra tag <${tTag.type} id="${tTag.id}"> in target`,
      });
    }
  }

  // Check: tag order mismatch (warning, not critical)
  // Some languages may require reordering — configurable

  return findings;
}

// Edge cases:
// - XLIFF 1.2 uses <g>, <x/>, <bx/>, <ex/>, <ph>, <bpt>, <ept>
// - XLIFF 2.0 uses <pc>, <ph>, <sc>, <ec> (different element names)
// - Must normalize to common tag representation before comparing
// - Self-closing vs paired tags: <x/> vs <bx/>...<ex/>
// - Nested tags: <g id="1"><g id="2">text</g></g>
```

**Rule 2: Missing Text / Untranslated Detection** — Severity: Critical

```typescript
// What: Target must not be empty, and should differ from source
// How: String comparison with language-pair awareness

function checkMissingText(segment: Segment): QAFinding[] {
  const sourceText = getPlainText(segment.source);
  const targetText = getPlainText(segment.target);

  // Check 1: Empty target
  if (!targetText || targetText.trim() === '') {
    return [{ severity: 'critical', message: 'Target is empty — missing translation' }];
  }

  // Check 2: Target identical to source (potentially untranslated)
  if (sourceText === targetText) {
    // Exception list: proper nouns, brand names, URLs, code snippets
    if (isLikelyUntranslatable(sourceText)) return [];
    return [{ severity: 'critical', message: 'Target identical to source — potentially untranslated' }];
  }

  return [];
}

// Edge cases:
// - Some segments ARE legitimately identical (brand names, URLs, numbers-only)
// - Short segments like "OK", "N/A" may be valid in both languages
// - Need exception list per project (configurable)
```

**Rule 3: Numeric Consistency** — Severity: Critical

```typescript
// What: Numbers in source must appear in target (locale-aware)
// How: Regex extraction + set comparison

function checkNumbers(segment: Segment): QAFinding[] {
  const sourceText = getPlainText(segment.source);
  const targetText = getPlainText(segment.target);

  // Extract all numbers (handle locale formats)
  const sourceNums = extractNumbers(sourceText);  // "1,000.50" → "1000.50"
  const targetNums = extractNumbers(targetText);

  // Normalize: remove locale-specific separators
  const sourceSet = new Set(sourceNums.map(normalizeNumber));
  const targetSet = new Set(targetNums.map(normalizeNumber));

  const findings: QAFinding[] = [];

  for (const num of sourceSet) {
    if (!targetSet.has(num)) {
      findings.push({
        severity: 'critical',
        message: `Number "${num}" in source not found in target`,
      });
    }
  }

  return findings;
}

// Number extraction regex (handles multiple formats):
// /[-+]?[\d,.\s]+[\d]/g  → then normalize
// Locale-aware: 1,000.50 (EN) vs 1.000,50 (DE) vs 1 000,50 (FR)
// Edge cases:
// - Date formats: 2024-01-15 vs 15/01/2024 vs 15 ม.ค. 2567 (Thai)
// - Phone numbers: +1-555-123-4567
// - Version numbers: v2.3.1
// - Percentages: 50% vs 50 %
```

**Rule 4: Placeholder Matching** — Severity: Critical

```typescript
// What: Placeholders in source must appear in target
// How: Regex extraction + set comparison (multiple placeholder formats)

const PLACEHOLDER_PATTERNS = [
  /\{(\w+)\}/g,           // {name}, {count}
  /\{\{(\w+)\}\}/g,       // {{name}} (Angular/Handlebars)
  /%(\d+\$)?[sdif]/g,     // %s, %d, %1$s (printf-style)
  /%@/g,                  // %@ (iOS/Objective-C)
  /\$\{(\w+)\}/g,         // ${name} (template literals)
  /\[\[(\w+)\]\]/g,       // [[name]] (custom)
  /<(\d+)>/g,             // <1>, <2> (numbered)
];

function checkPlaceholders(segment: Segment): QAFinding[] {
  const sourceText = getPlainText(segment.source);
  const targetText = getPlainText(segment.target);

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const sourceMatches = [...sourceText.matchAll(new RegExp(pattern))];
    const targetMatches = [...targetText.matchAll(new RegExp(pattern))];

    if (sourceMatches.length > 0) {
      const sourceSet = new Set(sourceMatches.map(m => m[0]));
      const targetSet = new Set(targetMatches.map(m => m[0]));

      for (const ph of sourceSet) {
        if (!targetSet.has(ph)) {
          return [{ severity: 'critical', message: `Placeholder "${ph}" missing in target` }];
        }
      }
    }
  }
  return [];
}

// Edge cases:
// - Different projects use different placeholder formats
// - Placeholder ORDER may change between languages (valid in RTL)
// - Some placeholders are inside inline tags (already handled by tag check)
```

**Rule 5: Glossary Term Matching** — Severity: Major

```typescript
// What: Source terms from glossary must be translated with approved target terms
// How: Term lookup in glossary + target text search

function checkGlossary(segment: Segment, glossary: GlossaryEntry[]): QAFinding[] {
  const sourceText = getPlainText(segment.source).toLowerCase();
  const targetText = getPlainText(segment.target).toLowerCase();

  const findings: QAFinding[] = [];

  for (const entry of glossary) {
    // Check if source term exists in source text
    if (sourceText.includes(entry.sourceTerm.toLowerCase())) {
      // Check if approved target term exists in target text
      const hasApprovedTerm = entry.targetTerms.some(
        term => targetText.includes(term.toLowerCase())
      );

      if (!hasApprovedTerm) {
        findings.push({
          severity: 'major',
          message: `Glossary mismatch: "${entry.sourceTerm}" should be translated as "${entry.targetTerms.join('" or "')}"`,
          suggestion: entry.targetTerms[0],
        });
      }
    }
  }

  return findings;
}

// Edge cases:
// - Case sensitivity: configurable per glossary
// - Partial matches: "install" matching "installation" — use word boundary \b
// - Morphological variants: "run" vs "running" — stemming needed?
//   → MVP: exact match with word boundary; Phase 2: stemming
// - Multiple approved translations per term
// - Context-dependent terms (same source → different target depending on context)
//   → Flagged by AI Layer 3, not rule-based
```

**Rules 6-10: Remaining Checks (Summarized)**

| Rule | Severity | Implementation | Key Regex |
|------|:--------:|---------------|-----------|
| **6. Punctuation** | Major | Compare ending punctuation (. vs 。vs !) + paired punctuation | `/(\.|\?|!|。|？|！)$/` |
| **7. Symbol/numbering** | Major | Extract symbols (©, ®, ™, §, #) + list numbering (1. 2. 3.) | `/[©®™§#†‡]/g`, `/^\d+[\.\)]/` |
| **8. Capitalization** | Minor | UPPERCASE words in source must have equivalent in target | `/\b[A-Z]{2,}\b/g` |
| **9. Unnecessary spacing** | Minor | Detect double spaces, leading/trailing spaces, tabs | `/\s{2,}/g`, `/^\s|\s$/` |
| **10. Text format (bold/italic)** | Minor | Formatting tags (`<b>`, `<i>`, `<strong>`, `<em>`) count match | Tag subset of Rule 1 |

**Language-Specific Edge Cases:**

| Language | Edge Case | Handling |
|----------|----------|---------|
| **Arabic (AR)** | RTL text; placeholder order may reverse | Skip order check for RTL |
| **Chinese (ZH)** | No spaces; fullwidth punctuation (。vs .) | Segmentation + fullwidth↔halfwidth mapping |
| **German (DE)** | Compound words (Rindfleischetikettierungsgesetz) | Skip length-based untranslated check |
| **Japanese (JA)** | No spaces; mixed scripts (hiragana, katakana, kanji) | Script-aware comparison + segmentation |
| **Korean (KO)** | Spacing rules differ from English | Korean-specific space validation |
| **Thai (TH)** | No spaces between words (same challenge as ZH/JA) | Word segmentation (`Intl.Segmenter`) |

> **Shared challenge:** TH, ZH, JA all lack spaces between words — `\b` word boundary is unusable. All three require segmentation-based approaches for glossary matching and word-level rules.

### 3. Database Schema — Core Tables for QA Pipeline

```sql
-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  language_pairs JSONB NOT NULL,        -- [{"source": "en", "target": "th"}]
  content_type TEXT DEFAULT 'general',  -- general | legal | medical | financial
  auto_pass_threshold INTEGER DEFAULT 95,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Glossaries (per project)
CREATE TABLE glossaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  source_term TEXT NOT NULL,
  target_terms TEXT[] NOT NULL,          -- multiple approved translations
  case_sensitive BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- QA Runs (one per file upload)
CREATE TABLE qa_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,              -- Supabase Storage path
  file_format TEXT NOT NULL,            -- 'xliff-1.2' | 'xliff-2.0' | 'excel'
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  word_count INTEGER,
  segment_count INTEGER,
  mode TEXT NOT NULL DEFAULT 'thorough', -- 'economy' | 'thorough'

  -- Progressive status
  status TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'parsing' | 'rules' | 'screening' | 'analyzing' | 'scoring' | 'complete' | 'error'
  layer1_complete BOOLEAN DEFAULT false,
  layer2_complete BOOLEAN DEFAULT false,
  layer3_complete BOOLEAN DEFAULT false,

  -- Scores
  score_interim DECIMAL,                -- updated after each layer
  score_final DECIMAL,                  -- set at completion
  auto_pass BOOLEAN,
  auto_pass_reason TEXT,

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Error handling
  error_message TEXT,
  error_layer INTEGER                   -- which layer failed
);

-- QA Findings (unified across all layers)
CREATE TABLE qa_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_run_id UUID REFERENCES qa_runs(id),
  segment_id TEXT NOT NULL,             -- from XLIFF trans-unit id
  layer INTEGER NOT NULL,               -- 1, 2, or 3
  rule_id TEXT,                         -- Layer 1 only (e.g., 'tag-integrity')
  category TEXT NOT NULL,               -- MQM category
  severity TEXT NOT NULL,               -- 'critical' | 'major' | 'minor'
  message TEXT NOT NULL,
  source_snippet TEXT,
  target_snippet TEXT,
  suggestion TEXT,                      -- fix suggestion (AI or rule-based)
  confidence DECIMAL NOT NULL,          -- 1.0 for rules, 0-1 for AI
  ai_explanation TEXT,                  -- enrichment from AI (for rule findings)

  -- User actions
  status TEXT DEFAULT 'pending',        -- 'pending' | 'accepted' | 'rejected' | 'flagged'
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_findings_run ON qa_findings(qa_run_id);
CREATE INDEX idx_findings_severity ON qa_findings(severity);
CREATE INDEX idx_findings_layer ON qa_findings(layer);
CREATE INDEX idx_runs_project ON qa_runs(project_id);
CREATE INDEX idx_runs_status ON qa_runs(status);

-- RLS policies (Supabase)
ALTER TABLE qa_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_findings ENABLE ROW LEVEL SECURITY;
-- Policies based on project membership (not shown for brevity)
```

### 4. System Architecture — How Everything Connects

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Next.js 16)                         │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Upload   │  │ Review   │  │ Dashboard│  │ Project  │               │
│  │ Page     │  │ Page     │  │ Page     │  │ Settings │               │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
│       │              │              │              │                     │
│       │         Supabase Realtime subscription    │                     │
│       │         (qa_runs status changes)          │                     │
└───────┼──────────────┼──────────────┼──────────────┼─────────────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     API LAYER (Next.js API Routes)                       │
│                                                                         │
│  POST /api/qa/upload     → Parse file + trigger Inngest event           │
│  GET  /api/qa/runs/:id   → Get run status + findings                    │
│  POST /api/qa/findings/:id/action → Accept/Reject/Flag                  │
│  GET  /api/dashboard     → Aggregated stats                             │
│  POST /api/projects      → Create/configure project                     │
│  POST /api/glossary      → Import glossary (TBX/CSV/Excel)              │
│  POST /api/feedback      → Client feedback (✅/❌)                       │
└───────┬─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    INNGEST (Durable Workflow Engine)                      │
│                                                                         │
│  Event: "qa/file.uploaded"                                              │
│                                                                         │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐ │
│  │ step:   │──→│ step:   │──→│ step:   │──→│ step:   │──→│ step:   │ │
│  │ parse   │   │ layer-1 │   │ layer-2 │   │ layer-3 │   │ score + │ │
│  │         │   │ rules   │   │ screen  │   │ deep    │   │ finalize│ │
│  └─────────┘   └────┬────┘   └────┬────┘   └────┬────┘   └─────────┘ │
│                     │             │             │                      │
│           Save findings    Save findings  Save findings               │
│           + interim score  + update       + final score               │
│           to Supabase      progress       + auto-pass                 │
│                                                                       │
│  Each step: independent retry, durable state, checkpointed            │
└───────────────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────────┐
│  Supabase DB  │  │  Vercel AI SDK  │  │ Supabase Storage │
│  (PostgreSQL) │  │  (AI Providers) │  │  (Files)         │
│               │  │                 │  │                  │
│  - projects   │  │  Layer 2:       │  │  - XLIFF uploads │
│  - qa_runs    │  │  GPT-4o-mini /  │  │  - Excel uploads │
│  - qa_findings│  │  Claude Haiku   │  │  - Report exports│
│  - glossaries │  │                 │  │                  │
│  - qa_feedback│  │  Layer 3:       │  │                  │
│  - users/auth │  │  Claude Sonnet  │  │                  │
│               │  │                 │  │                  │
│  + Realtime   │  │  Model-agnostic │  │                  │
│    (live      │  │  via AI SDK     │  │                  │
│     updates)  │  │  abstraction    │  │                  │
└───────────────┘  └─────────────────┘  └──────────────────┘
```

### 5. Design Principles Applied

| Principle | Application |
|-----------|------------|
| **Single Responsibility** | Each rule = one check. Each layer = one type of analysis. |
| **Open/Closed** | Rule engine is open for extension (new rules) but closed for modification (engine core doesn't change) |
| **Dependency Inversion** | AI layers depend on `QAFinding` interface, not specific model implementations |
| **Graceful Degradation** | AI failure → rule-based results still available |
| **Progressive Enhancement** | Layer 1 instant → Layer 2 adds value → Layer 3 deepens analysis |
| **Model Agnostic** | Vercel AI SDK abstraction — swap providers without code changes |
| **Data-Driven Evolution** | Feedback loop → prompt tuning → rule generation → quality moat |

### 6. Scalability Considerations

| Dimension | MVP (6-9 users) | Growth (50+ users) | Scale (500+ users) |
|-----------|:---------------:|:------------------:|:------------------:|
| **File processing** | Sequential per user | Parallel via Inngest concurrency | Inngest + queue prioritization |
| **Database** | Supabase free/pro | Supabase pro + connection pooling | Supabase enterprise or dedicated PG |
| **AI API** | Pay-per-use | Batch API (50% cost savings) | Dedicated throughput + caching |
| **Rule engine** | In-process | In-process (fast enough) | Worker process if needed |
| **Storage** | Supabase Storage | Supabase Storage | CDN + S3 for large files |
| **Realtime** | Supabase Realtime | Supabase Realtime (scales well) | Consider SSE fallback |

### Architectural Patterns Summary

| Research Gap | Solution | Confidence |
|-------------|---------|:----------:|
| **Score Algorithm** | MQM-based: `Score = 100 - NPT` with 0-1-5-25 severity multipliers, normalized per 1000 words | 🟢 High — industry standard |
| **Interim Scoring** | Progressive calculation after each layer, "Provisional" label, score only goes down | 🟢 High — clean design |
| **Economy vs Thorough** | Economy = L1+L2 final score; Thorough = L1+L2+L3 final score | 🟢 High |
| **Auto-pass Logic** | Score >= threshold AND 0 Critical; content-type warnings for sensitive content | 🟢 High |
| **Rule Implementation** | 10 rules with specific regex/comparison patterns, language-aware edge cases | 🟢 High — detailed specs |
| **Database Design** | Unified `qa_findings` table across all layers, progressive `qa_runs` status | 🟢 High |
| **System Architecture** | Next.js → API → Inngest → Supabase + AI SDK, Realtime for progress | 🟢 High — validated stack |

---
