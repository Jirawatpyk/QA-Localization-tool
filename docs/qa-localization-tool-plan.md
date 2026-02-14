# QA Localization Tool - Product Plan

> AI-Powered Localization QA ตัวแรกที่เข้าใจความหมาย ไม่ใช่แค่ตรวจ syntax

---

## Executive Summary

เครื่องมือ QA สำหรับงาน Localization ที่ใช้ AI (LLM) ร่วมกับ Rule-based checking เพื่อตรวจสอบคุณภาพการแปลแบบครบวงจร สามารถแทนที่ manual QA ได้ 90%+ โดยเน้น semantic understanding ไม่ใช่แค่ pattern matching

---

## Problem Statement

### ปัญหาปัจจุบัน
- เครื่องมือ QA ในตลาดใช้แค่ Rule-based (regex, pattern matching)
- ตรวจได้แค่ syntax (placeholder, tags, numbers) แต่ไม่เข้าใจความหมาย
- ต้องใช้คน review เยอะ = ช้า + แพง + human error
- Tool ส่วนใหญ่เป็น Desktop app หรือผูกกับ TMS

### เป้าหมาย
- แทนที่ manual QA ให้ได้มากที่สุด (90%+)
- ใช้ AI ตรวจสอบความหมาย ไม่ใช่แค่ syntax
- Standalone web app ที่ใช้ง่าย ไม่ต้อง lock-in กับ TMS ใดๆ

---

## Market Analysis

### เครื่องมือในตลาดปัจจุบัน

| เครื่องมือ | ประเภท | จุดเด่น | จุดอ่อน | ราคา |
|-----------|--------|--------|--------|------|
| **Xbench** | Desktop | Rule-based แข็งแกร่ง | ไม่มี AI, UI เก่า | ~$99/year |
| **Verifika** | Desktop | QA check ครบ | Desktop only, ไม่มี AI | ~$150/year |
| **QA Distiller** | Desktop | Placeholder check ดี | เก่ามาก, ไม่มี cloud | Legacy |
| **Lokalise QA** | Cloud/TMS | อยู่ใน TMS | ต้องใช้ Lokalise ทั้งระบบ | แพง |
| **Phrase QA** | Cloud/TMS | อยู่ใน TMS | ต้องใช้ Phrase ทั้งระบบ | แพง |
| **memoQ QA** | Desktop | ครบวงจร | ซับซ้อน, แพง, ไม่มี AI | $$$$ |

### Market Gap ที่เราจะเติมเต็ม
- ❌ ไม่มีใครใช้ AI จริงจังสำหรับ context-aware QA
- ❌ ส่วนใหญ่เป็น Desktop app หรือผูกกับ TMS
- ❌ ไม่มี standalone web app ที่ใช้ง่าย
- ❌ UX/UI ล้าสมัยมาก
- ❌ ไม่มี AI fix suggestions

---

## Competitive Analysis: เรา vs Xbench

### Xbench ทำอะไรได้

| ฟีเจอร์ | วิธีทำงาน |
|--------|----------|
| Placeholder check | Regex: `\{[0-9]+\}` ตรงกันไหม |
| Tag check | XML tags ครบไหม |
| Number check | ตัวเลขตรงกันไหม |
| Consistency check | คำเดียวกันแปลเหมือนกันไหม |
| Terminology | เทียบกับ glossary |
| Length check | Target ยาวกว่า source กี่ % |
| Spell check | Dictionary-based |

### สิ่งที่ Xbench ทำไม่ได้ (โอกาสของเรา)

| Xbench ทำไม่ได้ | ตัวอย่าง |
|----------------|---------|
| เข้าใจความหมาย | "I'm fine" → "ฉันปรับ" (ผิดความหมาย แต่ Xbench ผ่าน) |
| ตรวจ tone/register | Formal vs Casual ปนกัน ไม่รู้ |
| Cultural awareness | คำหยาบในภาษาปลายทาง ตรวจไม่ได้ |
| Context understanding | "Bank" = ธนาคาร หรือ ริมฝั่ง? |
| AI suggestions | บอกแค่ผิด ไม่บอกวิธีแก้ |
| Quality scoring | Pass/Fail เท่านั้น ไม่มี score |

### Feature Comparison

| Check Type | Xbench | เรา (AI-Powered) |
|------------|--------|------------------|
| Placeholder | ✅ Regex | ✅ Regex + AI verify |
| Missing tags | ✅ Pattern | ✅ Pattern + AI |
| Numbers | ✅ Match | ✅ Match + Context |
| Consistency | ✅ Exact match | ✅ Semantic similarity |
| Terminology | ✅ Glossary | ✅ Glossary + AI |
| **MEANING accuracy** | ❌ ไม่ได้ | ✅ LLM check |
| **Tone consistency** | ❌ ไม่ได้ | ✅ AI detect |
| **Cultural issues** | ❌ ไม่ได้ | ✅ AI flag |
| **Fix suggestions** | ❌ ไม่มี | ✅ AI suggest |
| **Quality score** | ❌ ไม่มี | ✅ 0-100 + breakdown |
| **Over-translation** | ❌ ไม่ได้ | ✅ AI detect |
| **Under-translation** | ❌ ไม่ได้ | ✅ AI detect |
| **Fluency check** | ❌ ไม่ได้ | ✅ AI evaluate |

### Real-World Example

```
Source: "Please don't hesitate to contact us"
Target: "ติดต่อเรา"

❌ Xbench: PASS (ไม่มี placeholder, tags ครบ, ตัวเลขไม่มี)
✅ เรา: FAIL
   - Issue: Under-translation
   - Detail: สูญเสียความสุภาพและ tone เชิญชวน
   - Suggestion: "อย่าลังเลที่จะติดต่อเรา"
   - Confidence: 92%
```

---

## Our Approach

### Core Philosophy: Hybrid AI + Rules

```
┌─────────────────────────────────────────────────┐
│            Our Approach                         │
├─────────────────────────────────────────────────┤
│  Traditional          │  Our Approach           │
│  ─────────────────────┼───────────────────────  │
│  Regex + Rules        │  LLM + Rules (Hybrid)   │
│  Pattern matching     │  Semantic understanding │
│  Binary: Pass/Fail    │  Score + Confidence     │
│  No suggestions       │  AI fix suggestions     │
│  Language-agnostic    │  Language-specific AI   │
└─────────────────────────────────────────────────┘
```

### Tiered Automation Strategy

| Tier | Automation | ใช้ทำอะไร | ตัวอย่าง |
|------|------------|----------|---------|
| **Tier 1** | 100% Auto | Rule-based checks | Placeholder, format, length, encoding |
| **Tier 2** | AI + Score | AI with confidence | Grammar, terminology, tone |
| **Tier 3** | AI + Human | AI flag for review | Cultural, legal, brand-sensitive |

### AI-Only Checks (Unique Value)

| Check | ตัวอย่าง | Severity |
|-------|---------|----------|
| **Hallucination** | AI แปลเพิ่มข้อมูลที่ไม่มีใน source | 🔴 Critical |
| **Omission** | ข้ามประโยคหรือ clause สำคัญ | 🔴 Critical |
| **Mistranslation** | แปลผิดความหมายโดยสิ้นเชิง | 🔴 Critical |
| **Wrong register** | ใช้คำหยาบใน formal content | 🟠 High |
| **Inconsistent voice** | สลับ คุณ/เธอ/ท่าน ในไฟล์เดียว | 🟠 High |
| **Unnatural phrasing** | ถูก grammar แต่คนไม่พูดแบบนี้ | 🟡 Medium |
| **Locale mismatch** | ใช้ศัพท์ไต้หวันใน content จีนแผ่นดินใหญ่ | 🟡 Medium |

---

## Product Specification

### Target Users
- Localization teams ที่เบื่อ tool เก่าๆ
- บริษัทที่ไม่อยาก lock-in กับ TMS
- Freelance translators ที่อยากมี QA tool ดีๆ
- QA teams ที่ต้องการ automate งาน review

### Supported File Format
- **Primary:** XLIFF (.xlf, .xliff)
- **Future:** JSON, PO, Android XML, iOS Strings, YAML

### Supported Languages (MVP - Phase 1)

| Priority | ภาษา | เหตุผล |
|----------|------|--------|
| 1 | 🇬🇧 English | ภาษาต้นทางส่วนใหญ่ |
| 2 | 🇨🇳 Chinese (Simplified) | ตลาดใหญ่ + ความซับซ้อนสูง |
| 3 | 🇯🇵 Japanese | UI length issues |
| 4 | 🇰🇷 Korean | คล้าย Japanese |
| 5 | 🇹🇭 Thai | ไม่มี space + tone marks |

### Platform
- **Type:** Web Application
- **Auth:** Google OAuth (Team-based)
- **Access:** Multi-user with team collaboration

---

## MVP Features

### Must Have (Phase 1)

| Feature | Description |
|---------|-------------|
| **File Upload** | Upload XLIFF files |
| **Language Detection** | Auto-detect source/target languages |
| **Rule-based Checks** | Placeholder, tags, numbers, length |
| **AI Semantic Check** | Meaning accuracy, omission, hallucination |
| **AI Tone Check** | Formal/informal consistency |
| **Quality Score** | 0-100 per file with breakdown |
| **Issue List** | Severity-based issue listing |
| **AI Suggestions** | Fix recommendations for each issue |
| **Export Report** | Download results as CSV/PDF |
| **Google OAuth** | Team login with Google |

### Nice to Have (Phase 2)

| Feature | Description |
|---------|-------------|
| Batch Processing | Multiple files at once |
| Glossary Management | Custom terminology lists |
| Custom Rules | User-defined validation rules |
| Comparison View | Side-by-side source/target |
| History | Previous QA runs |
| Team Dashboard | Team-wide statistics |

### Future (Phase 3)

| Feature | Description |
|---------|-------------|
| CI/CD Integration | API for automation pipelines |
| Translation Memory | Store and compare translations |
| More File Formats | JSON, PO, Android XML, iOS Strings |
| More Languages | Expand to 20+ languages |
| Analytics Dashboard | Trends and quality metrics |
| Webhook Notifications | Alert on QA completion |

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────┐
│              QA Localization Tool                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐       │
│  │  Upload  │ →  │  Parse   │ →  │  Queue   │       │
│  │  (XLIFF) │    │  Engine  │    │  System  │       │
│  └──────────┘    └──────────┘    └──────────┘       │
│                                        │            │
│                        ┌───────────────┴──────┐     │
│                        ▼                      ▼     │
│                  ┌──────────┐          ┌──────────┐ │
│                  │  Rule    │          │   AI     │ │
│                  │  Engine  │          │  Engine  │ │
│                  │ (Fast)   │          │ (Smart)  │ │
│                  └────┬─────┘          └────┬─────┘ │
│                       │                     │       │
│                       └──────────┬──────────┘       │
│                                  ▼                  │
│                          ┌──────────┐               │
│                          │  Score   │               │
│                          │ Aggregator│              │
│                          └────┬─────┘               │
│                               ▼                     │
│                        ┌──────────┐                 │
│                        │ Dashboard │                │
│                        │ + Report  │                │
│                        └──────────┘                 │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Reason |
|-------|------------|--------|
| **Frontend** | Next.js 14 + Tailwind CSS | Modern, fast, SSR |
| **UI Components** | shadcn/ui | Consistent, accessible |
| **Backend** | Node.js + Express (or Next.js API Routes) | JavaScript ecosystem |
| **AI Engine** | Claude API (Anthropic) | Best multilingual understanding |
| **Database** | PostgreSQL | Translation memory, history |
| **Cache** | Redis | Queue management, caching |
| **Auth** | NextAuth.js + Google OAuth | Easy team auth |
| **File Storage** | S3 / Google Cloud Storage | XLIFF file storage |
| **Hosting** | Vercel / Railway | Easy deployment |

### AI Integration Design

```
┌─────────────────────────────────────────────┐
│            AI Check Pipeline                 │
├─────────────────────────────────────────────┤
│                                              │
│  1. Extract translation units from XLIFF     │
│                    ▼                         │
│  2. Batch units (10-20 per API call)        │
│                    ▼                         │
│  3. Send to Claude API with prompt:          │
│     - Source text                            │
│     - Target text                            │
│     - Language pair                          │
│     - Context (if available)                 │
│                    ▼                         │
│  4. AI returns:                              │
│     - Issues found (type, severity)          │
│     - Confidence score (0-100%)              │
│     - Suggested fix                          │
│     - Explanation                            │
│                    ▼                         │
│  5. Aggregate scores + generate report       │
│                                              │
└─────────────────────────────────────────────┘
```

### Database Schema (Core Tables)

```sql
-- Users (via NextAuth)
users (id, email, name, image, created_at)

-- Teams
teams (id, name, created_at)
team_members (team_id, user_id, role)

-- Projects
projects (id, team_id, name, created_at)

-- QA Runs
qa_runs (id, project_id, user_id, file_name,
         source_lang, target_lang, total_units,
         quality_score, status, created_at)

-- Issues
issues (id, qa_run_id, unit_id,
        source_text, target_text,
        issue_type, severity, confidence,
        suggestion, explanation, created_at)

-- Glossary
glossary_terms (id, team_id, source_term,
                target_term, language, notes)
```

---

## Quality Score System

### Score Breakdown

```
┌─────────────────────────────────────────────┐
│         Quality Score: 78/100               │
├─────────────────────────────────────────────┤
│                                              │
│  Accuracy      ████████░░  80%              │
│  Fluency       ███████░░░  70%              │
│  Terminology   █████████░  90%              │
│  Consistency   ███████░░░  72%              │
│  Formatting    ██████████  100%             │
│                                              │
├─────────────────────────────────────────────┤
│  Issues Found:                               │
│  🔴 Critical: 2                              │
│  🟠 High: 5                                  │
│  🟡 Medium: 12                               │
│  🟢 Low: 8                                   │
└─────────────────────────────────────────────┘
```

### Issue Severity Levels

| Level | Color | Auto-fail | Examples |
|-------|-------|-----------|----------|
| **Critical** | 🔴 | Yes | Mistranslation, missing content, placeholder broken |
| **High** | 🟠 | No | Wrong tone, cultural issue, inconsistent terminology |
| **Medium** | 🟡 | No | Unnatural phrasing, minor omission |
| **Low** | 🟢 | No | Style preference, minor inconsistency |

---

## User Flow (MVP)

```
┌─────────────────────────────────────────────────────┐
│                    User Flow                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. Login (Google OAuth)                             │
│              ▼                                       │
│  2. Create/Select Project                            │
│              ▼                                       │
│  3. Upload XLIFF file                                │
│              ▼                                       │
│  4. Confirm language pair (auto-detected)            │
│              ▼                                       │
│  5. Run QA (progress indicator)                      │
│              ▼                                       │
│  6. View Results:                                    │
│     - Overall score                                  │
│     - Issue list (filterable by severity)            │
│     - Click issue → see details + suggestion         │
│              ▼                                       │
│  7. Export Report (CSV/PDF)                          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Value Proposition

### One-liner
> "Xbench บอกว่า 'ผ่าน' - เราบอกว่า 'แปลผิดความหมาย พร้อมวิธีแก้'"

### Key Differentiators

| หมวด | Xbench | เรา | ชนะด้วย |
|------|--------|-----|--------|
| **Accuracy** | Syntax only | Syntax + Meaning | 🧠 AI understands |
| **Speed** | Fast | Fast (hybrid) | ⚡ Rules first, AI second |
| **UX** | Desktop 2010 | Modern Web | 🎨 No install, anywhere |
| **Collab** | Single user | Team + OAuth | 👥 Built for teams |
| **Output** | Error list | Score + Suggestions | 💡 Actionable insights |
| **Setup** | Config rules | Zero config | 🚀 Works out of box |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AI hallucination in suggestions | Medium | High | Show confidence %, human review for low confidence |
| API cost too high | Medium | Medium | Batch processing, caching, tiered pricing |
| False positives annoy users | High | Medium | Adjustable sensitivity, learn from feedback |
| Competitors copy features | High | Medium | Focus on UX + speed to market |
| XLIFF parsing edge cases | Medium | Low | Comprehensive test suite, user feedback loop |

---

## Success Metrics

### MVP Success Criteria
- [ ] Upload and parse XLIFF successfully (99%+ files)
- [ ] AI checks complete in < 30 seconds for 1000 units
- [ ] Quality score correlates with human judgment (>80% agreement)
- [ ] Users prefer our suggestions over no suggestions (>70% helpful rate)
- [ ] Zero critical bugs in production

### Business Metrics (Post-Launch)
- User signups
- Files processed per day
- Retention rate (weekly active)
- NPS score
- Conversion to paid (if applicable)

---

## Next Steps

1. **Setup Project** - Initialize Next.js project with tech stack
2. **XLIFF Parser** - Build robust XLIFF parsing module
3. **Rule Engine** - Implement basic rule-based checks
4. **AI Integration** - Connect Claude API for semantic checks
5. **UI/UX** - Build upload flow and results dashboard
6. **Auth** - Implement Google OAuth with NextAuth.js
7. **Testing** - Comprehensive test suite
8. **Deploy** - Launch MVP on Vercel/Railway

---

## Appendix

### Sample AI Prompt (for QA Check)

```
You are a professional localization QA expert. Analyze the following translation unit:

Source Language: English
Target Language: Thai
Source Text: "{source}"
Target Text: "{target}"

Check for:
1. Accuracy - Does the translation convey the same meaning?
2. Completeness - Is anything missing or added?
3. Terminology - Are terms translated correctly?
4. Tone - Is the register (formal/informal) appropriate?
5. Fluency - Does it sound natural in the target language?
6. Cultural - Are there any cultural issues?

Return JSON:
{
  "issues": [
    {
      "type": "mistranslation|omission|addition|tone|fluency|cultural|terminology",
      "severity": "critical|high|medium|low",
      "confidence": 0-100,
      "description": "...",
      "suggestion": "..."
    }
  ],
  "overall_score": 0-100
}
```

---

*Document created: Party Mode Discussion*
*Participants: Winston (Architect), John (PM), Mary (Analyst), Victor (Strategist), Murat (QA)*

---

## Claude API Cost Analysis

### สมมติฐานการคำนวณ

| Parameter | Value |
|-----------|-------|
| จำนวนคำที่ตรวจ | 100,000 คำ |
| Translation units โดยประมาณ | ~7,000 units |
| Batch size | 15 units/API call |
| จำนวน API calls | ~470 calls |

### Token Breakdown (ต่อ 1 API call)

| Component | Tokens (EN) | Tokens (Thai) |
|-----------|-------------|---------------|
| System prompt | ~300 | ~300 |
| 15 units (source + target) | ~600 | ~1,500 |
| **Input รวม** | **~900** | **~1,800** |
| JSON Response | ~400-800 | ~400-800 |

### ค่าใช้จ่ายสำหรับ 100,000 คำ

#### English → Thai

| Model | Input Cost | Output Cost | **รวม** | **THB** |
|-------|------------|-------------|---------|---------|
| Claude 3.5 Haiku | $0.68 | $1.50 | **$2.18** | ~78 ฿ |
| Claude 3.5 Sonnet | $2.55 | $5.63 | **$8.18** | ~295 ฿ |
| Claude Opus 4 | $12.75 | $28.13 | **$40.88** | ~1,475 ฿ |

#### Thai → English (Thai ใช้ tokens มากกว่า ~2x)

| Model | Input Cost | Output Cost | **รวม** | **THB** |
|-------|------------|-------------|---------|---------|
| Claude 3.5 Haiku | $1.20 | $1.60 | **$2.80** | ~100 ฿ |
| Claude 3.5 Sonnet | $4.50 | $6.00 | **$10.50** | ~380 ฿ |
| Claude Opus 4 | $22.50 | $30.00 | **$52.50** | ~1,890 ฿ |

### คำแนะนำการเลือก Model

| Strategy | Model | Cost/100K คำ | Use Case |
|----------|-------|--------------|----------|
| 💚 ถูกสุด | Haiku | ~80-100 ฿ | High volume, basic QA |
| ⭐ **คุ้มค่าสุด** | **Sonnet** | ~300-400 ฿ | **Production (แนะนำ)** |
| 🔴 แม่นยำสุด | Opus | ~1,500-2,000 ฿ | Legal, critical content |

### Business Model Viability

```
ราคาขาย:     $0.01/unit × 7,000 units = $70
ต้นทุน:      Sonnet = ~$10
─────────────────────────────────────────
Gross Margin: ~85% ✅
```

### สรุป

**Claude 3.5 Sonnet เป็นตัวเลือกที่เหมาะสมที่สุด** สำหรับ QA Localization Tool:
- ความแม่นยำสูงพอสำหรับ semantic understanding
- ต้นทุนต่ำพอสำหรับ business viability
- รองรับภาษาไทยและ CJK ได้ดี

*Cost analysis updated: 2026-01-16*
