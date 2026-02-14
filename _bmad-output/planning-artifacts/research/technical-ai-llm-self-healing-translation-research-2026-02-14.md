---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 6
workflow_completed: true
research_type: 'technical'
research_topic: 'AI/LLM Innovation for Self-healing Translation in QA Localization Tool'
research_goals: 'Research AI techniques and technologies that enable auto-fix capabilities (Self-healing Translation) to transform QA workflow from detect-report-fix to detect-autofix-approve'
user_name: 'Mona'
date: '2026-02-14'
web_research_enabled: true
source_verification: true
---

# Self-healing Translation: AI/LLM Innovation for Autonomous QA Correction in Localization

**Comprehensive Technical Research Report**

**Date:** 2026-02-14
**Author:** Mona
**Research Type:** Technical
**Project:** qa-localization-tool

---

## Executive Summary

The localization industry is undergoing its most significant transformation since the advent of machine translation. With the AI localization market projected to reach **$7.5 billion by 2028** (CAGR 18%) and LLM translation costs expected to drop from $10 to **$2 per 1,000 words by 2028**, the economics of AI-powered translation QA are becoming irresistible. Yet no standalone QA tool today offers what we propose: **Self-healing Translation** — a system that doesn't just detect errors, but automatically generates verified corrections for human approval.

This research confirms that **Self-healing Translation is technically feasible today** using a combination of mature and emerging technologies. LLM-based Automatic Post-Editing (APE) achieves **near human-level quality** with simple one-shot prompting, closing the quality gap by **43%** and improving post-editing speed by **14-30%**. Multi-agent AI architectures — where a Fix Agent generates corrections, a Judge Agent verifies quality, and a Feedback Loop learns from every user decision — are now production-proven, with **57% of organizations** running agents in production.

Our existing technology stack (Vercel AI SDK 6, Supabase with pgvector, Inngest) supports the full Self-healing architecture **without adding new infrastructure**. The key innovation is not any single technology, but the **orchestrated pipeline**: Rule-based auto-fix (free, instant) → AI screening (cheap, fast) → Deep AI fix + verification (premium, accurate) → Progressive trust model (Shadow → Assisted → Autonomous).

**Key Findings:**

- **APE is production-ready**: LLMs match or exceed commercial MT quality for post-editing in many domains
- **No competitor offers standalone AI auto-fix**: We would be first-to-market
- **Cost reduction of 70-85%**: From $150-300/100K words (human QA) to $35-55 (AI + minimal review)
- **Progressive trust model is essential**: Shadow Mode → Assisted → Auto-apply prevents trust destruction
- **Data moat from day 1**: Every accept/reject builds our competitive advantage

**Top 5 Recommendations:**

1. **Implement Self-healing in 4 phases** starting with rule-based auto-fix (Phase 0), then Shadow Mode for calibration
2. **Use RAG + few-shot prompting for MVP**, evolve to fine-tuning with accumulated correction data
3. **Deploy decoupled Fix + Judge agents** to prevent self-evaluation bias and catch hallucinations
4. **Build feedback loop infrastructure from day 1** — this is our long-term competitive moat
5. **Start with English→CJK+Thai language pairs** and calibrate confidence thresholds per pair

---

## Table of Contents

1. [Technical Research Scope Confirmation](#technical-research-scope-confirmation)
2. [Technology Stack Analysis](#technology-stack-analysis)
   - 2.1 Core AI/LLM Technologies (APE, Prompting, Confidence, Multi-agent, LLM-as-Judge, Constrained Decoding)
   - 2.2 Development Frameworks and SDK (Vercel AI SDK 6)
   - 2.3 Competitive Landscape & Market Context
   - 2.4 Technology Adoption Trends
3. [Integration Patterns Analysis](#integration-patterns-analysis)
   - 3.1 LLM Orchestration Patterns
   - 3.2 Inngest Event-Driven Pipeline
   - 3.3 Streaming AI Responses (SSE)
   - 3.4 XLIFF Integration & Preservation
   - 3.5 Supabase Realtime + pgvector RAG
   - 3.6 TMS Integration Possibilities
   - 3.7 API Security for AI Pipeline
4. [Architectural Patterns and Design](#architectural-patterns-and-design)
   - 4.1 Self-Correcting Agent Architecture
   - 4.2 Human-in-the-Loop Trust Architecture
   - 4.3 Feedback Loop Learning Architecture
   - 4.4 Scalability Architecture — Serverless AI Pipeline
   - 4.5 Complete Self-healing Translation Architecture (Proposed)
5. [Implementation Approaches and Technology Adoption](#implementation-approaches-and-technology-adoption)
   - 5.1 Phased Implementation Roadmap
   - 5.2 Testing & Quality Assurance for AI Fixes
   - 5.3 Cost Optimization Strategy
   - 5.4 Deployment & Observability
   - 5.5 Risk Assessment & Mitigation
6. [Technical Research Recommendations](#technical-research-recommendations)
7. [Future Outlook & Innovation Opportunities](#future-outlook--innovation-opportunities)
8. [Research Methodology & Source Documentation](#research-methodology--source-documentation)

---

## 1. Technical Research Introduction

### Research Significance

The localization industry stands at an inflection point. Traditional QA tools like Xbench, developed in the early 2010s, can only detect **syntactic errors** — missing tags, broken placeholders, number mismatches. They are blind to the problems that matter most: **semantic accuracy, tone consistency, cultural appropriateness, and fluency**. This forces organizations into expensive, multi-round human review cycles that consume 60-80% of QA budgets.

Meanwhile, Large Language Models have demonstrated remarkable capability in understanding and generating multilingual text. The gap between "AI can find the error" and "AI can fix the error" has narrowed dramatically. LLM-based Automatic Post-Editing now matches commercial MT quality for many language pairs, and multi-agent AI architectures provide the verification layer needed for production trust.

**This research investigates whether we can bridge that gap** — transforming our QA tool from a "detective" (find and report) into a "doctor" (diagnose and treat) — creating a Self-healing Translation system that detects errors, generates verified corrections, and learns from every human decision.

### Research Methodology

- **Technical Scope:** AI/LLM technologies, integration patterns, architectural design, implementation approaches
- **Data Sources:** Academic papers (ACL, COLING 2025), industry reports (Slator, Nimdzi), official documentation (Vercel, Supabase, Inngest), market analysis
- **Analysis Framework:** Technology evaluation matrix (feasibility × impact × alignment with stack)
- **Time Period:** Focus on 2025-2026 current state with 2027-2028 projections
- **Verification:** Multi-source validation for all critical claims, confidence levels assigned

### Research Goals Achievement

**Original Goal:** Research AI techniques and technologies that enable auto-fix capabilities to transform QA workflow from detect-report-fix to detect-autofix-approve

**Achieved:**
- Identified 6 core AI technologies that make Self-healing possible (APE, RAG, Confidence Scoring, Multi-agent, LLM-as-Judge, Constrained Decoding)
- Confirmed all integrate with our existing stack (Vercel AI SDK 6, Supabase, Inngest)
- Validated competitive gap — no standalone tool offers this capability
- Designed complete end-to-end architecture with 4-phase rollout plan
- Estimated ROI: 70-85% cost reduction, 60-80% time reduction

_Sources: [AI Localization Roadmap 2025-2028](https://medium.com/@hastur/embracing-ai-in-localization-a-2025-2028-roadmap-a5e9c4cd67b0), [AI Localization Growth 2025-2033](https://www.marketreportanalytics.com/reports/ai-localization-75759), [TMS Market Growth](https://www.grandviewresearch.com/industry-analysis/translation-management-systems-market-report)_

---

## Technical Research Scope Confirmation

**Research Topic:** AI/LLM Innovation for Self-healing Translation in QA Localization Tool
**Research Goals:** Research AI techniques and technologies that enable auto-fix capabilities (Self-healing Translation) to transform QA workflow from detect-report-fix to detect-autofix-approve

**Technical Research Scope:**

**Track A: AI Fix Technology**
- Automatic Post-Editing (APE) — academic research and current implementations
- LLM Prompting Strategies — techniques for accurate translation correction
- Fine-tuning vs RAG vs Few-shot — best approach for localization domain
- Confidence Calibration — reliable confidence scoring for fixes
- Multi-agent AI Pipeline — detect → fix → verify architecture
- LLM-as-Judge — AI quality verification before presenting to user
- Constrained Generation — preserving format, tags, placeholders

**Track B: Fix UX & Trust Patterns**
- AI-assisted Correction UX — patterns from GitHub Copilot, Grammarly, Google Translate
- Progressive Trust Building — suggest → auto-apply progression
- Confidence Visualization — confidence level display for user decision-making
- Tiered Auto-fix Levels — Level 1 (auto) → Level 2 (1-click) → Level 3 (review)

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-02-14

---

## Technology Stack Analysis

### Core AI/LLM Technologies for Self-healing Translation

#### 1. Automatic Post-Editing (APE) — Foundation Technology

APE คือ academic foundation ของ Self-healing Translation โดยตรง — การแก้ไข machine translation output อัตโนมัติ

**State-of-the-Art (2025-2026):**
- Proprietary LLMs (GPT-4, Claude) achieve **near human-level APE quality** even with simple one-shot prompting
- LLM-based APE with retrieval-augmented prompting now **matches or exceeds commercial MT** for some domains and languages
- APE can improve the quality gap between machine translations and finished edits by **43%**, saving time significantly
- LLM-guided APE shows **productivity gains of 14-30%** in post-editing speed relative to from-scratch translation
- However, proprietary LLM costs and latency overheads remain practical challenges for real-world deployment

**Key Research — MQM-APE Framework:**
- MQM-APE introduces a training-free approach to filter out non-impactful errors by automatically post-editing translations
- Combines MQM error taxonomy with APE for high-quality error annotation prediction
- Directly applicable to our QA tool's existing MQM-based scoring system

**Research Gap:** LLM outputs are more conservative — applying fewer edits but with higher precision. This is actually ideal for QA auto-fix (precision over recall).

_Confidence: 🟢 High — Multiple verified sources confirm LLM APE maturity_
_Sources: [MQM-APE Paper](https://arxiv.org/abs/2409.14335), [APE Overview](https://machinetranslate.org/automatic-post-editing), [LLM Context in APE](https://arxiv.org/abs/2601.19410), [LangMark Dataset](https://aclanthology.org/2025.acl-long.1569.pdf)_

#### 2. LLM Prompting Strategies for Translation Correction

**Fine-tuning vs RAG vs Few-shot — Which Approach?**

| Approach | Best For | Pros | Cons |
|----------|----------|------|------|
| **Few-shot Prompting** | Quick start, general fixes | Zero training cost, flexible | Lower precision on domain-specific terms |
| **RAG (Retrieval-Augmented)** | Glossary/TM-aware fixes | Real-time knowledge, updatable | Retrieval quality dependency |
| **Fine-tuning** | Domain-specific corrections | Highest accuracy, lower inference cost | Training data needed, model updates costly |
| **Hybrid (RAG + Fine-tuning)** | Production deployment | Best of both worlds | Higher complexity |

**2026 Trend:** Focus is on quality, expertise, and precision rather than quantity. Hybrid approaches combining fine-tuning with RAG achieve the best results — RAG handles fresh terminology/glossary updates while fine-tuning embeds domain knowledge.

**For Our Tool — Recommended Approach:**
- **MVP:** Few-shot prompting with RAG (glossary + TM retrieval) — fast to implement, good quality
- **Phase 2:** Fine-tune on accumulated QA correction data — builds data moat
- **Phase 3:** Hybrid with distillation — extract reusable correction patterns

_Confidence: 🟢 High — Well-established techniques with clear trade-offs_
_Sources: [Fine-tuning Guide 2026](https://keymakr.com/blog/llm-fine-tuning-complete-guide-to-domain-specific-model-adaptation-2026/), [LLM Training Methodologies 2025](https://klizos.com/llm-training-methodologies-in-2025/), [Fine-tuning with RAG](https://arxiv.org/abs/2510.01375)_

#### 3. Confidence Calibration & Quality Estimation

**Translation Quality Estimation (QE) Technologies:**

- **GEMBA (GPT Estimation Metric Based Assessment):** First MT assessment approach leveraging zero-shot prompting of LLMs. Uses four template variants (GEMBA-DA, GEMBA-stars) for quality judgment
- **RUBRIC-MQM (2025):** Span-level LLM-as-judge approach building on GEMBA-MQM — provides granular error detection at word/phrase level
- **Hybrid QE Model:** MTQE provides fast scalable predictions + AI LQA brings structured MQM analysis + human oversight ensures trust

**Performance Characteristics:**
- QE models perform best at extremes — excellent at identifying very bad and very good translations
- Mid-range quality segments remain challenging — exactly where human review is needed
- Multilingual LLM judges display poor cross-language consistency (important for Thai, Japanese, Korean)

**For Our Auto-fix Confidence Scoring:**
- Use GEMBA-style scoring for quick confidence estimation (Layer 2)
- Apply RUBRIC-MQM for span-level fix confidence in deep analysis (Layer 3)
- Calibrate confidence thresholds per language pair (critical for CJK+Thai)

_Confidence: 🟡 Medium-High — QE is mature but multilingual calibration needs work_
_Sources: [GEMBA Metric](https://www.emergentmind.com/topics/gemba-metric), [RUBRIC-MQM](https://aclanthology.org/2025.acl-industry.12.pdf), [QE Overview](https://machinetranslate.org/quality-estimation), [MTQE vs AI LQA 2025](https://www.contentquo.com/blog/mtqe-vs-ai-lqa-2025)_

#### 4. Multi-Agent AI Pipeline Architecture

**2026 — The Year of Multi-Agent Systems:**
- Gartner reported **1,445% surge** in inquiries about multi-agent systems (Q1 2024 → Q2 2025)
- 57% of respondents have agents in production, with large enterprises leading
- Quality is the #1 production barrier (32% cite it as top challenge)

**Relevant Architectural Patterns:**

**Sequential Pipeline (Most Relevant for Our Tool):**
```
Agent 1 (Detector) → Agent 2 (Fixer) → Agent 3 (Verifier)
```
Each agent specializes: detect errors → generate fixes → verify fix quality

**Verification Pattern — "Checks and Balances":**
- Dedicated Verifier Agents monitor production agents' outputs
- Creates independent quality layer — AI fix verified by separate AI judge
- Catches hallucinations and over-corrections before user sees them

**For Our Self-healing Pipeline:**
```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Rule-based Detection (existing)                │
│ → Auto-fix: Tag repair, placeholder restore (99% safe)  │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: AI Screening Agent                             │
│ → Quick fix for obvious issues (terminology, numbers)   │
│ → Flag complex issues for Layer 3                       │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Deep Analysis + Fix Agent                      │
│ → Generate correction with explanation                  │
│ → Verifier Agent checks fix quality                     │
│ → Confidence score assigned                             │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Auto-apply or Present to User                  │
│ → 🟢 High confidence (>95%) → Auto-apply               │
│ → 🟡 Medium (70-95%) → Suggest with 1-click apply      │
│ → 🔴 Low (<70%) → Flag for human review                │
└─────────────────────────────────────────────────────────┘
```

_Confidence: 🟢 High — Multi-agent patterns are well-established and production-proven_
_Sources: [Multi-Agent Architecture Guide 2026](https://www.clickittech.com/ai/multi-agent-system-architecture/), [Agentic Workflow Guide 2026](https://www.stack-ai.com/blog/the-2026-guide-to-agentic-workflow-architectures/), [O'Reilly Multi-Agent Design](https://www.oreilly.com/radar/designing-effective-multi-agent-architectures/), [LangChain State of Agents](https://www.langchain.com/state-of-agent-engineering)_

#### 5. LLM-as-Judge for Fix Verification

**Why LLM-as-Judge is Critical for Self-healing:**
The auto-fix must be verified before presenting to users — wrong fixes destroy trust faster than no fix at all.

**Key Technologies:**
- **GEMBA-MQM:** Zero-shot prompting for translation quality assessment — rate 0-100 with error categorization
- **RUBRIC-MQM (2025 ACL):** Span-level evaluation — pinpoints exactly where the fix improved or worsened translation
- **LLM-as-Judge best practices:** Use separate model for judging (avoid self-evaluation bias), provide rubrics, test for cross-language consistency

**Implementation Pattern:**
```
Fix Agent (Claude Sonnet) → generates correction
                ↓
Judge Agent (separate model/prompt) → evaluates fix quality
                ↓
If Judge approves → present to user with confidence score
If Judge rejects → either retry with different approach or flag for human
```

**Challenge:** Multilingual LLM judges show poor cross-language consistency — critical concern for our Thai, Japanese, Korean targets. May need language-specific judge calibration.

_Confidence: 🟡 Medium-High — Technology works but multilingual calibration is active research area_
_Sources: [LLM-as-Judge Guide 2026](https://labelyourdata.com/articles/llm-as-a-judge), [GEMBA Metric](https://medium.com/data-science/exploring-gemba-a-new-llm-based-metric-for-translation-quality-assessment-3a3383de6d1f), [Multilingual Judge Reliability](https://aclanthology.org/2025.findings-emnlp.587.pdf), [Langfuse LLM-as-Judge](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge)_

#### 6. Constrained Decoding & Format Preservation

**The Problem:** When AI generates a fix, it must preserve XLIFF tags, placeholders (`{0}`, `%s`), HTML entities, and formatting — breaking these creates worse problems than the original error.

**Solution — Constrained Decoding:**
- Filters model's token predictions to only allow valid options at each step
- Ensures **100% compliance** with complex format constraints
- Recent advances (IterGen, XGrammar, DOMINO) achieve **near-zero speed overhead**

**Best Practice for Translation Fixes:**
- Specify format constraints in the prompt AND use constrained decoding
- This "belt and suspenders" approach minimizes format violations
- For XLIFF: define grammar that enforces tag matching and placeholder preservation

**Implementation Options:**
| Tool | Integration | Speed | Maturity |
|------|------------|-------|----------|
| **Structured Output (OpenAI/Anthropic)** | API-native | Fast | 🟢 Production |
| **Outlines** | Python library | Fast | 🟢 Stable |
| **vLLM Structured Decoding** | Self-hosted | Very Fast | 🟢 Production |
| **XGrammar** | Low-level | Near-zero overhead | 🟡 Newer |

**For Our Tool:** Vercel AI SDK already supports structured outputs — we can define Zod schemas that enforce tag/placeholder preservation in fixes.

_Confidence: 🟢 High — Constrained decoding is production-ready with multiple implementations_
_Sources: [Constrained Decoding Guide](https://mbrenndoerfer.com/writing/constrained-decoding-structured-llm-output), [vLLM Structured Decoding](https://blog.vllm.ai/2025/01/14/struct-decode-intro.html), [Guided Generation](https://arxiv.org/abs/2403.06988)_

### Development Frameworks and SDK

#### Vercel AI SDK (Our Current Stack)

**AI SDK 6 (Latest — 2025-2026):**
- **Agent Abstraction:** Define reusable agents with model, instructions, and tools — ideal for our multi-agent pipeline
- **Unified generateObject + generateText:** Multi-step tool calling with structured output at the end — perfect for detect → fix → verify flow
- **SSE-based Streaming:** Server-Sent Events for stable real-time response streaming
- **Dynamic Tools:** Runtime-defined tools with inputSchema/outputSchema — enables pluggable fix strategies per language pair
- **Type-safe UI Streaming:** Built-in framework support for Next.js

**Fit for Self-healing Translation:**
- Agent class wraps generateText/streamText — can build Detector, Fixer, Verifier as separate agents
- Structured output ensures fixes conform to expected format (Zod schemas for XLIFF integrity)
- Streaming enables progressive UI updates (show fix as it's generated)

_Confidence: 🟢 High — We already use Vercel AI SDK, upgrade path is clear_
_Sources: [AI SDK 6](https://vercel.com/blog/ai-sdk-6), [AI SDK Docs](https://ai-sdk.dev/docs/introduction), [Building AI Agents with Vercel](https://vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk)_

### Competitive Landscape & Market Context

#### Current QA Tool Landscape (2025-2026)

| Tool | AI Auto-fix | QE/Confidence | Multi-agent | Standalone |
|------|-----------|---------------|-------------|-----------|
| **Xbench** | ❌ None | ❌ None | ❌ | ✅ Yes |
| **Verifika** | ❌ None | ❌ None | ❌ | ✅ Yes |
| **QA Distiller** | ❌ None | ❌ None | ❌ | ✅ Yes |
| **Crowdin AI QA** | 🟡 Basic suggest | 🟡 Basic | ❌ | ❌ TMS-embedded |
| **Smartcat** | 🟡 Translation-level | 🟡 Basic | ❌ | ❌ TMS-embedded |
| **Lokalise AI** | 🟡 Proofreader | 🟡 Basic | ❌ | ❌ TMS-embedded |
| **Our Tool** | 🟢 **Full pipeline** | 🟢 **MQM-based** | 🟢 **Multi-agent** | ✅ **Yes** |

**Key Insight:** No standalone QA tool offers AI auto-fix. TMS platforms (Crowdin, Smartcat, Lokalise) have basic AI QA but it's embedded and not portable. **Our tool would be the first standalone AI-powered QA tool with self-healing capability.**

_Confidence: 🟢 High — Competitive gap confirmed through multiple sources_
_Sources: [Nimdzi QA Tools](https://www.nimdzi.com/translation-quality-assurance-tools/), [AI Localization 2026](https://crowdin.com/blog/ai-localization), [Smartcat XLIFF](https://www.smartcat.com/xliff-translation-editor/), [Lokalise](https://lokalise.com/)_

### Technology Adoption Trends

#### Key Trends Shaping Self-healing Translation (2026)

1. **Agentic AI is mainstream** — 57% have agents in production, multi-agent orchestration is the dominant pattern
2. **LLM costs dropping rapidly** — Makes per-segment AI processing economically viable for localization
3. **Structured output is solved** — API-native support from all major LLM providers
4. **XLIFF 3.0 evolution** — Better interoperability standards reduce integration friction
5. **Hybrid QE models** — Combining automated scoring with human oversight is best practice
6. **APE is mature** — LLM-based post-editing matches or exceeds commercial MT quality for many domains

#### Emerging Technologies to Watch

- **Distillation for APE** — Train smaller, faster models from larger model corrections
- **Language-specific adapter tuning** — LoRA adapters per language pair for efficient specialization
- **Real-time streaming corrections** — Show fixes progressively as AI processes segments
- **Feedback loop learning** — User accept/reject decisions improve future fix quality

_Sources: [Agentic AI Trends 2026](https://machinelearningmastery.com/7-agentic-ai-trends-to-watch-in-2026/), [AI Translation Quality](https://lokalise.com/blog/ai-translation-quality/), [Multi-Agent 2026](https://medium.com/@dmambekar/why-2026-is-pivotal-for-multi-agent-architectures-51fbe13e8553)_

---

## Integration Patterns Analysis

### API Design Patterns for Self-healing Translation Pipeline

#### 1. LLM Orchestration Patterns

สำหรับ Self-healing Translation จำเป็นต้องใช้ LLM Orchestration ที่มีประสิทธิภาพเพื่อจัดการ multi-step AI pipeline

**Pattern ที่เหมาะสม:**

| Pattern | คำอธิบาย | เหมาะกับ | ข้อดี |
|---------|---------|---------|------|
| **Pipeline Workflow** | แบ่ง operations เป็น stages ตามลำดับ | Detect → Fix → Verify flow | Scale แต่ละ stage แยกกัน |
| **Orchestrator-Worker** | ศูนย์กลางมอบงานให้ specialized workers | Agent routing ตาม issue type | ยืดหยุ่น จัดการง่าย |
| **Parallelization & Routing** | แยก tasks แล้ว route ไป model ที่เหมาะ | หลาย segments พร้อมกัน | เร็วมาก |

**Recommended Architecture for Our Tool:**

```
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR (Inngest)                     │
│  Receives QA Run event → routes segments to pipeline         │
└──────────────┬──────────────────────────────┬────────────────┘
               │ (batch segments)             │
    ┌──────────▼──────────┐       ┌──────────▼──────────┐
    │  Worker Pool A       │       │  Worker Pool B       │
    │  Rule-based checks   │       │  AI Screening        │
    │  (parallel, instant) │       │  (parallel, batched)  │
    └──────────┬──────────┘       └──────────┬──────────┘
               │                              │
               └──────────────┬───────────────┘
                              │ (flagged segments only)
                   ┌──────────▼──────────┐
                   │  Worker Pool C       │
                   │  Deep Analysis +     │
                   │  Fix Generation +    │
                   │  Fix Verification    │
                   └──────────┬──────────┘
                              │
                   ┌──────────▼──────────┐
                   │  Score Aggregator    │
                   │  + Auto-apply Logic  │
                   └─────────────────────┘
```

**Localization AI Roadmap Alignment:**
- 2025: LLM-augmented translation (we're here — detect + flag)
- 2026: Automated QA + self-healing (our innovation target)
- 2027-28: Highly automated, context-aware localization pipeline (our vision)

_Confidence: 🟢 High — Pipeline pattern well-established, Inngest supports natively_
_Sources: [LLM Orchestration 2026](https://research.aimultiple.com/llm-orchestration/), [5 Scalable LLM Patterns](https://latitude-blog.ghost.io/blog/5-patterns-for-scalable-llm-service-integration/), [AI in Localization Roadmap 2025-2028](https://medium.com/@hastur/embracing-ai-in-localization-a-2025-2028-roadmap-a5e9c4cd67b0)_

#### 2. Inngest Event-Driven Integration (Our Queue System)

Inngest เป็น queue system ที่เราเลือกไว้แล้ว — ข้อมูลล่าสุดยืนยันว่าเป็นตัวเลือกที่ถูกต้องสำหรับ AI pipeline

**Key Capabilities for Self-healing:**
- **Durable Execution** — ไม่ต้องจัดการ queue infrastructure เอง, retry อัตโนมัติ
- **step.run() + step.ai.infer()** — เครื่องมือที่ดีที่สุดสำหรับ AI apps บน Serverless
- **Concurrency Control** — จำกัด parallel AI calls เพื่อควบคุม cost
- **Event-driven** — QA Run event triggers pipeline, database change triggers notification
- **MCP Support** — Dev server รองรับ Claude Code/Cursor integration แล้ว

**Self-healing Pipeline Events:**

```typescript
// Event flow for self-healing
"qa/run.created"        → Start pipeline
"qa/segment.analyzed"   → Rule-based check done
"qa/segment.screened"   → AI screening done
"qa/segment.deep-analyzed" → Deep analysis + fix generated
"qa/fix.verified"       → Fix quality verified
"qa/fix.auto-applied"   → High-confidence fix applied
"qa/fix.pending-review" → Fix ready for human review
"qa/run.completed"      → All segments processed
```

**Integration with Vercel:**
- Inngest functions deploy as Vercel Serverless Functions
- Each step runs as separate invocation → stays within serverless limits
- Built-in observability → track pipeline progress per segment

_Confidence: 🟢 High — Inngest is our chosen stack, fits perfectly_
_Sources: [Inngest](https://www.inngest.com/), [Inngest GitHub](https://github.com/inngest/inngest), [Durable Workflow Engine](https://www.inngest.com/blog/how-durable-workflow-engines-work)_

### Communication Protocols & Data Flow

#### 3. Streaming AI Responses (SSE)

Real-time feedback เป็นสิ่งสำคัญสำหรับ Self-healing UX — user ต้องเห็นว่า AI กำลังทำอะไร

**Server-Sent Events (SSE) for Translation Fixes:**
- Vercel AI SDK ใช้ SSE-based streaming เป็น default
- `toUIMessageStreamResponse()` แปลง raw AI output เป็น format ที่ frontend render ได้ทันที
- Streaming ทำให้ user เห็น fix "กำลังถูกสร้าง" แทนที่จะรอ 10+ วินาที

**UX Impact:**
- **Without streaming:** Upload → รอ 30 วินาที → เห็นผลทั้งหมดพร้อมกัน (สร้างความเครียด)
- **With streaming:** Upload → เห็น progress ทันที → segments ถูก process ทีละตัว (รู้สึกเร็ว)

**Implementation Pattern for Fix Streaming:**

```
Client subscribes to SSE stream
        ↓
Server processes segments sequentially
        ↓
Each segment result streams back immediately:
  → { segment_id: 1, status: "auto-passed", score: 98 }
  → { segment_id: 2, status: "fix_generated", fix: "...", confidence: 0.92 }
  → { segment_id: 3, status: "flagged", issues: [...] }
        ↓
UI updates progressively (React state updates per event)
```

_Confidence: 🟢 High — SSE is mature, Vercel AI SDK supports natively_
_Sources: [Real-time AI in Next.js](https://blog.logrocket.com/nextjs-vercel-ai-sdk-streaming/), [SSE Streaming LLM](https://upstash.com/blog/sse-streaming-llm-responses), [AI SDK Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol), [Streaming Guide](https://pockit.tools/blog/streaming-llm-responses-web-guide/)_

### Data Formats and Standards

#### 4. XLIFF Integration & Preservation

**XLIFF Parsing Libraries (Node.js):**

| Library | XLIFF 1.2 | XLIFF 2.0 | Roundtrip | Status |
|---------|-----------|-----------|-----------|--------|
| **xliff (locize)** | ✅ | ✅ | ✅ | 🟢 Active |
| **ilib-xliff** | ✅ | ✅ | ✅ | 🟢 Active (updated 2025) |

**Critical Integration for Self-healing:**
- `xliff2js()` → parse XLIFF to JS objects for AI processing
- AI generates fix on plain text → must re-insert into XLIFF structure
- `js2xliff()` → reconstruct valid XLIFF with fix applied
- **Roundtrip support is essential** — ensures tags, metadata, notes are preserved

**Self-healing XLIFF Workflow:**

```
Original XLIFF segment:
  <source>Click <g id="1">here</g> to {0}</source>
  <target>คลิก <g id="1">ที่นี่</g> เพื่อ {0}</target>
        ↓
Parse → extract plain text + preserve tag map
  source_text: "Click here to {0}"
  target_text: "คลิกที่นี่เพื่อ {0}"
  tag_map: { g_1: "here"/"ที่นี่" }
        ↓
AI Fix Agent → generates corrected target (plain text)
  fixed_text: "คลิกที่นี่เพื่อ {0}"  (with correction)
        ↓
Re-insert tags using tag_map → reconstruct XLIFF
  <target>คลิก <g id="1">ที่นี่</g> เพื่อ {0}</target>
```

**XLIFF 3.0 Evolution:**
- Better interoperability standards coming
- Multi-platform workflow support
- But adoption is still early — stick with 1.2/2.0 for MVP

_Confidence: 🟢 High — XLIFF libraries are stable, roundtrip support confirmed_
_Sources: [xliff npm](https://www.npmjs.com/package/xliff), [iLib-js/xliff](https://github.com/iLib-js/xliff), [locize/xliff](https://github.com/locize/xliff)_

### System Interoperability

#### 5. Supabase Realtime + Edge Functions Integration

**Supabase ในบริบท Self-healing:**

Supabase เป็น backend ของเราอยู่แล้ว — สามารถ leverage features เพิ่มเติมได้:

**Database Webhooks → Trigger Pipeline:**
```
issues table INSERT → webhook → notify user
qa_runs table UPDATE (status=completed) → webhook → send summary
fix_applied table INSERT → webhook → log audit trail
```

**Edge Functions for Lightweight AI Tasks:**
- Small AI inference tasks (confidence scoring, quick classification)
- Webhook receivers (TMS callbacks, external integrations)
- Low-latency pre-processing close to user

**pgvector for RAG Integration:**
- Store glossary/TM embeddings ใน PostgreSQL โดยตรง
- Hybrid search (BM25 keyword + vector similarity) = best practice 2026
- ไม่ต้องใช้ external vector database (Pinecone, Weaviate)
- **Use case:** ค้นหา glossary terms ที่เกี่ยวข้องกับ segment แล้วส่งให้ AI Fix Agent เป็น context

**RAG Pipeline for Fix Quality:**
```
Segment with issue detected
        ↓
Query pgvector: find similar past corrections (embedding search)
        ↓
Query glossary: find relevant terms (keyword + vector hybrid)
        ↓
Combine context → send to Fix Agent as few-shot examples
        ↓
Fix Agent generates correction with domain-specific accuracy
```

_Confidence: 🟢 High — Supabase is our stack, pgvector is production-ready_
_Sources: [Supabase Relational AI 2026](https://textify.ai/supabase-relational-ai-2026-guide/), [Supabase Edge Functions](https://supabase.com/docs/guides/functions), [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks)_

#### 6. TMS Integration Possibilities (Future Phase)

**การเชื่อมต่อกับ TMS ที่มีอยู่ในตลาด:**

| TMS | API Type | QA Integration Potential |
|-----|----------|------------------------|
| **memoQ** | REST API + Web Service API | ✅ Query TM/TB, import projects, return QA results |
| **Trados** | Plugin architecture + file-based | 🟡 Import packages (*.sdlppx), limited API |
| **Phrase** | REST API (comprehensive) | ✅ Full project lifecycle, MXLIFF support |
| **Crowdin** | REST API + webhooks | ✅ File-based integration, real-time hooks |
| **Smartcat** | REST API | ✅ Project management, TM access |

**Integration Strategy (Phase 2-3):**

```
Phase 2: File-based Integration (MVP+)
  → Import XLIFF/MXLIFF from any TMS
  → Export QA report back
  → Manual upload/download workflow

Phase 3: API Integration
  → Direct TMS API connection
  → Auto-fetch new files for QA
  → Push fixes back to TMS
  → Webhook-triggered QA runs

Phase 4: Plugin Ecosystem (Long-term)
  → memoQ plugin (QA in-editor)
  → Trados plugin
  → Browser extension for web-based TMS
```

_Confidence: 🟡 Medium — API capabilities confirmed but integration complexity varies_
_Sources: [memoQ API](https://www.memoq.com/integrations/apis/), [memoQ Ecosystem](https://www.memoq.com/ecosystem/), [Phrase MXLIFF](https://support.phrase.com/hc/en-us/articles/5709739992860--MXLIFF-Files-TMS)_

### Integration Security Patterns

#### 7. API Security for AI Pipeline

**Authentication & Authorization:**
- **Supabase Auth (Google OAuth)** — Already in our stack for user auth
- **Row Level Security (RLS)** — Per-team data isolation at database level
- **API Key Management** — For LLM provider keys (Claude, GPT-4o-mini)
  - Store in Supabase Vault / environment variables
  - Rotate per project if needed
  - Rate limit per team to control costs

**AI-Specific Security:**
- **Prompt injection protection** — Sanitize XLIFF content before sending to LLM
- **PII handling** — Translation content may contain sensitive data
  - Process in-memory, don't log full segments to third parties
  - Supabase keeps data in controlled region
- **Cost guardrails** — Per-run spending limits, circuit breaker on runaway AI calls

_Confidence: 🟢 High — Standard security patterns, Supabase provides most infrastructure_

---

## Architectural Patterns and Design

### 1. Self-Correcting Agent Architecture

สถาปัตยกรรมที่สำคัญที่สุดสำหรับ Self-healing Translation คือ **Self-Correcting AI Pattern** — ระบบที่ตรวจสอบผลลัพธ์ของตัวเองแล้วแก้ไขได้

**Core Pattern — Iterative Refinement Loop:**

```
┌──────────────────────────────────────────────────┐
│                SELF-CORRECTING LOOP               │
│                                                   │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │  Attempt  │───▶│ Critique  │───▶│  Retry   │   │
│  │  (Fix)    │    │ (Judge)   │    │ (Re-fix) │   │
│  └──────────┘    └──────────┘    └──────────┘   │
│       ▲                                │          │
│       └────────────────────────────────┘          │
│              (if fix quality < threshold)         │
└──────────────────────────────────────────────────┘
```

**Key Design Decisions:**

| Decision | เลือก | เหตุผล |
|----------|------|--------|
| **Supervision Model** | Decoupled (External Judge) | แยก Fix Agent กับ Judge Agent เพื่อหลีกเลี่ยง self-evaluation bias |
| **Retry Strategy** | Max 2 retries | มากกว่านี้ = diminishing returns + cost เพิ่ม |
| **Failure Handling** | Graceful degradation | ถ้า fix ไม่ผ่าน Judge → fallback เป็น "flag for human" แทน |
| **State Management** | Stateful per-segment | track fix attempts, judge scores, final decision |

**VIGIL Pattern (Reflective Supervision):**
- Supervisor agent ทำหน้าที่ **maintenance** ไม่ใช่ task execution
- ตรวจสอบ output ของ Fix Agent อย่าง independent
- จับ hallucinations และ over-corrections ก่อน user เห็น
- Separation of concerns ชัดเจน

**Best Practice 2026:** *"Pick the simplest workflow shape that can achieve outcomes safely, then put effort into tool design, grounding, explicit state, and observability"*

_Confidence: 🟢 High — Self-correcting pattern is well-documented and production-proven_
_Sources: [AI That Fixes Itself](https://medium.com/@muhammad.awais.professional/ai-that-fixes-itself-inside-the-new-architectures-for-resilient-agents-9d12449da7a8), [Agentic Workflow 2026](https://www.stack-ai.com/blog/the-2026-guide-to-agentic-workflow-architectures/), [Google Cloud Agentic AI Patterns](https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system)_

### 2. Human-in-the-Loop (HITL) Trust Architecture

Self-healing Translation ต้อง balance ระหว่าง **automation** กับ **human trust** — ถ้า auto-fix ผิดแค่ครั้งเดียว user จะเลิกใช้ทันที

**Trust Calibration Framework:**

```
┌─────────────────────────────────────────────────────────┐
│              PROGRESSIVE TRUST MODEL                     │
│                                                          │
│  Phase 1: SHADOW MODE (สัปดาห์แรก)                       │
│  ├── AI generate fix ทุก segment                         │
│  ├── แต่ไม่แสดง auto-apply — แสดงเป็น "suggestion" เท่านั้น │
│  ├── เก็บ data: user accept/reject/modify ทุก fix        │
│  └── Calibrate confidence threshold ต่อ language pair    │
│                                                          │
│  Phase 2: ASSISTED MODE (หลัง calibration)               │
│  ├── 🟢 High confidence (>95%) → แสดง fix พร้อม 1-click  │
│  ├── 🟡 Medium (70-95%) → แสดง suggestion                │
│  ├── 🔴 Low (<70%) → flag only, ไม่ suggest fix          │
│  └── User builds trust ผ่าน consistent good suggestions  │
│                                                          │
│  Phase 3: AUTONOMOUS MODE (หลัง trust สูง)               │
│  ├── 🟢 High confidence → Auto-apply + audit log         │
│  ├── 🟡 Medium → 1-click apply                           │
│  ├── 🔴 Low → flag for review                            │
│  └── User can toggle back to Assisted anytime            │
└─────────────────────────────────────────────────────────┘
```

**HITL Design Principles:**

1. **Risk-based oversight** — ยิ่ง impact สูง (critical error, legal content) ยิ่งต้อง human review
2. **Batched review** — Group similar fixes ให้ review พร้อมกัน = เร็วขึ้น
3. **Statistical sampling** — ตรวจ sample ของ auto-applied fixes เป็น audit
4. **Escalation layers** — Simple fixes = auto, complex = expert review

**Control Authority Levels (ปรับได้ต่อ project):**

| Level | คำอธิบาย | ใช้เมื่อ |
|-------|---------|---------|
| **Advisory** | AI suggest, human decide ทุก fix | Legal/medical content |
| **Approval-gated** | AI apply เฉพาะ high-confidence, human approve ที่เหลือ | Standard QA |
| **Override-capable** | AI apply ทั้งหมด, human can override | High-volume, trusted AI |
| **Human-final** | AI apply + human spot-check sample | Mature deployment |

_Confidence: 🟢 High — HITL is industry best practice, well-documented patterns_
_Sources: [Operationalizing Trust HITL](https://medium.com/@adnanmasood/operationalizing-trust-human-in-the-loop-ai-at-enterprise-scale-a0f2f9e0b26e), [HITL Agentic AI](https://beetroot.co/ai-ml/human-in-the-loop-meets-agentic-ai-building-trust-and-control-in-automated-workflows/), [HITL Guide 2025](https://fast.io/resources/ai-agent-human-in-the-loop/), [Why 2025 is Year of HITL](https://zarego.com/blog/why-2025-is-the-year-of-human-in-the-loop-ai)_

### 3. Feedback Loop Learning Architecture

**Data Moat Architecture — ทุก user interaction ปรับปรุง AI:**

```
┌─────────────────────────────────────────────────────────┐
│              FEEDBACK LOOP ARCHITECTURE                  │
│                                                          │
│  User Action on AI Fix                                   │
│  ├── ✅ Accept fix → positive signal                     │
│  ├── ❌ Reject fix → negative signal                     │
│  ├── ✏️ Modify fix → correction signal (strongest)       │
│  └── 🚩 Flag for native → uncertainty signal             │
│                                                          │
│           ↓ (all signals logged)                         │
│                                                          │
│  Feedback Processing Pipeline                            │
│  ├── Aggregate by: language pair × domain × error type   │
│  ├── Calculate: acceptance rate, modification patterns    │
│  ├── Identify: systematic AI weaknesses                  │
│  └── Generate: improved few-shot examples                │
│                                                          │
│           ↓ (weekly/monthly cycle)                       │
│                                                          │
│  Model Improvement                                       │
│  ├── Update RAG examples (accepted fixes as new context) │
│  ├── Adjust confidence thresholds per language pair      │
│  ├── Fine-tune prompts based on rejection patterns       │
│  └── Retrain adapter models (if using fine-tuning)       │
│                                                          │
│           ↓                                              │
│                                                          │
│  Better Fixes → Higher Acceptance → More Data → Loop ♻️  │
└─────────────────────────────────────────────────────────┘
```

**Coactive Learning Pattern:**
- User edits to AI fix = implicit labeled training data
- ไม่ต้องขอ explicit feedback — แค่ track ว่า user แก้อะไร
- Personalize ต่อ team/project/translator ได้ในอนาคต

**Implementation Approach:**

| Phase | วิธี | ข้อดี | ข้อเสีย |
|-------|-----|------|--------|
| **MVP** | Log accept/reject → update RAG examples | ง่าย, ไม่ต้อง retrain | Improvement ช้า |
| **Phase 2** | Prompt optimization จาก rejection patterns | ดีขึ้นเร็ว | ต้อง analysis pipeline |
| **Phase 3** | LoRA adapter fine-tuning ต่อ language pair | แม่นที่สุด | ต้อง compute + data |

**Key Metric:** *"Every file processed improves prompt accuracy per language pair × domain"* — นี่คือ data moat ที่จะทำให้เราแข่งขันได้

_Confidence: 🟢 High — Feedback loops are fundamental to AI improvement_
_Sources: [HITL Feedback Loops](https://www.nextwealth.com/blog/how-feedback-loops-in-human-in-the-loop-ai-improve-model-accuracy-over-time/), [AI Feedback Loop Playbook](https://www.ywian.com/blog/the-ai-feedback-loop-playbook), [Active Learning HITL LLMs](https://intuitionlabs.ai/articles/active-learning-hitl-llms), [User Feedback Training 2026](https://www.technology.org/2026/02/09/better-ai-models-by-incorporating-user-feedback-into-training/)_

### 4. Scalability Architecture — Serverless AI Pipeline

**Vercel + Inngest Serverless Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│              SCALABILITY ARCHITECTURE                    │
│                                                          │
│  Tier 1: Edge (Vercel Edge Functions)                    │
│  ├── Auth validation, request routing                    │
│  ├── Rule-based checks (instant, zero cost)              │
│  └── Boot in ms, no cold start penalty                   │
│                                                          │
│  Tier 2: Serverless (Vercel Functions + Inngest)         │
│  ├── AI Screening (Layer 2) — batched segments           │
│  ├── Deep Analysis + Fix Generation (Layer 3)            │
│  ├── Fix Verification (Judge Agent)                      │
│  └── Each Inngest step = separate invocation             │
│                                                          │
│  Tier 3: Database (Supabase PostgreSQL)                  │
│  ├── pgvector for RAG embeddings                         │
│  ├── Results storage + audit trail                       │
│  └── Realtime subscriptions for UI updates               │
│                                                          │
│  Tier 4: External AI APIs                                │
│  ├── Claude Sonnet (deep analysis + fix generation)      │
│  ├── GPT-4o-mini (screening + quick classification)      │
│  └── Rate limited + cost controlled per team             │
└─────────────────────────────────────────────────────────┘
```

**Scalability Constraints & Mitigations:**

| Constraint | Limit | Mitigation |
|-----------|-------|-----------|
| **Vercel Function timeout** | Pro: 300s max | Inngest step.run() แบ่ง work เป็น steps ย่อย |
| **AI API rate limits** | Varies per provider | Inngest concurrency control + throttling |
| **Cost at scale** | ~$2.40/100K words (Thorough) | Layer 2 screening filters 80% → only 20% hits Layer 3 |
| **Large file processing** | 10K+ segments | Batch processing with Inngest fan-out pattern |

**AI SDK 6 + Human-in-the-Loop:**
- Tool execution approval ใน AI SDK 6 beta integrates **human-in-the-loop** directly
- User approve/reject AI actions before they proceed
- Perfect fit for our "approve fix before apply" workflow

_Confidence: 🟢 High — Architecture aligns with our existing stack_
_Sources: [Vercel AI Review 2026](https://www.truefoundry.com/blog/vercel-ai-review-2026-we-tested-it-so-you-dont-have-to), [Future of Serverless 2026](https://americanchase.com/future-of-serverless-computing/), [Vercel Ship AI 2025](https://www.infoq.com/news/2025/10/vercel-ship-ai/)_

### 5. Complete Self-healing Translation Architecture (Proposed)

**End-to-End Architecture Diagram:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SELF-HEALING TRANSLATION ARCHITECTURE             │
│                                                                      │
│  ┌──────────┐     ┌──────────────────────────────────────────────┐  │
│  │  Upload   │────▶│  PARSER (XLIFF/Excel)                        │  │
│  │  XLIFF    │     │  Extract segments + preserve tag map         │  │
│  └──────────┘     └──────────────┬───────────────────────────────┘  │
│                                   │                                  │
│  ┌────────────────────────────────▼──────────────────────────────┐  │
│  │  LAYER 1: RULE-BASED ENGINE (Edge, instant)                   │  │
│  │  ├── Tag integrity → AUTO-FIX (restore missing tags)          │  │
│  │  ├── Placeholder match → AUTO-FIX (restore {0}, %s)           │  │
│  │  ├── Number consistency → AUTO-FIX (correct numbers)          │  │
│  │  ├── Glossary check → FLAG or SUGGEST                         │  │
│  │  └── Results: stream to UI immediately                        │  │
│  └────────────────────────────────┬──────────────────────────────┘  │
│                                   │                                  │
│  ┌────────────────────────────────▼──────────────────────────────┐  │
│  │  LAYER 2: AI SCREENING AGENT (Serverless, batched)            │  │
│  │  ├── Quick classification: pass / needs-deep-analysis         │  │
│  │  ├── Simple fixes: terminology swap → SUGGEST FIX             │  │
│  │  ├── ~80% segments auto-pass here                             │  │
│  │  └── ~20% flagged → Layer 3                                   │  │
│  └────────────────────────────────┬──────────────────────────────┘  │
│                                   │ (flagged only)                   │
│  ┌────────────────────────────────▼──────────────────────────────┐  │
│  │  LAYER 3: DEEP ANALYSIS + FIX GENERATION (Serverless)         │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │  │
│  │  │  RAG Context    │  │  Fix Agent     │  │  Judge Agent   │  │  │
│  │  │  ├── Glossary   │─▶│  ├── Generate  │─▶│  ├── Verify    │  │  │
│  │  │  ├── TM matches │  │  │   correction │  │  │   fix qual. │  │  │
│  │  │  └── Past fixes │  │  ├── Explain   │  │  ├── Confidence│  │  │
│  │  │                 │  │  │   reasoning  │  │  │   score     │  │  │
│  │  │                 │  │  └── Structured │  │  └── Pass/Fail │  │  │
│  │  │                 │  │     output      │  │                │  │  │
│  │  └────────────────┘  └────────────────┘  └───────┬────────┘  │  │
│  └──────────────────────────────────────────────────┤────────────┘  │
│                                                      │               │
│  ┌──────────────────────────────────────────────────▼────────────┐  │
│  │  LAYER 4: AUTO-APPLY & REVIEW GATEWAY                         │  │
│  │  ├── 🟢 Confidence >95% + Judge pass → Auto-apply             │  │
│  │  ├── 🟡 70-95% + Judge pass → Suggest + 1-click apply         │  │
│  │  ├── 🔴 <70% OR Judge fail → Flag for human review            │  │
│  │  └── All decisions logged → Feedback Loop                     │  │
│  └────────────────────────────────┬──────────────────────────────┘  │
│                                   │                                  │
│  ┌────────────────────────────────▼──────────────────────────────┐  │
│  │  FEEDBACK LOOP (Background)                                    │  │
│  │  ├── User accept/reject/modify → logged                       │  │
│  │  ├── Update RAG examples with accepted fixes                  │  │
│  │  ├── Adjust confidence thresholds per language pair            │  │
│  │  └── Periodic prompt optimization from rejection patterns     │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**Architecture Decision Records (ADR):**

| ADR | Decision | Rationale |
|-----|---------|-----------|
| ADR-001 | Decoupled Fix + Judge agents | Avoid self-evaluation bias |
| ADR-002 | Progressive trust model | Build user confidence gradually |
| ADR-003 | RAG before fine-tuning | Faster iteration, lower cost for MVP |
| ADR-004 | Inngest for pipeline orchestration | Durable execution, built-in retry |
| ADR-005 | Structured output via Zod schemas | Guarantee XLIFF tag preservation |
| ADR-006 | SSE streaming for UX | Real-time progress, perceived speed |
| ADR-007 | pgvector for RAG storage | No additional infrastructure needed |
| ADR-008 | Feedback loop from day 1 | Build data moat early |

_Confidence: 🟢 High — Architecture synthesized from all research findings, aligned with existing stack_

---

## Implementation Approaches and Technology Adoption

### 1. Phased Implementation Roadmap

**Self-healing Translation ต้องใช้ phased rollout — ไม่ใช่ big bang:**

```
┌─────────────────────────────────────────────────────────────────────┐
│              SELF-HEALING IMPLEMENTATION ROADMAP                     │
│                                                                      │
│  PHASE 0: Foundation (Sprint 10-12, หลัง MVP core เสร็จ)            │
│  ├── ✅ Rule-based auto-fix (tags, placeholders, numbers)            │
│  ├── ✅ Fix suggestion UI component (accept/reject/modify)           │
│  ├── ✅ Feedback logging infrastructure                              │
│  └── 📊 Metric: Rule-based fix accuracy >99%                        │
│                                                                      │
│  PHASE 1: Shadow Mode (Sprint 13-15, ~6 สัปดาห์)                    │
│  ├── 🧪 AI Fix Agent generates corrections (not shown to user)      │
│  ├── 🧪 Judge Agent verifies fixes (internal scoring)                │
│  ├── 📊 Collect baseline: would-be acceptance rate                   │
│  ├── 🎯 Calibrate confidence thresholds per language pair            │
│  └── 📊 Metric: Simulated acceptance rate >80%                       │
│                                                                      │
│  PHASE 2: Assisted Mode (Sprint 16-18, ~6 สัปดาห์)                  │
│  ├── 🚀 Show AI fix suggestions to users (opt-in per project)       │
│  ├── 📊 Track real acceptance rates                                  │
│  ├── 🔄 Update RAG examples from accepted fixes                     │
│  ├── 🎯 Fine-tune confidence thresholds from real data               │
│  └── 📊 Metric: Real acceptance rate >75%, false positive <5%        │
│                                                                      │
│  PHASE 3: Auto-apply Mode (Sprint 19-21, ~6 สัปดาห์)                │
│  ├── 🟢 High-confidence fixes auto-applied (with undo)               │
│  ├── 📊 Audit: weekly spot-check of auto-applied fixes               │
│  ├── 🔄 Prompt optimization from rejection patterns                  │
│  └── 📊 Metric: Auto-apply accuracy >99%, review time -50%           │
│                                                                      │
│  PHASE 4: Learning Mode (Sprint 22+, ongoing)                       │
│  ├── 🧠 LoRA adapter fine-tuning per language pair (optional)        │
│  ├── 📊 Translator quality profiles (personalized QA)                │
│  ├── 🔮 Predictive quality scoring                                   │
│  └── 📊 Metric: Continuous improvement measurable quarter-over-quarter│
└─────────────────────────────────────────────────────────────────────┘
```

**Timeline:** ~18-24 สัปดาห์ (4.5-6 เดือน) จาก Phase 0 ถึง Phase 3

_Confidence: 🟢 High — Phased approach is industry best practice_
_Sources: [AI Implementation Roadmap 2026](https://www.spaceo.ai/blog/ai-implementation-roadmap/), [MVP Roadmap Guide 2026](https://wearepresta.com/the-complete-mvp-roadmap-guide-for-2026/), [From MVP to Full-Scale AI](https://8allocate.com/blog/from-mvp-to-full-scale-ai-solution/)_

### 2. Testing & Quality Assurance for AI Fixes

**LLM Testing ≠ Traditional Testing — ต้องใช้ approach ใหม่:**

**Testing Pyramid for Self-healing Translation:**

```
          ╱╲
         ╱  ╲  Human Evaluation
        ╱ 5% ╲ (monthly blind audit of auto-fixes)
       ╱──────╲
      ╱        ╲  LLM-as-Judge Tests
     ╱   15%    ╲ (GEMBA scoring on fix quality)
    ╱────────────╲
   ╱              ╲  Integration Tests
  ╱     30%        ╲ (pipeline e2e: upload → fix → verify)
 ╱──────────────────╲
╱                    ╲  Unit Tests + Eval Tests
╱        50%          ╲ (fix format, tag preservation, confidence)
╱────────────────────────╲
```

**Evaluation Framework:**

| Test Type | เครื่องมือ | ทดสอบอะไร | ความถี่ |
|-----------|----------|----------|--------|
| **Unit Tests** | Vitest | Tag preservation, XLIFF roundtrip, Zod schema | Every commit |
| **Eval Tests** | DeepEval / Custom | Fix quality scoring on golden dataset | Every PR |
| **LLM-as-Judge** | GEMBA-MQM scoring | Translation quality before/after fix | Nightly |
| **Integration** | Playwright + API | Full pipeline from upload to fix | Daily |
| **Human Audit** | Blind review panel | Sample of auto-applied fixes | Weekly/Monthly |

**Golden Dataset Strategy:**
- สร้าง dataset จาก **real QA corrections** ที่ทีมทำอยู่แล้ว
- ต่อ language pair: 100-200 segments ที่มีปัญหา + human-corrected version
- ใช้เป็น benchmark สำหรับวัด fix quality ทุก model change
- Update ต่อเนื่องจาก user feedback

**Key Metrics:**

| Metric | Target | วัดอย่างไร |
|--------|--------|----------|
| **Fix Accuracy** | >85% (Phase 2), >92% (Phase 3) | % fixes accepted without modification |
| **False Positive Rate** | <5% | % fixes that made translation worse |
| **Tag Preservation** | 100% | Zero broken tags after fix |
| **Confidence Calibration** | Correlation >0.8 | Confidence score vs actual acceptance |
| **Latency** | <3s per segment | Time from issue detection to fix ready |

_Confidence: 🟢 High — LLM testing frameworks are mature_
_Sources: [LLM Testing 2026](https://www.confident-ai.com/blog/llm-testing-in-2024-top-methods-and-strategies), [LLM Testing Guide Langfuse](https://langfuse.com/blog/2025-10-21-testing-llm-applications), [DeepEval](https://github.com/confident-ai/deepeval), [LLM Evaluation Methods](https://research.aimultiple.com/large-language-model-evaluation/)_

### 3. Cost Optimization Strategy

**AI Fix generation ต้อง cost-effective — ไม่งั้นจะแพงกว่าให้คนแก้เอง:**

**Cost Architecture:**

```
┌──────────────────────────────────────────────────────────────┐
│              COST OPTIMIZATION LAYERS                         │
│                                                               │
│  Layer 1: FREE — Rule-based fixes                            │
│  ├── Tag repair, placeholder restore, number fix              │
│  ├── No AI cost, instant                                      │
│  └── Expected: fixes ~30% of all issues                       │
│                                                               │
│  Layer 2: CHEAP — AI Screening + Simple Fix                  │
│  ├── GPT-4o-mini (~$0.15/1M input tokens)                    │
│  ├── Quick classification + terminology fixes                 │
│  ├── 🔑 PROMPT CACHING: 90% discount on cached tokens        │
│  └── Expected: fixes ~40% of remaining issues                 │
│                                                               │
│  Layer 3: PREMIUM — Deep Analysis + Complex Fix              │
│  ├── Claude Sonnet (~$3/1M input tokens)                     │
│  ├── Semantic fixes, tone corrections, cultural adjustments   │
│  ├── 🔑 RAG reduces context: -70% token usage                │
│  └── Expected: handles remaining ~30% of issues               │
│                                                               │
│  NET RESULT:                                                  │
│  ├── Only ~6% of total segments reach Layer 3                 │
│  │   (20% flagged by L2 × 30% need complex fix)              │
│  ├── Prompt caching saves 90% on repeated system prompts      │
│  └── Estimated cost: ~$3-5/100K words (with fixes)            │
└──────────────────────────────────────────────────────────────┘
```

**Cost Optimization Techniques:**

| Technique | Cost Reduction | Implementation Effort |
|-----------|---------------|---------------------|
| **Prompt Caching** | 90% on cached tokens | 🟢 Easy — API-native (Claude, GPT) |
| **Model Routing** | 40-60% overall | 🟡 Medium — route simple→cheap, complex→premium |
| **RAG Context Reduction** | 70% on context tokens | 🟡 Medium — pgvector retrieval |
| **Batch Processing** | 20-30% (bulk discounts) | 🟢 Easy — Inngest batching |
| **Response Caching** | Variable (reuse past fixes) | 🟢 Easy — cache identical segments |

**Cost Comparison: Human QA vs Self-healing:**

| | Human QA (ปัจจุบัน) | Self-healing (เป้าหมาย) |
|---|---|---|
| **Cost per 100K words** | $150-300 (QA reviewer time) | ~$3-5 (AI) + $30-50 (review time) |
| **Time** | 8-16 hours | 1-3 hours (review only) |
| **Consistency** | Variable (depends on reviewer) | Consistent (AI + calibrated thresholds) |

**ROI Estimate:** ลด QA cost **70-85%** per file, ลดเวลา **60-80%**

_Confidence: 🟡 Medium-High — Cost estimates based on current API pricing, subject to change_
_Sources: [LLM Cost Optimization 80%](https://ai.koombea.com/blog/llm-cost-optimization), [Prompt Caching 90% Reduction](https://pub.towardsai.net/llm-api-token-caching-the-90-cost-reduction-feature-when-building-ai-applications-06c4e58b01b3), [Token Optimization](https://www.glukhov.org/post/2025/11/cost-effective-llm-applications/), [Reduce LLM Costs 40%](https://scalemind.ai/blog/reduce-llm-costs)_

### 4. Deployment & Observability

**Production Deployment Stack:**

| Component | Tool | ทำอะไร |
|-----------|------|-------|
| **Hosting** | Vercel | Next.js frontend + serverless AI functions |
| **Queue** | Inngest | Durable AI pipeline orchestration |
| **Database** | Supabase | Data + pgvector + realtime |
| **AI Gateway** | Vercel AI Gateway | Model routing, retry, failover |
| **Observability** | Langfuse + Vercel DevTools | LLM tracing, token usage, latency |
| **Monitoring** | Vercel Analytics + Inngest dashboard | Pipeline health, error rates |

**LLM Observability (Critical for Self-healing):**

```
Every AI Fix Call is traced:
├── Input: segment source + target + context
├── Model: which model was used
├── Output: generated fix + confidence score
├── Tokens: input/output token count + cost
├── Latency: time to generate fix
├── Judge Result: pass/fail + quality score
└── User Action: accept/reject/modify (feedback loop)
```

**Langfuse Integration:**
- Vercel AI SDK has built-in OpenTelemetry → Langfuse uses OpenTelemetry → seamless integration
- Track: cost per run, cost per language pair, fix quality trends
- Debug: why did AI suggest a bad fix? trace the full input/context/output

**DurableAgent Pattern (Vercel):**
- Turns agents into **durable, resumable workflows**
- Each tool execution = retryable, observable step
- If serverless function times out → resume from last checkpoint
- Perfect for long-running QA runs with 1000+ segments

_Confidence: 🟢 High — All tools integrate with our stack_
_Sources: [AI SDK 6](https://vercel.com/blog/ai-sdk-6), [LLM Observability Vercel](https://voltagent.dev/blog/vercel-ai-llm-observability/), [Langfuse Vercel Integration](https://langfuse.com/integrations/frameworks/vercel-ai-sdk), [Vercel Production AI](https://www.zenml.io/llmops-database/building-production-ai-agents-and-agentic-platforms-at-scale)_

### 5. Risk Assessment & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|-----------|
| **AI fix makes translation worse** | 🔴 Critical | 🟡 Medium | Judge Agent + Shadow Mode before auto-apply |
| **High false positive rate** | 🟡 Major | 🟡 Medium | Confidence calibration per language pair |
| **Cost overrun from AI calls** | 🟡 Major | 🟡 Medium | Per-run spending limits + model routing |
| **User distrust after bad fix** | 🔴 Critical | 🟢 Low (with phases) | Progressive trust model + easy undo |
| **LLM API outage** | 🟡 Major | 🟢 Low | Graceful degradation → rule-based only |
| **Prompt injection via XLIFF content** | 🔴 Critical | 🟢 Low | Input sanitization + structured output |
| **CJK/Thai language quality lower** | 🟡 Major | 🟡 Medium | Language-specific eval datasets + LoRA adapters |
| **Over-editing (changing correct text)** | 🟡 Major | 🟡 Medium | Conservative fix strategy + Judge verification |

**Critical Risk Mitigation: "First, Do No Harm"**
- **Rule #1:** Auto-fix must NEVER make a translation worse than the original
- **Rule #2:** When in doubt, flag for human rather than auto-fix
- **Rule #3:** Every auto-applied fix must be auditable and undoable
- **Rule #4:** Shadow mode before any production auto-apply

## Technical Research Recommendations

### Implementation Roadmap Summary

| Phase | Timeline | Focus | Exit Criteria |
|-------|----------|-------|--------------|
| **Phase 0** | Sprint 10-12 | Rule-based auto-fix + UI | Fix accuracy >99% |
| **Phase 1** | Sprint 13-15 | Shadow mode + calibration | Simulated acceptance >80% |
| **Phase 2** | Sprint 16-18 | Assisted mode (suggestions) | Real acceptance >75% |
| **Phase 3** | Sprint 19-21 | Auto-apply mode | Auto-apply accuracy >99% |
| **Phase 4** | Sprint 22+ | Learning mode + optimization | Continuous improvement |

### Technology Stack Recommendations

| Need | Recommended | Why |
|------|-----------|-----|
| **Fix Generation** | Claude Sonnet via Vercel AI SDK | Best quality for translation, structured output |
| **Quick Screening** | GPT-4o-mini | Cost-effective, fast |
| **Fix Verification** | LLM-as-Judge (GEMBA-MQM style) | Independent quality check |
| **Pipeline Orchestration** | Inngest | Durable execution, built-in retry |
| **RAG Storage** | Supabase pgvector | No new infrastructure |
| **Observability** | Langfuse | OpenTelemetry integration with AI SDK |
| **Testing** | DeepEval + Vitest | LLM eval + unit tests |
| **Format Preservation** | Zod schemas + structured output | Guarantee tag integrity |

### Success Metrics & KPIs

| KPI | Baseline (No self-heal) | Target (With self-heal) |
|-----|------------------------|------------------------|
| **QA review time per file** | 45-90 min | 10-20 min (-75%) |
| **Review rounds per file** | 2-3 rounds | 1-1.2 rounds (-60%) |
| **Cost per 100K words** | $150-300 | $35-55 (-80%) |
| **Fix acceptance rate** | N/A | >85% |
| **False positive rate** | N/A | <5% |
| **Auto-pass rate** | 30-40% | 60-70% |
| **Time to first result** | 5-15 min (rule-based) | <30s (rule-based + auto-fix) |

---

## 7. Future Outlook & Innovation Opportunities

### Near-term (2026-2027): Self-healing MVP → Production

- **LLM costs will drop further** — making per-segment AI processing even more economical
- **Adaptive MT** will learn from linguist corrections in real-time, complementing our feedback loop
- **AI SDK ecosystem maturity** — better agent abstractions, durable workflows, native observability
- **Expected milestone:** Our tool achieves Xbench parity + Self-healing in production

### Medium-term (2027-2028): Platform & Ecosystem

- **Visual/Multimodal QA** — AI analyzes screenshots to detect text overflow, truncation, layout issues
- **TMS Plugin Ecosystem** — direct integration into memoQ, Trados, Phrase for in-editor QA
- **Translator Quality Profiles** — personalized QA based on individual translator patterns
- **Fully automated translation** for low-stakes content (support tickets, internal docs) with minimal human spot-check
- **Expected milestone:** External customers, API platform, data-driven quality moat established

### Long-term (2028+): Industry Transformation

- **In-house fine-tuned LLMs** per language pair × domain — ultimate accuracy
- **Predictive Quality Intelligence** — predict which files will have issues before QA starts
- **Real-time collaborative QA** — AI and human reviewers working simultaneously
- **Industry standard replacement** for legacy QA tools
- **Expected milestone:** Market leader in AI-powered localization QA

**Market Context:**
- AI localization market: **$7.5B by 2028** (CAGR 18%)
- TMS market: **$5.47B by 2030** (CAGR 17.2%)
- LLM translation cost: **$10 → $2 per 1,000 words by 2028**
- By 2028: **50% of customer service** organizations will use AI agents (Gartner)

_Sources: [AI Localization Trends 2026](https://www.vistatec.com/ai-driven-localization-trends-to-watch-in-2026/), [AI Translation Trends 2026](https://poeditor.com/blog/ai-translation-trends-2026/), [AI in Localization Roadmap](https://medium.com/@hastur/embracing-ai-in-localization-a-2025-2028-roadmap-a5e9c4cd67b0), [Five Ways AI Reshaped Translation 2025](https://slator.com/five-ways-ai-reshaped-translation-industry-2025/), [AI Localization Think Tank 2026](https://www.ailocthinktank.com/post/ai-localization-think-tank-looking-forward-to-2026-part-1)_

---

## 8. Research Methodology & Source Documentation

### Web Search Queries Executed

1. "Automatic Post-Editing APE LLM translation quality 2025 2026 state of the art"
2. "LLM translation correction auto-fix techniques fine-tuning RAG 2025 2026"
3. "AI translation quality estimation confidence scoring MQM 2025 2026"
4. "multi-agent AI pipeline translation review verification architecture 2025 2026"
5. "LLM-as-judge translation evaluation GEMBA AutoMQM 2025 2026"
6. "constrained decoding guided generation preserve format tags translation LLM 2025"
7. "GitHub Copilot Grammarly AI suggestion UX pattern accept reject inline fix 2025"
8. "Vercel AI SDK streaming structured output tool calling agent 2025 2026"
9. "localization QA tool AI-powered translation review Xbench alternative 2025 2026"
10. "XLIFF translation memory integration AI auto-correction localization workflow 2025"
11. "AI translation pipeline API design LLM orchestration integration pattern 2025 2026"
12. "XLIFF 2.0 API integration parsing library JavaScript Node.js 2025"
13. "Inngest serverless queue AI pipeline orchestration event-driven workflow 2025 2026"
14. "TMS API integration memoQ Trados Phrase localization plugin webhook 2025"
15. "streaming AI response Next.js server-sent events real-time translation processing UX 2025"
16. "Supabase realtime database webhook edge functions AI integration 2025 2026"
17. "AI agent architecture pattern self-correcting system design 2025 2026"
18. "serverless AI pipeline scalability architecture Vercel Next.js edge computing 2025 2026"
19. "human-in-the-loop AI system architecture trust calibration approval workflow 2025"
20. "AI feedback loop learning system architecture user corrections improve model 2025 2026"
21. "AI feature implementation roadmap MVP phased rollout strategy localization 2025 2026"
22. "LLM AI application testing strategy evaluation benchmark translation quality 2025"
23. "AI LLM application cost optimization token usage reduction caching prompt 2025 2026"
24. "Vercel AI SDK agent implementation production deployment observability monitoring 2025 2026"
25. "AI localization industry future 2026 2027 2028 translation automation disruption"
26. "translation quality assurance automation market size growth 2025 2026"

### Primary Authoritative Sources

| Category | Sources |
|----------|---------|
| **Academic** | ACL Anthology, arXiv (MQM-APE, RUBRIC-MQM, APE papers) |
| **Industry** | Slator, Nimdzi, Vistatec, AI Localization Think Tank |
| **Technology** | Vercel Blog, Supabase Docs, Inngest Docs, Langfuse Docs |
| **Market** | Grand View Research, Market Research Analytics, Gartner |
| **Community** | Machine Translate (machinetranslate.org), EmergentMind |

### Confidence Level Framework

| Level | Meaning | Criteria |
|-------|---------|---------|
| 🟢 **High** | Multiple sources confirm, production-proven | 3+ independent sources agree |
| 🟡 **Medium-High** | Strong evidence with some uncertainty | 2+ sources, some aspects need validation |
| 🟡 **Medium** | Reasonable evidence, active research area | Limited sources, emerging technology |
| 🔴 **Low** | Speculative or single-source | Requires further investigation |

### Research Limitations

- Translation QA-specific AI auto-fix research is limited — most APE research focuses on MT post-editing, not QA correction
- CJK + Thai language-specific AI performance data is sparse — calibration will require empirical testing
- Cost estimates based on current API pricing (Feb 2026) — subject to rapid change
- Competitive landscape may shift quickly as TMS vendors add AI QA features

---

## Technical Research Conclusion

### Summary of Key Findings

Self-healing Translation represents a **genuine innovation opportunity** in the localization QA space. The technology foundation is mature (APE, multi-agent AI, structured output), the competitive gap is clear (no standalone tool offers this), and the economics are compelling (70-85% cost reduction). Our existing technology stack supports the full architecture without new infrastructure.

### Strategic Impact Assessment

This research confirms that Self-healing Translation would position our tool as the **first standalone AI-powered QA tool with autonomous correction capability** — a category-defining product in a $7.5B market. The progressive trust model (Shadow → Assisted → Autonomous) mitigates the primary risk of trust destruction, while the feedback loop architecture builds a data moat that becomes more defensible with every file processed.

### Next Steps

1. **Share this research** with the team for review and feedback
2. **Create technical spike stories** to prototype Fix Agent + Judge Agent pipeline
3. **Build golden dataset** from existing QA corrections for evaluation benchmarks
4. **Implement Phase 0** (rule-based auto-fix) as part of current MVP sprint plan
5. **Plan Shadow Mode infrastructure** for Phase 1 data collection

---

**Technical Research Completion Date:** 2026-02-14
**Research Period:** Comprehensive technical analysis with 26 verified web searches
**Document Length:** Comprehensive coverage across 8 major sections
**Source Verification:** All facts cited with current sources (2025-2026)
**Technical Confidence Level:** High — based on multiple authoritative sources across academic, industry, and technology domains

_This comprehensive technical research document serves as an authoritative reference on AI/LLM Innovation for Self-healing Translation and provides strategic insights for implementation planning and decision-making._
