---
workflowStatus: 'DRAFT'
createdAt: '2026-02-14'
classification:
  projectType: 'Feature Extension — Self-healing Translation'
  domain: 'Localization Technology / AI-powered Auto-correction'
  complexity: 'High'
  prerequisite: 'Core QA MVP operational (FR1-FR72) + Growth foundation (FR73-FR75 rule-based auto-fix)'
parentPRD: '_bmad-output/planning-artifacts/prd.md'
researchSource: '_bmad-output/planning-artifacts/research/technical-ai-llm-self-healing-translation-research-2026-02-14.md'
author: Mona
date: '2026-02-14'
lastEdited: '2026-02-14'
editHistory:
  - date: '2026-02-14'
    changes: 'BMAD Validation Round 1 fixes: Kill Criteria — added acceptance threshold gap 40-75% behavior, added 7-day rolling window to revert rate, clarified 2,000 aggregate vs 500 per-language-pair thresholds. FR-SH11 — added rolling 500-fix accuracy window. Density — "Requires minimum" → "Needs". Leakage — FR-SH1 "Zod schema" → "structured output validation"'
  - date: '2026-02-14'
    changes: 'Party Mode review fixes: reconciled kill criteria (< 60% deprioritize / 60-85% retune / > 85% gate), clarified FR-SH18 budget is separate from FR71, added data dependency + 500+ corrections requirement to Shadow Mode, added Shadow Mode adaptive sampling strategy, linked Journey 7 as evolution of Journey 2'
  - date: '2026-02-14'
    changes: 'Initial creation — derived from Self-healing Translation research + main PRD integration (Option B+)'
---

# Self-healing Translation PRD — AI-powered Auto-correction for QA Localization Tool

**Author:** Mona
**Date:** 2026-02-14
**Status:** DRAFT
**Prerequisite:** Core QA MVP operational (main PRD FR1-FR72) + Growth foundation (FR73-FR75 rule-based auto-fix)

---

## 1. Executive Summary

### Vision

Transform the QA localization tool from a **Detective** (detects errors, reports to humans) into a **Doctor** (detects errors, diagnoses root cause, prescribes verified corrections for human approval). This is the paradigm shift from "detect-report-fix" to "detect-autofix-approve."

### Core Innovation

**Self-healing Translation** — The system doesn't just find errors; it generates verified corrections using a multi-agent AI pipeline (Fix Agent + Judge Agent) with progressive trust (Shadow → Assisted → Autonomous), reducing reviewer effort by 60-80% while maintaining quality through human oversight.

### Why Now

- LLM-based Automatic Post-Editing (APE) achieves **near human-level quality** (closing quality gap by 43%)
- AI localization market projected to reach **$7.5 billion by 2028** (CAGR 18%)
- LLM translation costs dropping from $10 to **$2 per 1,000 words by 2028**
- **No competitor** offers standalone AI auto-fix in a QA tool — first-to-market opportunity
- Our tech stack (Vercel AI SDK 6, Supabase pgvector, Inngest) supports the full architecture **without new infrastructure**

### Relationship to Main PRD

This PRD extends the main PRD (`prd.md`) with Self-healing capabilities:

| Main PRD (Core QA) | This PRD (Self-healing) |
|-------|------|
| Detects issues (3-Layer Pipeline) | Generates fixes for detected issues |
| Suggests what's wrong | Suggests how to fix + provides correction |
| Human reviews findings | Human approves/modifies fixes |
| FR1-FR72 (MVP) + FR73-FR75 (Growth) | FR-SH1 through FR-SH18 |
| MVP → Growth → Vision | Growth → Vision (builds on MVP core) |

**Foundation already in main PRD:**
- FR73-FR75: Rule-based auto-fix (Growth) — deterministic fixes for tags, placeholders, numbers. Schema design included in MVP
- FR64-FR69: AI Learning & Trust — feedback loop infrastructure
- Pillar 5: Actionable Suggestions — confidence + accept/reject
- Innovation #6: Self-healing Translation reference

---

## 2. Success Criteria

### Self-healing Value Proposition

**The Aha! Moment:** The first time a reviewer sees an AI-generated fix that's *exactly right* — they click "Accept" and the segment is corrected without typing a single character. When this happens consistently, the tool transitions from "QA checker" to "QA + correction partner."

### Success Metrics

| Metric | Shadow Mode Target | Assisted Mode Target | Autonomous Mode Target |
|--------|-------------------|---------------------|----------------------|
| Fix accuracy (accepted without modification) | > 70% (internal tracking) | > 80% (user-visible) | > 95% (auto-apply threshold) |
| Fix acceptance rate | N/A (not shown) | > 60% Accept + < 10% Reject | > 90% auto-accepted |
| Time saved per file | Baseline measurement | 30-40% reduction | 60-80% reduction |
| Cost per fix | Baseline measurement | < $0.05 per fix | < $0.03 per fix |
| Judge Agent agreement with human | > 85% | > 90% | > 95% |
| User trust score (survey) | N/A | > 7/10 | > 8/10 |

### Kill Criteria

| Phase | Kill Trigger | Fallback | Decision Point |
|-------|-------------|---------|----------------|
| Shadow Mode | Fix accuracy < 60% after 2,000 fix attempts (aggregate across all language pairs) → deprioritize; 60-85% → stay in Shadow + retune prompts. Gate to Assisted requires > 85% for 500+ fixes per individual language pair | If < 60%: deprioritize feature. If 60-85%: retune prompts, adjust RAG context, re-evaluate at 5,000 attempts | Month 4 |
| Assisted Mode | Acceptance rate < 40% after 4 weeks → kill; 40-75% → continue Assisted Mode, monitor weekly, retune prompts; > 75% → gate to Autonomous | If < 40%: revert to suggestion-only (no fix proposals). If 40-75%: stay in Assisted, retune, re-evaluate monthly | Month 6 |
| Autonomous Mode | Auto-applied fix revert rate > 5% in any 7-day rolling window | Revert to Assisted Mode permanently | Month 9 |

---

## 3. Product Scope — Self-healing Phases

### Phase 0: Foundation (Growth — FR73-FR75 in main PRD)

> **Cross-reference:** FR73-FR75 in main PRD (Growth scope — moved from MVP per PM review 2026-02-14). MVP includes only schema design (fix_suggestions, self_healing_config tables with mode="disabled") for Growth readiness.

- Rule-based auto-fix for deterministic categories (tags, placeholders, numbers)
- Auto-fix preview with before/after comparison
- Auto-fix acceptance tracking per category per language pair
- Data structures designed for future AI fix storage (fix_suggestions table, shadow_results table) — **schema included in MVP**

### Phase 1: Shadow Mode (Growth — Month 3-4)

**Goal:** Calibrate AI fix accuracy per language pair without user impact.

**Data Dependency:** Needs **500+ human-corrected translations per language pair** from reviewer actions during MVP usage (Accept/Reject/Flag decisions from FR64). See `data-requirements-and-human-feedback-plan.md` Section A3 for test data specifications. Shadow Mode accuracy is measured by comparing AI-generated fix against reviewer's actual manual correction.

- AI generates fix suggestions for detected issues using **adaptive sampling** (see Shadow Mode Sampling Strategy below)
- Fixes stored but NOT shown to users
- Internal dashboard tracks: fix accuracy (compared to reviewer's manual fix), cost per fix, latency
- Per-language pair confidence thresholds established
- Judge Agent validates fix quality independently
- **Gate to Phase 2:** Shadow Mode accuracy > 85% per language pair for 500+ fixes

### Phase 2: Assisted Mode (Growth — Month 5-6)

**Goal:** Show AI fixes to reviewers for Accept/Modify/Reject.

- AI fix suggestions displayed alongside each finding with confidence score
- Reviewer can: Accept (apply as-is), Modify (edit and apply), Reject (dismiss fix)
- Every decision feeds learning loop (RAG update + prompt optimization)
- Fix quality indicators: confidence score, Judge Agent verification status, similar fixes history
- Bulk accept for high-confidence fixes (> 90%)
- **Gate to Phase 3:** Acceptance rate > 75% AND Judge agreement > 90% for 1,000+ fixes

### Phase 3: Autonomous Mode (Vision — Month 8+)

**Goal:** Auto-apply high-confidence verified fixes with human oversight.

- Fixes with confidence > 95% AND Judge Agent verified → auto-applied
- Auto-applied fixes visible in review with "auto-fixed (AI)" badge + one-click revert
- Medium confidence (80-95%) → suggested with prominent display
- Low confidence (< 80%) → flagged only, no fix proposed
- Progressive trust per language pair × fix category (can regress)
- Dashboard shows: auto-fix rate, revert rate, cost savings, time saved

---

## 4. User Journey 7: คุณแพร — "The Self-healing Day" (Growth Phase, Month 5+)

> **Evolution of Journey 2:** This journey builds directly on Journey 2 "คุณแพร — Single-Pass Day" (main PRD Section 4). In Journey 2, คุณแพร reviews 12 files in a single pass using AI detection + auto-pass. Journey 7 extends this by adding AI-generated fix suggestions — reducing manual correction work from ~4 hours to ~2 hours for 8 files. The same trust-building pattern from Journey 1-2 (verify everything → spot-check → glance & confirm) applies here for fix acceptance.

**Opening Scene:** เช้าวันอังคาร คุณแพรมีไฟล์รอตรวจ 8 ไฟล์ เธอสังเกตว่า icon ใหม่ปรากฏข้าง findings — 💊 "AI Fix Available" เธอเคยเห็นมันใน announcement เมื่อสัปดาห์ก่อน แต่ยังไม่เคยลอง

**Rising Action:**
1. เปิดไฟล์แรก — findings ปกติ แต่มี 💊 icon ข้าง 12 จาก 18 findings
2. กด 💊 ที่ finding แรก: "Missing tag `<b>` in target" → AI Fix: `เพิ่ม <b> ก่อนคำว่า 'สำคัญ'` → Preview แสดง before/after → Confidence 98% ✅ Judge Verified
3. เธอเทียบกับสิ่งที่เธอจะแก้เอง... "ตรงเลย" → กด **Accept**
4. Finding ที่ 2: "Semantic error — 'bank' translated as 'ริมฝั่ง' should be 'ธนาคาร'" → AI Fix: เปลี่ยน `ริมฝั่งแม่น้ำ` เป็น `ธนาคาร` → Confidence 91% ✅ Judge Verified
5. เธอพิจารณา... context ถูก → กด **Accept**
6. Finding ที่ 5: "Potential overtranslation" → AI Fix: ตัดคำว่า `อย่างมาก` ออก → Confidence 72% ⚠️ Judge: "Borderline" → เธอไม่แน่ใจ → กด **Modify** → แก้เป็น `มาก` แทน (ไม่ตัดทั้งหมด)

**Climax:** ไฟล์ที่ 4 — เธอเห็น 15 fixes ทั้งหมด confidence > 90% → กด **"Bulk Accept All High-Confidence"** → 15 fixes applied ใน 1 click → เธอ spot-check 3 fixes → ถูกหมด → ยิ้ม

**Resolution:** สิ้นวัน เธอตรวจ 8 ไฟล์เสร็จใน 2 ชั่วโมง แทนที่จะ 4 ชั่วโมงปกติ 73% ของ fixes ถูก accept โดยไม่ต้องแก้ เธอบอกกับทีมว่า "มันเหมือนมี junior proofreader ช่วยแก้ให้ แค่ต้อง double-check เฉยๆ"

**Trust Building Path:**
> - **Week 1:** เธอ verify ทุก fix ก่อน accept (spot-check 100%)
> - **Week 2-3:** เธอ spot-check 50% ของ high-confidence fixes
> - **Month 2+:** เธอ bulk accept high-confidence, spot-check 20%
> - **Month 4+ (Autonomous):** System auto-applies high-confidence → เธอดูแค่ medium + low confidence

> **Requirements revealed:** AI Fix display alongside findings, Confidence score per fix, Judge Agent verification status, Accept/Modify/Reject actions, Before/after preview, Bulk accept for high-confidence, Fix accuracy tracking, Modify action preserves partial fix, Trust-building through gradual confidence, Auto-fix badge with revert capability

---

## 5. Self-healing Architecture

### 4-Layer Self-healing Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    QA Finding Detected                          │
│              (from existing 3-Layer QA Pipeline)                │
└──────────────────────┬──────────────────────────────────────────┘
                       │
          ┌────────────▼─────────────┐
          │  Layer 1: Rule-based     │  FREE, INSTANT
          │  Auto-fix                │  Tags, placeholders, numbers
          │  (FR73 — Growth)         │  100% deterministic
          └────────────┬─────────────┘
                       │ If not rule-fixable
          ┌────────────▼─────────────┐
          │  Layer 2: AI Screening   │  CHEAP, FAST (~2s)
          │  + Quick Fix             │  Simple fixes + flag complex
          │  (FR-SH1, FR-SH2)       │  Vercel AI SDK generateObject
          └────────────┬─────────────┘
                       │ If complex/low confidence
          ┌────────────▼─────────────┐
          │  Layer 3: Deep AI Fix    │  PREMIUM, ACCURATE (~5-10s)
          │  + Judge Agent           │  Context-enriched fix + independent verify
          │  (FR-SH3, FR-SH4)       │  RAG context + few-shot examples
          └────────────┬─────────────┘
                       │
          ┌────────────▼─────────────┐
          │  Layer 4: Trust Gateway  │  DECISION POINT
          │                          │  High (>95%) → Auto-apply (Vision)
          │  (FR-SH5)               │  Medium (80-95%) → Suggest
          │                          │  Low (<80%) → Flag only
          └────────────┬─────────────┘
                       │
          ┌────────────▼─────────────┐
          │  Feedback Loop           │  CONTINUOUS LEARNING
          │  Accept/Modify/Reject    │  → RAG update
          │  (FR-SH6)               │  → Prompt optimization
          │                          │  → Confidence recalibration
          └──────────────────────────┘
```

### Multi-Agent Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Fix Agent     │────▶│   Judge Agent     │────▶│  Trust Gateway   │
│                 │     │                   │     │                  │
│ • Generates fix │     │ • Independent     │     │ • Confidence     │
│ • Uses RAG      │     │   evaluation      │     │   routing        │
│ • Few-shot      │     │ • GEMBA-MQM       │     │ • Auto/Suggest/  │
│   examples      │     │   scoring         │     │   Flag           │
│ • Constrained   │     │ • Hallucination   │     │ • Audit trail    │
│   output        │     │   detection       │     │                  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        ▲                                                 │
        │                  ┌──────────────┐               │
        └──────────────────│ Feedback Loop │◀──────────────┘
                           │              │
                           │ • RAG update  │
                           │ • Prompt tune │
                           │ • Threshold   │
                           │   calibrate   │
                           └──────────────┘
```

### Why Decoupled Agents (Fix ≠ Judge)

| Concern | Single Agent | Decoupled Agents (Our Approach) |
|---------|-------------|-------------------------------|
| Self-evaluation bias | "I generated this, so it must be good" | Judge has no knowledge of Fix Agent's reasoning |
| Hallucination detection | Can't catch its own hallucinations | Judge independently verifies against source/target |
| Cost | 1 API call | 2 API calls (but cheaper models for Judge) |
| Accuracy | ~70-75% | **~85-90%** (research-confirmed improvement) |

---

## 6. Domain-Specific Constraints for Self-healing

### Shadow Mode Sampling Strategy

Shadow Mode does NOT generate fixes for every finding (cost-prohibitive). Instead, **adaptive sampling** balances training signal quality with cost:

| Phase | Sampling Rate | Rationale |
|-------|:------------:|-----------|
| First 500 findings per language pair | 100% | Maximum training signal for initial calibration |
| 500-2,000 findings | 50% | Sufficient data, reduce cost |
| 2,000+ findings | 25% (random) + 100% (new fix categories) | Focus budget on novel patterns |

**Cost control:** Shadow Mode sampling is subject to FR-SH18 budget cap. If budget exhausted, sampling pauses until next month. NFR-SH3 (< 20% overhead) is measured against the sampled workload, not 100% of findings.

### Fix Generation Constraints

| Constraint | Risk | Mitigation |
|-----------|------|-----------|
| **XLIFF tag preservation** | AI-generated fix corrupts inline tags | Constrained decoding: Zod schema enforces tag structure; post-validation checks tag count/order match source |
| **Glossary compliance** | Fix uses wrong terminology | RAG retrieves project glossary before fix generation; Judge verifies glossary term usage |
| **Cultural appropriateness** | Fix is technically correct but culturally wrong | Per-language-pair calibration; CJK/Thai fixes require higher confidence threshold (+5%) |
| **Context window limits** | Long segments lose surrounding context | Sliding window with overlap; include ±3 surrounding segments as context |
| **Fix introduces new errors** | Fix resolves one issue but creates another | Judge Agent checks fix against ALL rule-based checks (tags, numbers, glossary) before approval |

### Language-Specific Fix Rules

| Language | Special Consideration |
|----------|---------------------|
| **Thai (TH)** | No spaces between words — fix must maintain correct word boundaries; Thai numeral ↔ Arabic mapping in fixes |
| **Chinese (ZH)** | Simplified ↔ Traditional consistency; fullwidth punctuation in fixes |
| **Japanese (JA)** | Mixed scripts — fix must use correct script (kanji vs katakana vs hiragana) |
| **RTL (AR, HE)** | Fix must preserve bidi markers and RTL text direction |
| **CJK general** | Higher confidence threshold (+5%) for AI fixes due to complexity |

---

## 7. Functional Requirements — Self-healing

> **Numbering:** FR-SH# (Self-Healing) to distinguish from main PRD's FR# sequence.
> **Prerequisite:** All FR-SH requirements depend on core QA pipeline (main PRD FR1-FR72) being operational.

### Fix Generation

- **FR-SH1:** System can generate AI fix suggestions for detected QA findings using the Fix Agent, providing: proposed correction text, confidence score (0-100), fix category (terminology, grammar, semantic, style, tag, formatting), and explanation of why the fix is proposed. Fix Agent uses structured output validation to ensure XLIFF tag preservation
- **FR-SH2:** System can enrich fix generation context using RAG retrieval from project glossary, translation memory, and previously accepted fixes stored as pgvector embeddings in Supabase. Context includes: matching glossary terms, similar past fixes for same language pair, and ±3 surrounding segments for discourse context
- **FR-SH3:** System can route fix requests based on complexity: simple fixes (single term, tag, number) → Layer 2 quick fix; complex fixes (semantic, multi-segment, cultural) → Layer 3 deep fix with enriched context

### Fix Verification

- **FR-SH4:** System can verify fix quality using an independent Judge Agent that evaluates: (a) semantic preservation — fix maintains source meaning, (b) glossary compliance — fix uses correct project terminology, (c) tag integrity — all source tags preserved in fix, (d) fluency — fix reads naturally in target language, (e) no new errors introduced — fix passes all rule-based checks. Judge Agent outputs: pass/fail verdict, confidence score, and specific concerns if any
- **FR-SH5:** System can route verified fixes through the Trust Gateway: High confidence (>95% + Judge pass) → auto-apply eligible (Autonomous Mode only), Medium confidence (80-95% OR Judge concerns) → suggest to reviewer, Low confidence (<80% OR Judge fail) → flag finding only without fix proposal

### Fix Presentation & User Interaction

- **FR-SH6:** QA Reviewer can view AI fix suggestions alongside findings with: proposed fix text, before/after preview in segment context, confidence score with visual indicator, Judge verification status (✅ Verified / ⚠️ Concerns / ❌ Failed), and fix category badge
- **FR-SH7:** QA Reviewer can Accept (apply fix as-is), Modify (edit fix and apply), or Reject (dismiss fix) for each AI fix suggestion. Every action recorded with timestamp, actor, and rationale (optional for Accept, required for Reject)
- **FR-SH8:** QA Reviewer can bulk accept all fixes above a configurable confidence threshold (default 90%) for a single file, with confirmation dialog showing count and lowest confidence fix in the batch
- **FR-SH9:** QA Reviewer can view fix history per segment showing: all proposed fixes, accepted/modified/rejected status, who decided, and when

### Progressive Trust System

- **FR-SH10:** System can operate in Shadow Mode where AI generates fixes silently (not displayed to users), stores results, and tracks accuracy by comparing AI fixes against reviewer's actual corrections. Admin can enable Shadow Mode per project per language pair
- **FR-SH11:** System can transition from Shadow Mode to Assisted Mode when accuracy threshold is met (configurable, default > 85% accuracy measured over the most recent 500 fixes as a rolling window per language pair). Transition is per language pair per project — not global. Admin can override to force transition or revert
- **FR-SH12:** System can transition from Assisted Mode to Autonomous Mode when acceptance rate threshold is met (configurable, default > 75% acceptance rate AND > 90% Judge agreement for 1,000+ fixes per language pair). Admin can override. System can auto-revert to Assisted Mode if revert rate exceeds 5% in any 7-day window
- **FR-SH13:** System can display trust level status per language pair: current mode (Shadow/Assisted/Autonomous), accuracy trend, fixes until next threshold, and mode transition history

### Learning & Feedback Loop

- **FR-SH14:** System can update RAG knowledge base when reviewer Accepts or Modifies a fix: accepted fix stored as positive example embedding, modified fix stored as improved example embedding, with source finding and correction pair for future retrieval
- **FR-SH15:** System can recalibrate confidence thresholds per language pair based on accumulated accept/reject/modify signals. Recalibration runs weekly (configurable) and requires minimum 100 new signals since last calibration
- **FR-SH16:** System can display Self-healing analytics dashboard showing: fix accuracy trend over time, acceptance/modify/reject rates per language pair, cost per fix trend, estimated time saved, top fix categories, and mode progression per language pair

### Observability & Cost Control

- **FR-SH17:** System can log all Self-healing pipeline events: fix generation (model, tokens, cost, latency), judge evaluation (model, tokens, cost, verdict), trust gateway decision, and user action. All events linked to source finding ID and file ID
- **FR-SH18:** System can enforce Self-healing cost budget per project: configurable monthly cap for AI fix generation + judge verification, **separate from main QA detection budget (FR71)**. Admin dashboard aggregates both budgets for total AI cost visibility. When Self-healing budget reaches 80% → warning notification to admin. When budget reached → Self-healing pauses, QA detection continues unaffected on its own independent budget

---

## 8. Non-Functional Requirements — Self-healing

| NFR-SH# | Requirement | Measurement | Phase |
|---------|------------|-------------|-------|
| NFR-SH1 | Layer 2 quick fix generates in < 3 seconds per finding | API call latency, measured from finding to fix response | Growth |
| NFR-SH2 | Layer 3 deep fix + Judge generates in < 10 seconds per finding | Combined Fix Agent + Judge Agent latency | Growth |
| NFR-SH3 | Shadow Mode adds < 20% overhead to existing QA pipeline processing time | Compare batch processing time with/without Shadow Mode | Growth |
| NFR-SH4 | Fix generation cost < $0.05 per fix (Layer 2) and < $0.15 per fix (Layer 3) | Tracked per fix via FR-SH17 | Growth |
| NFR-SH5 | RAG retrieval adds < 500ms to fix generation | pgvector query latency measurement | Growth |
| NFR-SH6 | Self-healing failure does not block QA pipeline — findings always display even if fix generation fails | Test: disconnect fix agent → findings still appear | Growth |
| NFR-SH7 | Fix suggestions cached per file version — re-opening same file shows previously generated fixes without re-calling AI | Cache key = file hash + finding ID | Growth |

---

## 9. Technical Architecture Notes

### Tech Stack Alignment (No New Infrastructure)

| Component | Existing (Main PRD) | Self-healing Usage |
|-----------|--------------------|--------------------|
| **Vercel AI SDK 6** | AI Layer 2/3 QA analysis | Fix Agent + Judge Agent (generateObject, structured output) |
| **Inngest** | Queue for batch processing | Durable execution for fix pipeline (step.run + step.ai.infer) |
| **Supabase** | Auth, DB, Storage | pgvector for RAG embeddings; fix_suggestions table; shadow_results table |
| **Next.js** | App Router, UI | Fix display components; Self-healing settings pages |
| **Vercel** | Hosting | Same deployment pipeline |

### Database Schema Additions

```
-- New tables for Self-healing (additive, no changes to existing schema)

fix_suggestions
├── id (uuid)
├── finding_id (FK → findings)
├── file_id (FK → files)
├── project_id (FK → projects)
├── tenant_id
├── proposed_fix_text
├── original_text
├── fix_category (enum: terminology, grammar, semantic, style, tag, formatting)
├── confidence_score (0-100)
├── judge_verdict (enum: pass, fail, concerns)
├── judge_confidence (0-100)
├── judge_details (jsonb)
├── trust_gateway_decision (enum: auto_apply, suggest, flag_only)
├── user_action (enum: accepted, modified, rejected, pending, null)
├── user_modified_text (nullable)
├── user_rationale (nullable)
├── fix_agent_model
├── fix_agent_tokens
├── fix_agent_cost
├── fix_agent_latency_ms
├── judge_agent_model
├── judge_agent_tokens
├── judge_agent_cost
├── judge_agent_latency_ms
├── rag_context (jsonb — glossary matches, similar fixes, surrounding segments)
├── is_shadow (boolean — true if generated in Shadow Mode)
├── created_at
├── decided_at
└── decided_by (FK → users, nullable)

self_healing_config
├── id (uuid)
├── project_id (FK → projects)
├── tenant_id
├── language_pair
├── mode (enum: disabled, shadow, assisted, autonomous)
├── shadow_accuracy_threshold (default 85)
├── assisted_acceptance_threshold (default 75)
├── autonomous_confidence_threshold (default 95)
├── auto_revert_threshold (default 5)
├── monthly_budget_cap (decimal)
├── budget_used_current_month (decimal)
├── total_fixes_generated
├── total_fixes_accepted
├── total_fixes_modified
├── total_fixes_rejected
├── last_calibration_at
├── mode_transition_history (jsonb)
├── created_at
└── updated_at

fix_embeddings
├── id (uuid)
├── project_id (FK → projects)
├── tenant_id
├── language_pair
├── source_text
├── original_target
├── corrected_target
├── fix_category
├── embedding (vector(1536))
├── metadata (jsonb)
├── created_at
└── source_fix_id (FK → fix_suggestions)
```

### Inngest Pipeline Flow

```typescript
// Conceptual flow — not implementation code

inngest.createFunction("self-healing-pipeline", async ({ step }) => {
  // Step 1: Check if Self-healing is enabled for this language pair
  const config = await step.run("check-config", () => getConfig(projectId, langPair));
  if (config.mode === "disabled") return;

  // Step 2: Retrieve RAG context
  const ragContext = await step.run("rag-retrieval", () =>
    retrieveContext(finding, projectId, langPair)
  );

  // Step 3: Generate fix (Layer 2 or 3 based on complexity)
  const fix = await step.ai.infer("generate-fix", {
    model: selectModel(finding.complexity),
    prompt: buildFixPrompt(finding, ragContext),
    schema: fixOutputSchema, // Zod schema for constrained output
  });

  // Step 4: Judge Agent verification
  const verdict = await step.ai.infer("judge-fix", {
    model: judgeModel,
    prompt: buildJudgePrompt(finding, fix, ragContext),
    schema: judgeOutputSchema,
  });

  // Step 5: Trust Gateway decision
  const decision = await step.run("trust-gateway", () =>
    routeFix(fix, verdict, config)
  );

  // Step 6: Store result
  await step.run("store-fix", () =>
    storeFix(fix, verdict, decision, config.mode === "shadow")
  );
});
```

---

## 10. Implementation Roadmap

### Phase 0: Foundation (Growth — Month 3, schema in MVP)

> FR73-FR75 in main PRD (Growth scope). Schema design included in MVP Month 1-2.

- [ ] `fix_suggestions` table schema (with `is_shadow` column ready) — **MVP: schema only**
- [ ] `self_healing_config` table schema (mode defaults to "disabled") — **MVP: schema only**
- [ ] Rule-based auto-fix implementation — **Growth**
- [ ] Auto-fix preview UI component — **Growth**
- [ ] Auto-fix acceptance tracking — **Growth**

### Phase 1: Shadow Mode (Growth — Month 3-4)

- [ ] Fix Agent implementation (Vercel AI SDK generateObject)
- [ ] Judge Agent implementation (separate model/prompt)
- [ ] Inngest pipeline for fix generation
- [ ] RAG setup: pgvector extension + `fix_embeddings` table
- [ ] Shadow Mode: generate fixes silently, store in DB
- [ ] Internal accuracy dashboard (compare AI fix vs reviewer's correction)
- [ ] Per-language pair confidence tracking
- [ ] Shadow Mode admin settings UI

### Phase 2: Assisted Mode (Growth — Month 5-6)

- [ ] Fix display UI alongside findings (💊 icon + panel)
- [ ] Accept/Modify/Reject actions with feedback capture
- [ ] Bulk accept for high-confidence fixes
- [ ] Before/after preview component
- [ ] Feedback loop: accepted fixes → RAG embeddings
- [ ] Confidence threshold auto-recalibration
- [ ] Mode transition logic (Shadow → Assisted)
- [ ] Self-healing analytics dashboard
- [ ] Cost tracking and budget enforcement

### Phase 3: Autonomous Mode (Vision — Month 8+)

- [ ] Trust Gateway auto-apply logic
- [ ] Auto-applied fix display with revert capability
- [ ] Mode transition logic (Assisted → Autonomous)
- [ ] Auto-revert safety circuit (revert rate > 5% → back to Assisted)
- [ ] Advanced RAG: fine-tuning preparation with accumulated data
- [ ] Cross-project learning (anonymized fix patterns)

---

## 11. Cost Projections

### Per-Fix Cost Breakdown

| Component | Layer 2 (Quick) | Layer 3 (Deep) |
|-----------|:---------------:|:--------------:|
| Fix Agent | ~$0.01-0.02 | ~$0.05-0.08 |
| Judge Agent | ~$0.005-0.01 | ~$0.02-0.04 |
| RAG retrieval | ~$0.001 | ~$0.001 |
| **Total per fix** | **~$0.02-0.03** | **~$0.07-0.12** |

### Monthly Cost Estimate (Assisted Mode)

| Scenario | Files/month | Findings/file | Fixes/month | Monthly Cost |
|----------|:-----------:|:-------------:|:-----------:|:------------:|
| Small team (Mona's) | 200 | 15 | 3,000 | $60-90 |
| Medium team | 500 | 15 | 7,500 | $150-225 |
| Large team | 2,000 | 15 | 30,000 | $600-900 |

### Cost Optimization Strategies

1. **Prompt caching** — Vercel AI SDK cache: up to 90% token cost reduction for repeated patterns
2. **Model routing** — Use cheaper model for Layer 2, premium for Layer 3 only
3. **RAG context reduction** — Focused retrieval reduces input tokens by ~70%
4. **Fix caching** — Same finding pattern → retrieve cached fix (no new API call)
5. **Batch optimization** — Group similar findings for single API call

---

## 12. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|:-----------:|:------:|-----------|
| AI fix introduces new errors | Medium | High | Judge Agent + rule-based post-validation |
| Users lose trust in QA findings due to bad fixes | Low | Critical | Fixes are separate from detection — bad fix ≠ bad detection |
| Fix costs exceed budget | Medium | Medium | Per-project budget cap (FR-SH18) + cost alerts |
| Shadow Mode delays Growth features | Low | Medium | Shadow Mode runs in background — no UI work until Phase 2 |
| Language pair accuracy varies significantly | High | Medium | Per-language pair thresholds + separate mode transitions |
| RAG embedding quality degrades over time | Low | Medium | Periodic reindexing + embedding model version tracking |
| Competitor launches similar feature | Medium | Medium | First-mover advantage + data moat from feedback loop |

---

## 13. Open Questions

1. **Fix Agent model selection:** Start with Claude Sonnet 4.5 (balance cost/quality) or Haiku 4.5 (cost-optimized)? → Decide during Shadow Mode based on accuracy data
2. **Judge Agent model:** Same model as Fix Agent or different? → Research suggests different model reduces bias
3. **RAG embedding model:** text-embedding-3-small vs text-embedding-3-large? → Start small, upgrade if retrieval quality insufficient
4. **Cross-project learning:** Can anonymized fix patterns from one project improve another? → Defer to Vision phase, privacy review required
5. **Fine-tuning timeline:** When is accumulated data sufficient for model fine-tuning? → Target 10,000+ accepted fixes per language pair

---

*This PRD is a living document. It will be updated as Shadow Mode data reveals accuracy patterns and user feedback shapes the Self-healing experience.*

*Cross-reference: [Main PRD](prd.md) | [Self-healing Translation Research](research/technical-ai-llm-self-healing-translation-research-2026-02-14.md)*
