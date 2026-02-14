---
stepsCompleted: [1, 2, 3, 4, 5, 6]
status: complete
inputDocuments:
  - _bmad-output/planning-artifacts/research/ai-llm-translation-qa-research-2025.md
  - _bmad-output/planning-artifacts/research/deployment-queue-infrastructure-research-2026-02-11.md
  - _bmad-output/planning-artifacts/research/technical-qa-localization-tools-and-frameworks-research-2026-02-11.md
  - docs/qa-localization-tool-plan.md
  - docs/QA _ Quality Cosmetic.md
date: 2026-02-11
author: Mona
---

# Product Brief: qa-localization-tool

## Executive Summary

**qa-localization-tool** is a standalone, AI-powered localization quality assurance web application that combines rule-based checks with multi-layer AI analysis to deliver end-to-end translation file QA — eliminating the proofreading step and upgrading human reviewers into AI-assisted QA specialists who can handle significantly higher volumes with the same headcount.

The localization industry still relies on decade-old desktop tools like Xbench that only perform surface-level pattern matching (placeholders, tags, numbers) while requiring human proofreaders and QA reviewers to catch meaning errors, tone mismatches, and cultural issues. This creates a costly, slow, repetitive loop between QA reviewers and proofreaders that doesn't scale.

Our tool introduces a **model-agnostic, API-first** multi-layer AI pipeline — rule-based checks (instant, free) → AI screening (cost-effective) → deep AI semantic analysis (high-accuracy) — that automates what proofreaders do today. **Rule-based results display immediately** while AI analysis continues in the background, giving users instant value. Files meeting **configurable auto-pass criteria (default: Score > 95 AND 0 Critical issues)** pass without human intervention, with full audit trail for spot-checking. Files below threshold are routed to QA reviewers with a pre-built issue list, direct segment navigation, and AI-generated fix suggestions with confidence scores — all requiring **explicit user acceptance** before applying.

**The rule-based layer covers the most frequent 80% of QA checks** as MVP baseline, built on production QA Cosmetic standards from real localization workflows. Glossary import ensures terminology validation from day one. **The switching cost is near-zero**: teams upload existing files without changing their translation workflow or TMS.

**Format support:** XLIFF (primary, ~80% of real-world usage) and Excel bilingual files (source/target columns, ~20%) from MVP. Bilingual Word and additional formats in Phase 2.

**Cost flexibility:** Two processing modes — **Economy mode** (Layer 1 + Layer 2 only, ~$0.40/100K words) and **Thorough mode** (all layers, ~$2.40/100K words). The layer architecture is flexible — layers can be bypassed as AI cost structures evolve.

**Unit economics:** At $0.01/translation unit with ~$2.40/100K words AI cost, gross margin is ~75-85%. Break-even at approximately 3 paying customers covering MVP infrastructure.

**The human story:** This tool doesn't eliminate people — it upgrades their role. Proofreaders become AI-assisted QA reviewers who work faster with better data. Teams handle more volume without hiring. Executives get measurable AI-driven cost reduction.

**Competitive moat:** Every file processed improves prompt accuracy per language pair and domain. Over time, this creates a **data-driven quality moat** — the more customers use the tool, the more accurate it becomes, making it progressively harder for competitors to match.

**Go-to-market:** Dogfooding first — the founding team uses the tool in their own localization workflow to validate and prove results with real production data before public launch.

**Key metrics:** ~75% AI cost savings through the multi-layer funnel, false positive rate target < 10%, MVP infrastructure ~$30-95/month.

---

## Core Vision

### Problem Statement

Localization teams today are trapped in an expensive, manual QA loop. Tools like Xbench — the current industry standard — only perform basic rule-based checks (placeholder matching, tag validation, number consistency) but cannot understand translation **meaning, tone, cultural appropriateness, or fluency**. This forces organizations to maintain a multi-step human review pipeline:

```
Translation → Xbench (basic) → QA Reviewer → Proofreader → Repeat ↺
```

The repetitive loop between QA reviewers and proofreaders is the primary bottleneck — consuming time, headcount, and budget while limiting the volume of work a team can handle.

### Problem Impact

- **Cost:** Dedicated proofreaders and repeated review cycles consume significant labor budget
- **Speed:** The QA-proofreader loop adds days to project timelines
- **Scale ceiling:** Teams cannot take on more volume without hiring more reviewers
- **Management pressure:** Executives increasingly demand AI adoption to reduce people costs for QA and proofreading roles — but lack tools that provide measurable ROI data
- **Tool stagnation:** Xbench and similar tools have outdated UIs, are desktop-only, and have seen no meaningful innovation in AI-powered quality assessment
- **Trust gap:** Even when AI tools exist, QA reviewers need audit trails and spot-check capabilities before trusting automated decisions

### Why Existing Solutions Fall Short

| Solution | Limitation | Weighted Score |
|----------|-----------|:-:|
| **Xbench** | Rule-based only; no semantic understanding; outdated desktop UI; no AI; no fix suggestions | 3.10/10 |
| **Verifika** | Desktop only; no AI integration; no cloud collaboration | 2.73/10 |
| **TMS-embedded QA** (Phrase, Lokalise, Crowdin) | Locked to their TMS platform; not standalone; limited AI capabilities | 3.39/10 |
| **Manual proofreading** | Expensive, slow, inconsistent, doesn't scale | N/A |
| **qa-localization-tool** | **AI-powered, standalone, modern web, score-based auto-pass** | **8.67/10** |

**Critical gap:** No standalone, AI-powered localization QA web application exists in the market today. All AI QA features are embedded within TMS platforms, forcing teams into vendor lock-in.

### Proposed Solution

A modern, **API-first** web application that delivers **end-to-end translation file QA** through a flexible multi-layer AI pipeline with two processing modes:

**Economy Mode** (~$0.40/100K words) — Layer 1 + Layer 2 only:
Best for high-volume screening, cost-sensitive workflows, or initial pass before human review.

**Thorough Mode** (~$2.40/100K words) — All layers:
Full semantic analysis with AI fix suggestions. Recommended for production-quality QA.

*The layer architecture is designed for flexibility — layers can be added, removed, or bypassed as AI capabilities and cost structures evolve.*

---

**Supported File Formats:**

| Format | Phase | Parsing Complexity |
|--------|:-----:|---|
| **XLIFF 1.2 / 2.0** | MVP | `xliff` npm package — industry standard |
| **Excel bilingual** (source/target columns) | MVP | Simple column mapping — covers ~20% of real-world usage |
| **Bilingual Word** | Phase 2 | Table-based source/target extraction |
| **CSV bilingual** | Phase 2 | Trivial parsing |
| **JSON i18n** | Phase 3 | Nested/flat key-value |
| **PO/POT (gettext)** | Phase 3 | `gettext-parser` npm package |
| **Android XML** | Phase 3 | `fast-xml-parser` + custom adapter |
| **iOS .strings** | Phase 3 | Custom regex parser |
| **PDF source vs target** (visual QA) | Future | Rendered layout comparison |

---

**Layer 1 — Rule-based Engine (instant, free):**
Covers the **top 80% most frequently encountered QA checks** as MVP baseline, built on production QA Cosmetic standards. **Results display immediately** while AI layers process in background:
- Tag integrity validation (source vs target)
- Missing text / untranslated detection
- Numeric consistency
- Placeholder matching
- Unnecessary spacing
- Capitalization checks
- **Glossary import and term matching** (supports standard glossary formats)
- Punctuation validation
- Symbol and numbering checks
- Text format validation (bold, italic tags)

**Layer 2 — AI Quick Screening (cost-effective, GPT-4o-mini / Claude Haiku):**
- Flag ~20% of segments that need deep analysis
- ~80% of clean segments pass through without expensive processing
- Cost: ~$0.40 per 100K words

**Layer 3 — Deep AI Analysis (high-accuracy, Claude Sonnet):**
- Semantic accuracy (mistranslation, omission, hallucination)
- Tone/register consistency
- Style guide compliance
- Instructions-following verification
- Cultural appropriateness
- Fluency and naturalness
- Terminology consistency (semantic, beyond glossary matching)
- **Context-aware analysis** — utilizes notes, comments, and context metadata from XLIFF to improve AI accuracy
- AI-generated fix suggestions with **confidence scores** (< 70% displays warning)
- Cost: ~$2.00 per 100K words (only flagged segments)

**Model-agnostic design:** Built on Vercel AI SDK abstraction layer — models can be swapped (Claude → GPT → Gemini → future models) without code changes. What is locked in is the **prompt engineering and output schema**, not the model.

**AI Suggestion Safety:**
- All suggestions are **recommendations, never auto-applied** — users must explicitly accept each suggestion
- Confidence score displayed per suggestion (< 70% = warning flag)
- Accept/reject decisions logged → feedback loop for continuous prompt improvement
- Over time, this feedback data creates a **quality moat** that improves accuracy per language pair and domain

**Configurable Auto-pass Criteria:**
- **Default: Score > 95 AND 0 Critical issues → Auto-pass**
- **Any Critical issue → Never auto-pass** — regardless of overall score
- **Score threshold is configurable per project** — legal content may require 99, marketing may accept 90
- **Score < threshold → QA reviewer** receives pre-built issue list with AI suggestions
- **Audit trail for auto-passed files** — all decisions logged with full issue analysis for spot-checking

**QA Reviewer Experience:**
- **Rule-based results appear instantly** — no waiting for AI to finish
- **Issue → segment direct navigation** — click any issue to jump directly to the source/target segment
- **Filter by severity** — Critical and Major issues surfaced first (progressive disclosure)
- **AI suggestions inline** with confidence scores — explicit accept/reject per suggestion
- **Executive summary view** — "3 critical issues, 5 major issues need review" at a glance

**API-first Architecture:**
- Web application is one frontend consuming the core API
- API enables future integrations: CI/CD pipelines, CAT tool plugins, CLI tools, third-party automation
- All QA functionality is accessible programmatically

**Switching cost: near-zero** — teams upload existing XLIFF or Excel files without changing their TMS or translation workflow.

**MVP Dashboard for VP/Director:**
- Summary cards: total files processed, average score, auto-pass rate, estimated hours saved
- Quality trend chart over time
- Recent activity feed
- Export to PDF/Excel for executive reporting

**Future features:**
- Visual/layout QA for rendered files (e.g., PDF source vs target comparison)
- Advanced ROI analytics — cost savings calculator, per-vendor comparison, per-language-pair trends
- Multi-vendor quality comparison — compare quality scores across translation vendors

### Key Differentiators

| Differentiator | Detail |
|---------------|--------|
| **AI understands meaning** | Not just pattern matching — detects mistranslation, omission, tone issues, cultural problems |
| **Upgrades human roles** | Proofreaders become AI-assisted QA reviewers; teams handle more volume, not fewer people |
| **Data-driven quality moat** | Every file processed improves prompt accuracy — more usage = better quality = harder for competitors to match |
| **Rule-based foundation** | Top 80% QA checks from production QA Cosmetic standards, including glossary import |
| **Instant rule-based results** | Rule-based findings display immediately while AI processes in background |
| **Multi-format support** | XLIFF + Excel from MVP; Word, CSV, JSON, PO, mobile formats in later phases |
| **Context-aware AI** | Utilizes XLIFF notes/comments/context for higher accuracy in domain-specific content |
| **Safe AI suggestions** | Confidence scores, explicit accept/reject, never auto-applied — feedback loop improves quality over time |
| **API-first architecture** | Web app is one frontend; API enables CI/CD, plugins, CLI, third-party integration |
| **Model-agnostic** | Vercel AI SDK abstraction — swap LLM providers without code changes as AI evolves |
| **Flexible layer architecture** | Layers can be bypassed as AI cost structures change |
| **Standalone, no lock-in** | Works with any TMS or workflow via file upload — neutral ground for multi-vendor teams |
| **Near-zero switching cost** | Upload XLIFF or Excel — no workflow changes, no migration, no training |
| **Configurable auto-pass** | Threshold adjustable per project; Critical always blocks |
| **Audit trail & trust building** | Auto-pass decisions fully logged for spot-checking |
| **Issue → segment navigation** | Click any issue to jump directly to the segment |
| **Economy & Thorough modes** | $0.40/100K (screening) vs $2.40/100K (full analysis) |
| **Strong unit economics** | ~75-85% gross margin; break-even at ~3 paying customers |
| **Low false positive rate** | Target < 10% with per-language tuning |
| **Modern web UX** | Progressive disclosure — executive summary first, detail on demand |
| **MQM-compatible taxonomy** | Industry-standard error framework from real QA Cosmetic standards |
| **Dogfooding go-to-market** | Proven with real production data before public launch |
| **Built by localization practitioners** | Founded on years of hands-on experience |

---

## Target Users

### Primary Users

#### Persona 1: คุณแพร — QA Reviewer (ภาษาไทย)

| | Detail |
|---|---|
| **Role** | Senior QA Reviewer, ทีม Localization |
| **Team size** | 6-9 คนในทีม QA |
| **Languages** | ตรวจภาษาไทยเป็นหลัก — รัน Xbench + ตรวจเองทั้งหมด |
| **Current tools** | Xbench (desktop), CAT tools, Excel |
| **Tech comfort** | สูง — เรียนรู้ tool ใหม่ได้เร็ว |
| **Daily workflow** | รับไฟล์แปล → รัน Xbench → ตรวจ issue list → ส่ง proofreader → รับกลับ → ตรวจซ้ำ → repeat |
| **Volume** | 10-15 ไฟล์/วัน — ต้องการ **batch upload + batch summary** ไม่ใช่ทีละไฟล์ |
| **Pain points** | Loop ซ้ำกับ proofreader กินเวลา, Xbench ตรวจได้แค่ผิวเผิน, ต้องอ่านเองทุก segment ที่ Xbench ตรวจไม่ได้ |
| **Hidden pain** | False positive fatigue — ถ้า AI flag ผิดเยอะ (เช่น สำนวนไทยที่ AI ไม่เข้าใจ) ต้อง reject ทีละอัน เสียเวลากว่าไม่ใช้; จะ cross-check กับ Xbench ช่วง 2 อาทิตย์แรก → ถ้า rule-based พลาดแม้แต่จุดเดียวที่ Xbench จับได้ จะไม่เชื่อทั้ง pipeline |
| **Root cause** | ไม่มี single source of truth ที่ทุกคนเชื่อมั่น → ต้องตรวจซ้ำหลายรอบ (QA ↔ Proofreader) เป็น "วงจรแห่งการไม่ไว้ใจ"; Tool ต้อง position เป็น "the one check" ไม่ใช่ "another check" |
| **Goal** | ตรวจไฟล์ได้ครบวงจรในขั้นตอนเดียว ไม่ต้องส่งต่อ proofreader — **ทำลายวงจรตรวจซ้ำ** |
| **Trust requirement** | Rule-based ต้อง >= Xbench (parity test) ก่อน user จะเชื่อ AI layer |
| **Success moment** | "รัน tool แล้วเห็น issue list ที่ครอบคลุมทั้ง rule-based + AI พร้อม suggestion — ไม่ต้องอ่าน segment เองทั้งไฟล์อีกต่อไป" |

#### Persona 2: คุณนิด — QA Reviewer (ภาษาอื่น)

| | Detail |
|---|---|
| **Role** | QA Reviewer, ทีม Localization |
| **Languages** | รัน Xbench สำหรับ EN→ZH, EN→JA, EN→KO แต่ไม่ได้เชี่ยวชาญภาษาเหล่านี้ |
| **Current workflow** | รัน Xbench → ส่ง Xbench report ให้ native reviewer ตรวจ meaning → รับ feedback → compile final report |
| **Pain points** | ต้องพึ่ง native reviewer ภายนอกสำหรับ semantic check, ตัวเองตรวจได้แค่ rule-based, รอ reviewer กลับมาช้า |
| **Hidden pain** | AI บอกว่า "แปลผิดความหมาย" confidence 72% — แต่อ่านภาษา target ไม่ออก ไม่รู้จะ accept หรือ reject; ต้องการ action ที่ 3: **"Flag for native review"** เพื่อ mark ไว้ใน report; ต้องการ report แยกชัดเจนว่าอันไหน "verified by reviewer" vs "AI flagged, needs native verification" |
| **Root cause** | Language coverage gap — ทีม 6-9 คนต้อง cover หลายภาษา แต่ไม่มี native speaker ทุกภาษา; พึ่ง freelance native reviewer ที่ response time ควบคุมไม่ได้ (1-3 วัน) |
| **Goal** | AI ทำหน้าที่ semantic check แทน native reviewer — ได้ผลลัพธ์ทันทีไม่ต้องรอคน |
| **Deeper value** | **Language scalability** — ทีม 6-9 คน cover ทุกภาษาได้โดยไม่ต้องพึ่งคนนอก (ไม่ใช่แค่ volume scalability) |
| **UX need** | Confidence score ต้องเป็น visual indicator ชัดเจน: High (>85%) / Medium (70-85%) / Low (<70%) — ไม่ใช่แค่ตัวเลข |
| **AI accuracy tracking** | ต้องการรู้ว่า AI ถูกกี่% ต่อ language pair — "EN→ZH AI ถูก 90%, EN→TH ถูก 85%" → ช่วยตัดสินใจว่ายังต้องพึ่ง native reviewer ไหม (Phase 2) |
| **Native reviewer collab** | Native reviewer ควรเข้า tool ได้ด้วย (guest role) — เห็นแค่ assigned files + flagged findings, accept/reject ใน tool ได้เลย ไม่ต้อง compile report กลับ (Phase 2) |
| **Success moment** | "รัน tool แล้ว AI ตรวจ meaning ให้เลย ไม่ต้องส่งไปให้ native reviewer — ได้ issue list + suggestion กลับมาใน 2 นาทีแทน 2 วัน" |

#### Persona 3: ใครก็ได้ในทีม — The "Democratized QA" User

| | Detail |
|---|---|
| **Role** | PM, Coordinator, หรือทีมสมาชิกคนใดก็ได้ |
| **QA expertise** | ไม่จำเป็นต้องมี — tool เป็น expert ให้ |
| **Prerequisite** | ระบบต้องเชื่อถือได้ (Score > 95 + 0 Critical = auto-pass) |
| **Use case** | Upload ไฟล์ → ดูผลลัพธ์ → ถ้า auto-pass ก็จบ, ถ้าไม่ pass ส่งต่อ QA reviewer |
| **Hidden risk** | Trust auto-pass 100% โดยไม่ spot-check → ส่งลูกค้าแล้วเจอปัญหา (เช่น tone ไม่เหมาะกับ legal content); ต้องมี **auto-pass warning** สำหรับ sensitive content types + **project content-type tagging** เพื่อปรับ threshold อัตโนมัติ |
| **Value** | ลด bottleneck ที่ QA reviewer — งานที่ "ง่าย" ไม่ต้องรอคิว QA |
| **Guardrails needed** | Warning message เมื่อ auto-pass ไฟล์ที่เป็น legal/medical/financial content; option to route to QA reviewer แม้จะ pass threshold |
| **Content type** | PM ไม่รู้จะ tag content type เอง → ต้องตั้งที่ **project level** โดย QA lead (ตอน setup project ครั้งเดียว) → threshold ปรับอัตโนมัติ |
| **Client feedback** | หลังส่งลูกค้า ต้องมี workflow ง่ายๆ: "Client approved ✅" / "Client raised issue ❌ + reason" → data ช่วย tune AI (MVP simple log) |
| **Success moment** | "ฉันเป็น PM ไม่ใช่ QA แต่ upload ไฟล์แล้ว tool บอกว่า Score 97, 0 Critical — auto-pass ได้เลย ไม่ต้องรบกวน QA team" |

**Key Insight — Risk-based Routing:** Auto-pass ไม่ใช่ "ลัดขั้นตอน" — มันคือ **risk-based routing** ที่เกิดขึ้นครั้งแรกในวงการ localization QA ปัจจุบันทุกไฟล์ถูก treat เหมือนกัน ไม่มี differentiation → Score ทำให้ทีมจัดการ workload ตาม risk level ได้จริง เมื่อระบบเชื่อถือได้ QA จะกลายเป็น **self-service** — ทุกคนในทีมใช้ได้ QA reviewer โฟกัสเฉพาะไฟล์ที่ score ต่ำหรือมี critical issues

**Democratized QA Guardrails:** Self-service QA มี downside ที่ซ่อนอยู่ — non-QA users อาจ trust auto-pass 100% สำหรับ sensitive content โดยไม่ spot-check → ต้องมี guardrails ไม่ใช่แค่ empower

---

### Secondary Users

#### Management / VP / Director (Dashboard User)

| | Detail |
|---|---|
| **Role** | Localization Director, VP, ผู้บริหาร |
| **Interaction** | ดู dashboard เท่านั้น — ไม่ได้ run QA เอง |
| **Root cause** | QA ถูกมองเป็น cost center เพราะ **ไม่มี data แสดง value** — "ของที่ไม่เกิดขึ้น" วัดไม่ได้; Xbench ไม่มี history, analytics, trend → ทุกอย่างเป็น manual report ที่ไม่มีใครมี bandwidth ทำ |
| **Needs** | จำนวนไฟล์ที่ตรวจ, average score, จำนวน auto-pass vs manual review, issues found by severity, time saved estimate, cost savings, quality trend over time |
| **Value** | ข้อมูลสำหรับ prove ROI ให้ C-level, ตัดสินใจเรื่อง headcount, เปลี่ยน QA จาก cost center เป็น **quality assurance asset ที่วัดผลได้** |
| **MVP scope** | **Dashboard สวยๆ ใน MVP** — VP/Director ต้องเห็น value ทันทีผ่าน visual dashboard: summary cards (total files, avg score, auto-pass rate, estimated hours saved), quality trend chart, recent activity feed; export to PDF/Excel สำหรับ reporting |
| **Dashboard = survival tool** | Dashboard ไม่ใช่ nice-to-have — มันคือ **weapon ที่ QA team ใช้ protect ตำแหน่งตัวเอง** ในองค์กร; ถ้าผู้บริหารเห็น data ว่า QA + AI tool ทำงานได้ดี = justify headcount ได้ |

#### Future: External Customers

| | Detail |
|---|---|
| **Timeline** | หลังจาก tool พิสูจน์ตัวเองกับทีม internal แล้ว |
| **Types** | Localization vendors, in-house localization teams ที่บริษัทอื่น, freelance QA |
| **Prerequisite** | Tool ต้อง "แข็งแกร่งจริง" — ผ่าน dogfooding, false positive < 10%, ลูกค้า internal พอใจ |
| **Go-to-market** | ใช้ผลลัพธ์จาก internal เป็น case study → free trial → paid subscription |

---

### User Journey

#### QA Reviewer Journey (Primary Flow)

```
Discovery     → ผู้บริหาร/PM แนะนำว่ามี tool ใหม่ให้ลอง
                 (Internal: ทีมเดียวกัน ไม่ต้อง marketing)

Onboarding    → Login → Upload XLIFF/Excel (single or batch) → เลือก language pair
                 → Run QA → ดูผลลัพธ์ครั้งแรก
                 ⏱️ ภายใน 5 นาทีต้องเห็นผลลัพธ์ที่มีค่า
                 📋 Trust calibration: สื่อสารว่า AI เป็น assistant ไม่ใช่ oracle
                    — false positive < 10% เป็นเป้า, feedback ของคุณช่วยให้ AI แม่นขึ้น

First Value   → Rule-based results แสดงทันที
                 "อ๋อ มันตรวจ tag, placeholder, missing text ได้เหมือน Xbench เลย"
                 ⚠️ Critical: rule-based ต้อง >= Xbench (parity test)
                    ถ้าพื้นฐานพลาด → user ไม่เชื่อทั้ง pipeline

Aha! Moment   → AI results มาเพิ่ม — ตรวจ meaning, tone, suggestion
                 "โอ้โห มันบอกว่า segment #47 แปลผิดความหมาย
                  พร้อมเสนอคำแปลที่ถูกต้อง — Xbench ไม่เคยทำได้!"

Daily Usage   → Batch upload 10-15 ไฟล์ → Run QA ทั้ง batch
                 → Batch summary: "7 auto-pass, 3 need review"
                 → Progressive disclosure: Summary → File → Segment
                 → Accept/reject/flag AI suggestions → Export report
                 → Bulk accept/reject สำหรับลด false positive fatigue
                 → ไฟล์ที่ score > 95 + 0 Critical = auto-pass ✅

Trust Build   → Spot-check auto-pass files 2-3 อาทิตย์แรก
                 → เห็นว่า AI ตรวจแม่นจริง → เชื่อมั่นมากขึ้น
                 → ลดการ spot-check → ไว้ใจ auto-pass
                 💡 Feedback visibility: "คุณ reject 15 จุด → AI เรียนรู้แล้ว"

Scale Up      → ทีมรับงาน volume มากขึ้นด้วย headcount เดิม
                 → PM/Coordinator เริ่มใช้เองสำหรับไฟล์ง่ายๆ
                 → QA reviewer โฟกัสเฉพาะ flagged files
```

#### Non-native Reviewer Journey (คุณนิด Flow)

```
Upload        → Upload EN→ZH/JA/KO file → Run QA

Rule-based    → ตรวจ rule-based findings ได้เอง (tag, number, placeholder)
                 — เหมือนที่ทำกับ Xbench

AI Findings   → AI flags semantic issues → แต่อ่านภาษา target ไม่ออก
                 → 3 actions: Accept / Reject / "Flag for native review"
                 → Confidence indicator: 🟢 High (>85%) / 🟡 Medium / 🔴 Low (<70%)

Smart Report  → Export report แยก 2 ส่วนชัดเจน:
                 ① "Rule-based findings — verified by reviewer"
                 ② "AI semantic findings — needs native verification"
                 → ส่ง report ให้ native reviewer ดูเฉพาะส่วน ②

Result        → Native reviewer ตรวจแค่ AI-flagged items
                 แทนตรวจทั้งไฟล์ → ลดเวลาจาก 2 วัน → 2 ชั่วโมง

Track         → AI accuracy per language pair: "EN→ZH AI confirmed 9/10 findings"
                 → ถ้า accuracy สูง → ลดการพึ่ง native reviewer ลงเรื่อยๆ
                 → ถ้า accuracy ต่ำ → รู้ว่า language pair ไหนยังต้องพึ่งคน

Phase 2       → Native reviewer เข้า tool ได้ (guest role)
                 → เห็นแค่ assigned files + flagged findings
                 → Accept/reject ใน tool ได้เลย ไม่ต้อง compile report กลับ
```

#### "Democratized QA" User Journey (PM/Coordinator)

```
Trigger       → มีไฟล์แปลเสร็จ ต้องตรวจก่อนส่งลูกค้า
                 แต่ QA reviewer ติดงานหมด

Self-service  → Upload ไฟล์เอง (single or batch) → Run QA
                 → Batch summary: "5 auto-pass, 1 need review"
                 → Score 97, 0 Critical → Auto-pass ✅
                 ⚠️ Content-type warning (ตั้งที่ project level โดย QA lead):
                    ถ้า project tagged เป็น legal/medical/financial
                    → แสดง warning "Auto-passed but recommended for QA review"
                    → Option to route to QA reviewer แม้จะ pass threshold
                 → ส่งลูกค้าได้เลยไม่ต้องรอ QA (general content)

Escalation    → Score 82, 2 Critical issues
                 → ส่ง issue list ให้ QA reviewer ดูเฉพาะ flagged items
                 → QA reviewer ตรวจแค่ 2 issues แทนทั้งไฟล์

Post-delivery → Log client feedback: "Client approved ✅" / "Client raised issue ❌ + reason"
                 → ถ้า complain → "Recall" workflow: mark file as "needs re-review"
                 → Feedback data → tune AI accuracy over time
```

---

### UX Principles (from Focus Group consensus)

| Principle | Detail | Phase |
|-----------|--------|:-----:|
| **Batch-first workflow** | All personas process 10-15 files/day — batch upload + batch summary is the default, single file is the exception | MVP |
| **Progressive disclosure** | Batch summary → File detail → Segment detail; each persona drills down to their needed depth | MVP |
| **Project-level configuration** | Content type, threshold, language pair set once at project setup by QA lead — not per file | MVP |
| **Role-based access** | QA reviewer (full), PM/Coordinator (upload + summary), VP/Director (dashboard), Guest/Native reviewer (assigned files only — Phase 2) | MVP + Phase 2 |
| **Client feedback loop** | Simple "Client approved ✅ / raised issue ❌" logging after delivery — feeds AI accuracy improvement | MVP (simple) |
| **AI accuracy transparency** | Track & display AI confirmation rate per language pair — helps decide when native reviewer is still needed | Phase 2 |

---

### Adoption Risks & Mitigations (from Customer Support Theater + 5 Whys + Focus Group)

| Risk | Impact | Mitigation | Phase |
|------|--------|------------|:-----:|
| **False positive fatigue** — AI flag ผิดเยอะ user เลิกใช้ | #1 adoption killer | Bulk accept/reject actions; monitor false positive rate per language/user; trigger prompt tuning alert if > 10% | MVP |
| **Rule-based < Xbench** — พื้นฐานพลาด = ไม่เชื่อทั้ง pipeline | Trust destruction | **Xbench parity test** as hard requirement before launch; regression testing ทุก release | MVP |
| **Non-native reviewer confusion** — ไม่รู้จะ accept/reject AI findings ที่อ่านไม่ออก | Workflow breakdown | "Flag for native review" action; Smart report mode แยก verified vs needs-verification | MVP |
| **Auto-pass misuse on sensitive content** — PM ส่ง legal content ที่ tone ผิดให้ลูกค้า | Client complaint, trust damage | Content-type aware threshold; auto-pass warning for non-QA users; project content-type tagging | MVP warning / Phase 2 full |
| **Expectation mismatch** — คาดหวังว่า AI ถูก 100% | Disappointment → abandonment | Trust calibration onboarding; communicate false positive target; show feedback loop progress | MVP |
| **"Another check" not "the one check"** — tool ถูกมองเป็นแค่ layer เพิ่ม ไม่ได้ทำลายวงจรตรวจซ้ำ | Low adoption, QA ยังส่ง proofreader เหมือนเดิม | Position as single source of truth; confidence score สูงพอ = ตรวจครั้งเดียวจบ; ชัดเจนว่า "แทน proofreader" ไม่ใช่ "เพิ่ม step" | MVP |
| **QA value invisible** — ผู้บริหารมองเป็น cost center เพราะไม่มี data | Budget cut, headcount reduction | **MVP Dashboard** สำหรับ VP/Director; track metrics ตั้งแต่วันแรก (files, scores, time saved); export reports | MVP |

### Root Cause Map (from 5 Whys Deep Dive)

| Surface Need | Root Cause | Product Positioning |
|-------------|-----------|-------------------|
| "ตรวจเร็วขึ้น" | ไม่มี single source of truth → ตรวจซ้ำหลายรอบ | **"The one check"** — confidence สูงพอ ตรวจครั้งเดียวจบ |
| "AI แทน native reviewer" | Language coverage gap — headcount จำกัด cover ไม่ครบ | **"Language scalability"** — ทีม 6-9 คน cover ทุกภาษาได้ |
| "Auto-pass ส่งงานเร็ว" | ไม่มี risk-based prioritization → ตรวจทุกไฟล์เท่ากัน | **"Risk-based routing"** — paradigm shift ในวงการ localization QA |
| "ผู้บริหารกดดันใช้ AI" | QA value invisible → ถูกมองเป็น cost center | **MVP Dashboard** — เปลี่ยน QA จาก cost center เป็น quality asset ที่วัดผลได้ |

---

## Success Metrics

### North Star Metric

**Time-to-Xbench-replacement** — วันที่ทีมเลิกเปิด Xbench และใช้ qa-localization-tool เป็น tool หลักตัวเดียว ไม่ใช่แค่ "ใช้ tool เราเพิ่ม" แต่ **"เลิกใช้ Xbench เลย"** — นี่คือหลักฐานสูงสุดว่า product ทำงานจริง

---

### User Success Metrics

| Metric | Baseline Target | Stretch Goal | Measurement | Persona |
|--------|:-:|:-:|-------------|---------|
| **Proofreader elimination** | Month 1: < 30% files → proofreader, Month 2: < 10%, Month 3: 0% | 0% by end of Month 2 | Track: files sent to proofreader / total files reviewed | คุณแพร |
| **Review rounds per file** | **≤ 1.2 average** (ยอม edge case บาง file มีรอบ 2) | ≤ 1.05 | Track: จำนวนครั้งที่ file ถูก review ก่อน mark complete — วัด behavior จริง ไม่ใช่ชื่อ process (ป้องกัน gaming โดยแค่เปลี่ยนชื่อ "proofreader" เป็น "second review") | คุณแพร |
| **QA review time reduction** | **-50%** per file | **-80%** per file (achievable when false positive < 5%) | Track: time from file upload → user marks file "complete" (exclude idle > 5 min); use Month 1 data as baseline, measure improvement from Month 2+ | คุณแพร |
| **Native reviewer dependency** | -70% of files needing native reviewer | -90% (AI accuracy per language pair high enough) | Track: "Flag for native review" count / total files per language pair; baseline from pre-launch file count | คุณนิด |
| **PM self-service rate** | >= 40% of files auto-pass without QA involvement | >= 60% | Track: auto-pass files by PM role / total files | คุณเอก |
| **Time to first value** | < 5 minutes from upload to actionable results | < 2 minutes (rule-based instant + AI streaming) | Track: onboarding funnel completion time | ทุกคน |
| **Processing speed** | Rule-based < 10s, Full pipeline < 3 min (per 1000 segments) | Rule-based < 5s, Full < 2 min | Track: processing time per file/batch; alert if > threshold | ทุกคน |
| **User satisfaction pulse** | >= 4.0/5 monthly average | >= 4.5/5 | Monthly 1-question survey: "Tool ช่วยงานคุณได้จริงไหม? 1-5" | ทุกคน |

### Quality Metrics (Core Feature Accuracy)

| Metric | Target | Validation Method | Priority |
|--------|--------|-------------------|:--------:|
| **False positive rate** | **< 5%** per language pair | **User-reported**: rejected AI findings / total AI findings (per language pair); **AI Precision Audit**: สุ่ม sample AI findings → expert ตรวจว่าถูก/ผิดจริง → audited rate แยกจาก user rate (ป้องกัน accept-all gaming); **AI Drift Detection** alert if rate changes > 10% from baseline within 1 week; ถ้า user-reported vs audited ต่างกันมาก → investigate user behavior bias | Critical |
| **False negative rate** | **< 3%** — ห้ามพลาด issue จริง | **Auto-pass Confidence Audit**: สุ่ม 5% ของ auto-pass files ทุกสัปดาห์ → expert QA ตรวจ blind → เทียบผลกับ tool; ไม่ใช่แค่ดูจาก complaints เพราะ "tool ไม่จับ + คนไม่จับ = false 0%" | Critical |
| **Auto-pass accuracy** | **> 99%** — ลูกค้าต้องไว้ใจได้ | **Primary**: Auto-pass Confidence Audit (weekly expert blind review of 5% sample); **Secondary**: client complaints on auto-passed files (passive, underreported — ใช้ confirm ไม่ใช่ primary source) | Critical |
| **Xbench parity** | **100%** — rule-based ต้องจับได้ทุกอย่างที่ Xbench จับได้ | Xbench parity test suite run on every release; any regression = block release | MVP Gate |
| **Rule-based coverage** | >= 80% ของ QA Cosmetic checklist items | Track: implemented rules / total QA Cosmetic rules | MVP Gate |
| **Critical issue detection** | **100%** — ห้ามพลาด Critical issue เด็ดขาด | Track: missed critical issues reported post-delivery; any miss = P0 incident | Critical |
| **False positive trend** | ลดลงทุกเดือน (AI เรียนรู้จาก feedback) | Track: monthly false positive rate per language pair → trend chart; data-driven quality moat indicator | Important |
| **Cost per file (AI)** | Economy < $0.05/file avg, Thorough < $0.30/file avg | Track: API cost per file → aggregate monthly; compare Economy vs Thorough ROI | Important |
| **Error detection by category** | Report breakdown across MQM categories | Classify AI findings by category (tag, terminology, meaning, tone, format) → heatmap showing strengths/weaknesses per language pair → focus prompt tuning | Important |

### Business Objectives

| Timeframe | Objective | Measurable Target |
|:---------:|-----------|------------------|
| **Month 1-3** | Dogfooding — ทีม QA 6-9 คนใช้จริง | >= 80% ของไฟล์ QA ผ่าน tool; proofreader hours → 0 by Month 3; false positive < 5%; Xbench เปิดคู่กันน้อยลงทุกสัปดาห์ |
| **Month 3-6** | Core feature สมบูรณ์ + Xbench replacement | Auto-pass accuracy > 99%; client complaint rate < 1%; **ทีมเลิกใช้ Xbench** (North Star); Dashboard ใช้งานจริง VP เห็น ROI data; Release Quality Gate ผ่านทุก release |
| **Month 6-12** | Scale + prove ROI | Files per person per day **2-3x** baseline; ROI data พร้อมสำหรับ C-level presentation; review rounds per file ≤ 1.2; evaluate readiness สำหรับ external customers |
| **Month 12+** | External customer readiness | Tool "แข็งแกร่งจริง"; product-market fit metrics ready: trial-to-paid conversion, CAC, churn rate, NPS; free trial สำหรับ localization vendors ภายนอก |

### Key Performance Indicators (KPIs)

**Leading Indicators (ทำนายความสำเร็จ):**

| KPI | Target | Why it matters |
|-----|--------|---------------|
| **Adoption funnel completion** | Signup → First upload > 90%, First upload → First complete review > 80%, First review → WAU > 70% | ถ้า drop-off สูงที่ step ไหน = UX problem ที่ต้องแก้ทันที |
| **AI suggestion accept rate** (per language pair) | Monitor — no fixed sweet spot; track per language pair to identify where AI is strong/weak | ต่ำเกินสำหรับ language pair ใด = prompt tuning needed สำหรับ pair นั้น |
| **Time in tool per file** | ลดลง 10% ทุกเดือน | แสดงว่า user คุ้นเคย + AI แม่นขึ้น |
| **Client feedback log rate** | >= 70% ของไฟล์ที่ส่งลูกค้ามี feedback log | Data สำหรับ tune AI; ต้อง integrate popup ถาม "Client OK?" เข้า workflow ให้ง่าย |
| **Xbench replacement milestone** | Track **"% files cross-checked with Xbench"**: Week 1: ~100% → Month 1: < 50% → Month 3: < 5% → Month 6: 0% → license cancelled | Quantitative gradient วัดทุกสัปดาห์ (ไม่ใช่ binary yes/no); ถ้ายังเปิด Xbench คู่ = tool ยัง replace ไม่ได้ |

**Lagging Indicators (ยืนยันความสำเร็จ):**

| KPI | Target | Why it matters |
|-----|--------|---------------|
| **Client complaint rate on auto-pass** | < 1% | ถ้าสูงกว่านี้ = auto-pass criteria ไม่เข้มพอ |
| **Files per person per day** | **2-3x** เทียบกับ baseline (ก่อนใช้ tool) ภายใน 6 เดือน | วัด capacity ต่อคน ไม่ใช่ total volume (ซึ่งขึ้นกับ business growth ควบคุมไม่ได้); ถ้าแค่ 1.5x แสดงว่า auto-pass ไม่ทำงาน; baseline จาก pre-launch file count |
| **VP dashboard action** | VP/Director exported or shared dashboard report >= 1x/month | วัด action ไม่ใช่ pageview — ถ้า export/share = data ถูกใช้ตัดสินใจจริง |
| **AI cost efficiency** | AI cost per file trending down over time (fewer segments hitting Layer 3) | Quality moat: ยิ่งใช้นาน ยิ่งถูกลง เพราะ AI screen ออกได้เร็วขึ้น |

### Quality Gates (Release Blocking)

Every release must pass ALL gates before deployment:

| Gate | Criteria | Action if Fail |
|------|----------|----------------|
| **Xbench parity test** | 100% pass — ต้องจับได้ทุกอย่างที่ Xbench จับได้ | Block release |
| **Regression test suite** | 100% pass — ไม่มี rule ที่เคย work แล้วพัง | Block release |
| **False positive stability** | Rate ไม่เพิ่มจาก previous release | Block release + investigate |
| **No new critical bugs** | 0 critical bugs introduced | Block release |
| **AI Drift Detection** | Accept rate ไม่เปลี่ยน > 10% จาก baseline | Alert + investigate before release |

### Auto-pass Confidence Audit (Weekly)

| Step | Detail |
|------|--------|
| **Sample** | สุ่ม 5% ของ auto-pass files จากสัปดาห์ที่ผ่านมา |
| **Blind review** | Expert QA reviewer ตรวจไฟล์โดยไม่เห็นผลลัพธ์ของ tool |
| **Compare** | เทียบ expert findings vs tool findings |
| **Update metrics** | คำนวณ actual false negative rate + auto-pass accuracy |
| **Action** | ถ้า accuracy < 99% → investigate + tighten auto-pass criteria |

### Baseline Establishment Plan (Pre-launch)

Before launch, establish baselines to enable meaningful before/after comparison:

| Metric | Baseline Method | Timeline |
|--------|----------------|:--------:|
| **QA review time per file** | Manual time-log by QA team for 2 weeks (or use Month 1 "time in tool" as baseline) | 2 weeks pre-launch |
| **Native reviewer dependency** | Count files sent to native reviewer in 1 month before launch | 1 month pre-launch |
| **Proofreader hours** | HR/timesheet data for proofreading activity over past 3 months | Data pull |
| **Xbench usage frequency** | Quick survey: "How many times/day do you open Xbench?" | 1-day survey |
| **Files per person per day** | Count from current workflow logs/email → establishes baseline for 2-3x capacity target per person | Data pull |
| **Review rounds per file** | Count average rounds per file in current workflow (likely 2-3 with proofreader loop) | Data pull |

---

### Metrics-to-Strategy Alignment

```
User Success                         Business Success
─────────────                        ────────────────
Proofreader eliminated         ───→  Headcount cost savings (ROI proof)
QA review time -50% to -80%   ───→  Files/person/day 2-3x
Auto-pass > 99% accurate       ───→  Client trust → external customers
False positive < 5% (audited)  ───→  Tool adoption → quality moat
Review rounds ≤ 1.2            ───→  Proofreader loop truly eliminated
Xbench replacement             ───→  Full product-market validation
Dashboard + VP action          ───→  ROI visible → budget justified
Language scalability            ───→  Cover more languages = more revenue
Client feedback loop           ───→  AI accuracy moat deepens over time
Cost per file tracking         ───→  Prove AI cheaper than human review
Error detection by category    ───→  Targeted prompt tuning → accuracy ↑
Processing speed               ───→  User satisfaction → daily workflow fit
```

### Future Metrics Layer (External Customer Phase — Month 12+)

| Metric | Description |
|--------|-------------|
| **Trial-to-paid conversion** | % of free trial users who become paying customers |
| **Customer acquisition cost (CAC)** | Cost to acquire one paying customer |
| **Monthly churn rate** | % of customers who cancel per month |
| **Net Promoter Score (NPS)** | Customer satisfaction and recommendation likelihood |
| **Revenue per customer** | Average monthly revenue per paying account |

---

## MVP Scope

### Core Features (MVP)

#### 1. QA Pipeline — 3-Layer AI Engine

| Layer | What it does | Tech | Cost |
|:-----:|-------------|------|:----:|
| **Layer 1** | Rule-based checks — top 80% QA Cosmetic standards, **Xbench parity** | Custom engine | Free |
| **Layer 2** | AI Quick Screening — flag ~20% of segments needing deep analysis | GPT-4o-mini / Claude Haiku | ~$0.40/100K words |
| **Layer 3** | Deep AI Analysis — semantic accuracy, tone, cultural, fix suggestions | Claude Sonnet | ~$2.00/100K words (flagged only) |

**Processing Modes:**
- **Economy** (Layer 1 + 2): ~$0.40/100K words — high-volume screening
- **Thorough** (All layers): ~$2.40/100K words — production-quality QA

**Rule-based Engine (Layer 1) — MVP Checks:**

| Check | Source | Severity |
|-------|--------|:--------:|
| Tag integrity validation (source vs target) | QA Cosmetic | Critical |
| Missing text / untranslated detection | QA Cosmetic | Critical |
| Numeric consistency | QA Cosmetic | Critical |
| Placeholder matching | QA Cosmetic | Critical |
| Glossary import + term matching | QA Cosmetic | Major |
| Punctuation validation | QA Cosmetic | Major |
| Symbol and numbering checks | QA Cosmetic | Major |
| Capitalization checks | QA Cosmetic | Minor |
| Unnecessary spacing | QA Cosmetic | Minor |
| Text format validation (bold, italic tags) | QA Cosmetic | Minor |

**AI Analysis (Layer 2 + 3) — MVP Capabilities:**
- Semantic accuracy (mistranslation, omission, hallucination)
- Tone/register consistency
- Style guide compliance
- Instructions-following verification
- Cultural appropriateness
- Fluency and naturalness
- Terminology consistency (semantic, beyond glossary)
- Context-aware analysis (XLIFF notes/comments/context metadata)
- AI-generated fix suggestions with confidence scores (< 70% = warning)

**MQM-compatible error taxonomy** with severity: Critical / Major / Minor

**Model-agnostic design:** Vercel AI SDK abstraction — swap LLM providers without code changes

---

#### 2. File Support

| Format | Parsing | Coverage |
|--------|---------|:--------:|
| **XLIFF 1.2 / 2.0** | `xliff` npm package | ~80% of real-world usage |
| **Excel bilingual** (source/target columns) | Simple column mapping | ~20% of real-world usage |

---

#### 3. QA Review Experience

**Issue Review:**
- Issue list with MQM severity classification (Critical → Major → Minor)
- **Issue → segment direct navigation** — click any issue to jump to source/target segment
- Filter by severity — Critical and Major surfaced first (progressive disclosure)
- Executive summary view — "3 critical, 5 major need review" at a glance

**AI Suggestions:**
- Inline suggestions with **confidence score visual indicators**: 🟢 High (>85%) / 🟡 Medium (70-85%) / 🔴 Low (<70%)
- **3 actions per finding**: Accept / Reject / **Flag for native review**
- **Bulk accept/reject** — select multiple findings, apply action at once
- All accept/reject/flag decisions logged → feedback loop for AI improvement

**Batch Workflow:**
- **Batch upload** (multiple files at once)
- **Batch summary view**: "7 auto-pass, 3 need review" at a glance
- **Progressive disclosure**: Batch summary → File detail → Segment detail

**Report Export:**
- Export QA report as PDF/Excel
- **Smart report mode**: Rule-based findings (verified) vs AI findings (needs verification) — separated clearly for non-native reviewers

---

#### 4. Auto-pass System

| Setting | Default | Configurable |
|---------|---------|:------------:|
| Score threshold | > 95 | Per project |
| Critical issues | 0 required | Fixed — any Critical = never auto-pass |
| Content-type warning | On for legal/medical/financial | Per project |

- **Audit trail**: Every auto-pass decision logged with full issue analysis for spot-checking
- **Content-type warning** (simple): If project tagged as sensitive content → display "Auto-passed but recommended for QA review" with option to route to QA reviewer
- **Score calculation**: Weighted by severity — Critical issues heavily penalize score

---

#### 5. Project Management

**Project Setup:**
- Create project with: name, language pair(s), content type, auto-pass threshold
- **QA lead sets QA-specific settings** (threshold, content type); PM can create projects
- Glossary import per project (standard formats: TBX, CSV, Excel)

**Role-based Access (MVP):**

| Role | Capabilities |
|------|-------------|
| **QA Reviewer** | Full access: upload, run QA, review findings, accept/reject/flag, export reports, configure project settings |
| **PM / Coordinator** | Upload, run QA, view batch summary, view auto-pass results, export reports, log client feedback |
| **VP / Director** | Dashboard view only, export dashboard reports |

---

#### 6. Dashboard (VP/Director)

| Component | Detail |
|-----------|--------|
| **Summary cards** | Total files processed, average score, auto-pass rate, estimated hours saved |
| **Quality trend chart** | Score trend over time (weekly/monthly) |
| **Recent activity feed** | Latest files processed with status and score |
| **Export** | PDF and Excel export for C-level reporting |

---

#### 7. Client Feedback Loop (Simple)

- After file delivery: **"Client approved ✅"** / **"Client raised issue ❌ + reason"** button
- Simple log stored per file — no complex workflow
- Data feeds into AI accuracy tracking over time

---

#### 8. Infrastructure

| Component | Tech | Purpose |
|-----------|------|---------|
| **Frontend** | Next.js 16 + shadcn/ui + Tailwind CSS | Modern web app |
| **Auth** | Supabase Auth | Login, roles, permissions |
| **Database** | Supabase (PostgreSQL) | Files, results, users, projects |
| **File Storage** | Supabase Storage | XLIFF, Excel uploads |
| **Queue/Jobs** | Inngest | AI pipeline processing, batch jobs |
| **AI SDK** | Vercel AI SDK | Model-agnostic LLM abstraction |
| **API** | Next.js API routes (internal) | Internal API consumed by web app; public API docs in Phase 2 |
| **Deployment** | Vercel | Hosting, serverless functions |

**Estimated infrastructure cost:** ~$30-95/month for MVP

---

#### 9. Development Strategy — Parallel Sprint Plan

**Estimation:** ~22-27 sprints (2 weeks each) total effort. With parallel development, target **launch in ~4-5 months (2-3 devs)**.

**Parallel Work Streams:**

```
Stream A (Backend/Engine)          Stream B (Frontend/UX)           Stream C (Infrastructure)
─────────────────────────          ─────────────────────────        ─────────────────────────
Sprint 1-2:                        Sprint 1-2:                      Sprint 1:
 Infrastructure setup               UI scaffolding                   Supabase setup (auth, DB,
 DB schema design                   Component library (shadcn)        storage, roles)
 API route structure                 File upload UX                   Vercel deployment
                                                                      CI/CD pipeline
Sprint 3-5:                        Sprint 3-5:
 Rule-based engine (12 checks)      Project creation UX             Sprint 2:
 XLIFF 1.2 + 2.0 parser             QA review interface              Inngest queue setup
 Excel bilingual parser              Issue list + segment nav         File processing pipeline
 Glossary import (TBX/CSV/Excel)     Confidence score indicators

Sprint 6-7:                        Sprint 6-8:
 AI Layer 2 (screening)              Batch upload + summary UX
 AI Layer 3 (deep analysis)          Bulk accept/reject
 Vercel AI SDK integration           Smart report export
 Economy/Thorough mode               Accept/Reject/Flag UX
 Auto-pass scoring engine            Progressive disclosure

Sprint 8-9:                        Sprint 9-10:
 Auto-pass audit trail               Dashboard (VP)
 Content-type warning logic           Summary cards + trend chart
 Client feedback API                  Activity feed + export
 Xbench parity test suite             Client feedback UX (✅/❌)

Sprint 10-12:                      Sprint 10-12:
 Integration testing                  E2E testing
 Performance optimization             UX polish + responsive
 AI prompt tuning                     Onboarding flow
 Bug fixing                           Bug fixing
```

**Critical Path (sequential dependencies):**
```
DB schema → API routes → Rule-based engine → AI pipeline → Auto-pass scoring
                                                              ↓
Supabase auth → Role-based access ──────────────────────→ Full integration
                                                              ↓
UI scaffolding → Review UX → Batch UX → Dashboard ──────→ E2E testing
```

**Sprint Milestones:**

| Sprint | Milestone | Demo-able |
|:------:|-----------|:---------:|
| 2 | Infrastructure complete — auth, DB, deploy, file upload works | ✅ |
| 5 | **Rule-based engine running** — upload XLIFF → see rule-based results | ✅ Internal demo |
| 7 | **AI pipeline working** — Layer 2 + 3 producing findings with suggestions | ✅ First real QA |
| 9 | **Auto-pass + Dashboard** — score-based routing, VP can see data | ✅ |
| 10 | **Xbench parity test passes** — rule-based >= Xbench | ✅ Launch gate |
| 12 | **Full MVP launch ready** — batch, bulk, smart report, polish complete | 🚀 Launch |

**Xbench Parity Test** (dedicated ~1 sprint):
- Build test suite from real Xbench output files
- Run same files through our rule-based engine
- Compare results — must catch everything Xbench catches
- Fix gaps until 100% parity
- Automate as regression test for every future release

**Technical Notes from Party Mode Review:**
- **XLIFF 2.0**: Different namespace + segment model vs 1.2 — handle both in parser with adapter pattern
- **Glossary multi-format**: TBX requires XML parsing, CSV is trivial, Excel via existing parser — TBX is the most complex

---

### Out of Scope for MVP

#### Explicitly NOT in MVP (Phase 2 — Month 3-6):

| Feature | Reason for deferral |
|---------|-------------------|
| Guest role for native reviewer | Requires permission system complexity; MVP uses Smart Report export instead |
| AI accuracy tracking per language pair dashboard | Needs sufficient data volume first; MVP logs data silently |
| Content-type aware auto-threshold (auto-adjust) | MVP has simple warning; full auto-adjust after enough data collected |
| Feedback loop visibility ("AI learned from your rejections") | Backend logging in MVP; UX display in Phase 2 |
| File recall workflow | Simple re-upload covers this in MVP |
| Cross-file pattern analysis | Needs historical data; meaningless at launch |
| Advanced ROI analytics | MVP dashboard covers basics; Phase 2 adds cost savings calculator, per-vendor comparison |
| Bilingual Word format | Lower priority (~5% usage); XLIFF + Excel covers 95%+ |
| CSV bilingual format | Trivial to add but not needed at launch |
| Full client feedback workflow | MVP has simple ✅/❌ log; Phase 2 adds structured flow |

#### NOT in MVP (Phase 3+ / Future):

| Feature | Reason |
|---------|--------|
| JSON i18n, PO/POT, Android XML, iOS .strings | Developer-focused formats; not in target user workflow |
| PDF source vs target visual QA | Fundamentally different tech (visual rendering); separate product area |
| Multi-vendor quality comparison | Needs multi-tenant + sufficient vendor data |
| CI/CD pipeline integration | Requires public API; Phase 2 API-first enables this |
| CAT tool plugins | Requires plugin SDK per CAT tool; post-API |
| CLI tool | Power user feature; post-API |
| External customer features | Multi-tenant, billing, trial, onboarding — after internal validation |
| Public API documentation | Internal API first; public docs when ready for external integrations |

---

### MVP Success Criteria

**Launch Gate (before internal rollout):**

| Gate | Criteria |
|------|----------|
| Xbench parity test | 100% — rule-based catches everything Xbench catches |
| Rule-based coverage | >= 80% of QA Cosmetic checklist |
| False positive rate | < 5% on test dataset |
| Processing speed | Rule-based < 10s, Full pipeline < 3 min per 1000 segments |
| Core workflow complete | Upload → Run → Review → Accept/Reject → Export works end-to-end |
| Batch workflow | Batch upload + batch summary functional |
| Auto-pass | Score-based auto-pass with audit trail working |
| Dashboard | VP can see summary cards + trend + export |

**MVP Validation (Month 1-3 post-launch):**

| Signal | Target | Decision |
|--------|--------|----------|
| Team adoption | >= 80% of QA files through tool | If < 50%: investigate UX/trust issues |
| Proofreader loop | Trending toward 0 by Month 3 | If still > 30% at Month 2: auto-pass or AI accuracy issue |
| Review rounds per file | ≤ 1.5 by Month 2, ≤ 1.2 by Month 3 | If > 2.0: tool not replacing proofreader loop |
| Xbench cross-check | < 50% files by Month 1 | If still 100%: rule-based trust issue |
| False positive (audited) | < 5% | If > 10%: pause AI features, focus on prompt tuning |
| User satisfaction | >= 4.0/5 monthly | If < 3.0: urgent UX/quality issues |
| Auto-pass accuracy (audited) | > 99% | If < 95%: tighten threshold, investigate |

**Go / No-go for Phase 2:**
- All MVP validation targets met by Month 3
- Team actively requesting Phase 2 features (native reviewer access, advanced analytics)
- False positive trend decreasing month-over-month
- VP using dashboard for reporting

---

### Future Vision

**Phase 2 (Month 3-6): Maturity + Collaboration**
- Native reviewer guest access → full collaborative QA workflow
- AI accuracy dashboard per language pair → data-driven language coverage decisions
- Advanced analytics → per-vendor, per-language-pair quality comparison
- Additional formats (Word, CSV) → broader file coverage

**Phase 3 (Month 6-12): Platform + Scale**
- Public API + documentation → enable CI/CD, plugins, CLI
- Developer file formats (JSON, PO, mobile) → new market segment
- External customer readiness → multi-tenant, billing, trial

**Long-term Vision (12+ months):**
- **Industry standard for AI-powered localization QA** — the tool that replaces Xbench across the industry
- PDF visual QA → completely new product capability
- Data-driven quality moat → every file processed makes AI more accurate per language pair and domain
- Marketplace for custom QA rule sets per industry (legal, medical, gaming, etc.)
- AI model fine-tuning per customer → personalized accuracy

```
MVP                    Phase 2                Phase 3               Long-term
───                    ───────                ───────               ─────────
Core QA pipeline  ───→ Collaboration     ───→ Platform         ───→ Industry standard
XLIFF + Excel     ───→ + Word, CSV       ───→ + Dev formats    ───→ + Visual QA
Internal team     ───→ + Native reviewer ───→ + External API   ───→ + Marketplace
Simple dashboard  ───→ + Advanced analytics → + Multi-tenant   ───→ + Fine-tuned AI
Simple feedback   ───→ + Full feedback UX ──→ + CI/CD plugins  ───→ + Custom rules
```
