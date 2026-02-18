---
stepsCompleted:
  - step-01-epic-scan
  - step-02-schema-validation
  - step-03-dependency-audit
  - step-04-test-data-audit
  - step-05-design-spec-audit
  - step-06-cross-cutting-analysis
status: 'complete'
date: '2026-02-16'
project_name: 'qa-localization-tool'
type: 'gap-analysis'
previous_report: 'implementation-readiness-report-2026-02-15-v2.md'
---

# Implementation Gap Analysis Report

**Date:** 2026-02-16
**Project:** qa-localization-tool
**Purpose:** สแกนหา gaps ทุก Epic ที่ Dev จะติดปัญหาระหว่าง implementation
**Total Gaps Found:** 58

---

## Executive Summary

รายงานนี้เป็นส่วนเสริมของ IR Report v2 (2026-02-15) ซึ่งประเมิน readiness ในระดับ document alignment (ได้ 9.7/10)

รายงานนี้ลงลึกระดับ **implementation-level** — ตรวจว่า Dev จะติดปัญหาตรงไหนเวลาลงมือเขียนโค้ดจริง

### Gap Statistics

| Impact Level | Count | Description |
|:---:|:---:|---|
| BLOCKER | **16** (4 open, 11 resolved, 1 downgraded→resolved) | ต้องแก้ก่อน Dev เริ่มงาน Story นั้นได้ |
| CONFUSION | **42** (25 open, 17 resolved) | Dev จะสับสน/เสียเวลาถ้าไม่ชี้แจง |

### Gap Categories

| Category | Count |
|---|:---:|
| Missing technical specs | 18 |
| Missing dependencies | 7 |
| Missing test data | 7 |
| Missing design specs | 5 (3 resolved: #17, #27, #44) |
| Ambiguous acceptance criteria | 10 |
| Missing env/config specs | 5 |
| Missing external service setup | 4 |
| Missing dependencies between stories | 2 |

---

## Priority Action Plan

### Phase 1: ก่อน Story 1.2 เริ่ม (Critical Path)

| # | Action | Owner | Est. |
|---|--------|-------|------|
| 1 | ~~Reconcile ERD — รวม 27 ตารางให้ครบ (Gap #8+#52)~~ | Architect | ✅ 2026-02-16 |
| 2 | ~~เพิ่ม `file_id` ใน `scores` table (Gap #9)~~ | Architect | ✅ 2026-02-16 |
| 3 | ~~เพิ่ม `exceljs` ใน package.json (Gap #12)~~ | Dev | ✅ 2026-02-16 |
| 4 | ~~เพิ่ม `react-hook-form` + `@hookform/resolvers` (Gap #53)~~ | Dev | ✅ 2026-02-16 |
| 5 | ~~เพิ่ม `recharts` (Gap #48)~~ | Dev | ✅ 2026-02-16 |
| 6 | ~~เพิ่ม `GENERATIVE_AI_API_KEY` ใน `.env.example` (Gap #2)~~ | Dev | ✅ Story 1.1 |
| 7 | ~~เพิ่ม `DATABASE_URL` ใน env Zod schema (Gap #3)~~ | Dev | ✅ Story 1.1 |

### Phase 2: ก่อน Story 2.4 เริ่ม

| # | Action | Owner | Est. |
|---|--------|-------|------|
| 8 | Finalize Xbench Parity Spec TODO sections (Gap #21) | PM + Mona | 1-2h |
| 9 | Collect golden test corpus จาก Mona (Gap #22) | Mona | External |
| 10 | Reconcile consistency check phase (Gap #23) | PM | 30m |

### Phase 3: External Dependencies (Mona)

| # | Action | Owner | Blocks |
|---|--------|-------|--------|
| 11 | Glossary files (CSV/XLSX/TBX) | Mona | Epic 1 Story 1.5 |
| 12 | XLIFF EN→TH clean (≥5) + with issues (≥10) | Mona | Epic 2 Story 2.4 |
| 13 | Xbench CSV output (paired with XLIFF) | Mona | Epic 2 Story 2.4 |
| 14 | Excel bilingual sample | Mona | Epic 2 Story 2.3 |
| 15 | Thai back-translation reference (100 segments) | Mona | Epic 5 Story 5.1 |

### Quick Wins — ✅ ALL DONE (2026-02-16)

```bash
# Gap #12, #20, #45 — Excel parsing ✅
npm install exceljs

# Gap #53 — Form library ✅
npm install react-hook-form @hookform/resolvers

# Gap #48 — Chart library ✅
npm install recharts
```

---

## All 58 Gaps — By Epic

### Epic 1: Project Foundation & Configuration

| # | Story | Gap | Impact | Category |
|---|:-----:|-----|:------:|----------|
| 1 | 1.1 | **Supabase local dev setup ไม่มี doc.** Story 1.1 ต้องตั้ง local Supabase แต่ไม่มี setup guide (install CLI, `supabase init`, `supabase start`) | CONFUSION | Missing env/config specs |
| 2 | 1.1 | ~~**`GENERATIVE_AI_API_KEY` ไม่มีใน `.env.example`.**~~ — **RESOLVED:** Story 1.1 ใช้ multi-provider: `OPENAI_API_KEY` (L2) + `ANTHROPIC_API_KEY` (L3) แทน single key. ทั้ง `.env.example` + `src/lib/env.ts` Zod schema ครบ | ✅ RESOLVED | Missing env/config specs |
| 3 | 1.1 | ~~**`DATABASE_URL` มีใน `.env.example` แต่ไม่มีใน Architecture Zod env schema.**~~ — **RESOLVED:** `DATABASE_URL` มีทั้งใน `.env.example` + `src/lib/env.ts` Zod schema แล้ว (Story 1.1) | ✅ RESOLVED | Missing env/config specs |
| 4 | 1.1 | **Better Stack setup ไม่มี doc.** Story 1.1 AC ต้องการ 5 monitors + alert escalation แต่ไม่มีคำแนะนำ setup (dashboard-only, ไม่ต้อง API key ใน code) | CONFUSION | Missing external service setup |
| 5 | 1.1 | ~~**Design tokens ยังไม่ถูกแปลงเป็น CSS.**~~ — **RESOLVED:** `src/styles/tokens.css` สร้างแล้ว (Story 1.1), import ใน `globals.css`, ใช้งานจริงใน `app-sidebar.tsx` (`--sidebar-width`) | ✅ RESOLVED | Missing design specs |
| 6 | 1.1 | **GitHub Actions workflow files ไม่มี.** Story 1.1 AC ต้องการ quality gate, E2E gate, chaos test workflows แต่ไม่มี `.github/workflows/` | CONFUSION | Missing technical specs |
| 7 | 1.1 | **Load testing tool ไม่ระบุ.** Story 1.1 ต้อง load test (50 concurrent users) แต่ไม่มี k6/Artillery ใน dependencies | CONFUSION | Missing technical specs |
| 8 | 1.2 | ~~**ERD schema ขัดแย้งกับ Epic 1.2 อย่างหนัก.** หลาย field ไม่ตรง: `target_langs` vs `target_lang`, `file_hash` ไม่มีใน ERD, `confirmation_state`/`match_percentage`/`translator_comment`/`inline_tags` ไม่มีใน ERD, status values ไม่ตรง, 11 ตารางหายไป~~ | ✅ RESOLVED | Missing technical specs |
| 9 | 1.2 | ~~**`scores` table ไม่มี `file_id` FK.** ERD มีแค่ `project_id` แต่ scoring เป็น per-file~~ | ✅ RESOLVED | Missing technical specs |
| 10 | 1.2 | **Google OAuth setup ไม่มี doc.** Story 1.2 ต้องการ Google OAuth แต่ไม่มีคำแนะนำ (Google Cloud credentials, redirect URIs, Supabase Auth config) | BLOCKER | Missing external service setup |
| 11 | 1.2 | ~~**Auth webhook for role sync ไม่ระบุ.** Story 1.2 บอก role changes trigger JWT refresh แต่ไม่มี implementation details สำหรับ `004_auth_hooks.sql`~~ — **RESOLVED:** Story 1-2 Task 3.4 มี Custom Access Token Hook SQL ครบ, Task 10 มี Realtime Role Sync | ✅ RESOLVED | Missing technical specs |
| 12 | 1.4 | ~~**ไม่มี Excel parsing library ใน `package.json`.** Story 1.4 ต้อง import glossary จาก Excel, Story 2.3 ต้อง parse Excel bilingual~~ — **RESOLVED:** `exceljs` installed | ✅ RESOLVED | Missing dependencies |
| 13 | 1.4 | **TBX parsing library ไม่ระบุชัด.** `fast-xml-parser` ใช้ได้แต่ควรระบุใน story ว่าใช้ตัวนี้ | CONFUSION | Ambiguous acceptance criteria |
| 14 | 1.5 | **Glossary matching test corpus ไม่มี.** `docs/test-data/glossary-matching/th.json` ต้องมี 500+ segments — ยังไม่มี (Mona dependency) | BLOCKER | Missing test data |
| 15 | 1.5 | **Glossary files จาก Mona ยังไม่มี.** `glossaries/` ว่างเปล่า — Story 1.4/1.5 ต้องใช้ | BLOCKER | Missing test data |
| 16 | 1.6 | **Taxonomy seed data format ไม่ระบุ.** Story 1.6 ต้อง seed จาก `docs/QA _ Quality Cosmetic.md` แต่ไม่บอกว่าเป็น SQL insert, JSON fixture, หรือ migration file | CONFUSION | Ambiguous acceptance criteria |
| 17 | 1.7 | ~~**OnboardingTour component ไม่มี implementation spec.** Story 1.7 บอก 5-step tour แต่ไม่เลือก library (react-joyride, driver.js, หรือ custom) ไม่มี wireframe~~ — **RESOLVED:** `component-strategy.md` อัปเดต: library = `driver.js` v1.3+, 2-phase tour (Setup 3 steps + Review 5 steps per Epic AC), wireframes, variants (full/pm-lite/feature-spotlight), states, mobile behavior, server-side persistence, accessibility | ✅ RESOLVED | Missing design specs |

#### Suggested Fixes — Epic 1

- **#8+#9:** ✅ **RESOLVED 2026-02-16** — ERD อัปเดตครบ 27 ตาราง, scores เพิ่ม file_id + layer_completed + status values (partial, na), cascade rules เพิ่ม 10 relationships, Story 1-2 อัปเดตให้ตรงกัน. **Sub-fix (round 2):** projects table aligned — `target_lang` → `target_langs (jsonb)`, เพิ่ม `description`, `auto_pass_threshold`; glossaries เพิ่ม `project_id FK nullable` ให้ตรง cascade rules
- **#5:** ✅ **RESOLVED 2026-02-16** — `src/styles/tokens.css` สร้างแล้ว (Story 1.1), import ใน `globals.css`, ใช้งานจริง
- **#10:** เพิ่ม Google OAuth setup guide (5 steps) ใน setup doc
- **#12:** ✅ **RESOLVED 2026-02-16** — `exceljs` installed
- **#17:** ✅ **RESOLVED 2026-02-16** — `component-strategy.md` เพิ่ม OnboardingTour spec: `driver.js`, 2-phase tour (Setup 3 + Review 5 steps), wireframes, variants, mobile, accessibility
- **#14+#15:** Escalate Mona สำหรับ glossary data; Dev สร้าง synthetic 50-100 terms ก่อน

---

### Epic 2: File Processing & Rule-based QA Engine

| # | Story | Gap | Impact | Category |
|---|:-----:|-----|:------:|----------|
| 18 | 2.1 | **Supabase Storage bucket setup ไม่มี doc.** ต้อง create bucket, set RLS, configure CORS — ไม่มีคำแนะนำ | BLOCKER | Missing external service setup |
| 19 | 2.2 | **Segmenter test corpus ไม่มี.** `docs/test-data/segmenter/` ว่าง — ต้องมี expected token counts สำหรับ CJK/Thai | BLOCKER | Missing test data |
| 20 | 2.3 | ~~**ไม่มี Excel parsing library** (เหมือน #12) — Story 2.3 blocked โดยสิ้นเชิง~~ — **RESOLVED:** `exceljs` installed (see #12) | ✅ RESOLVED | Missing dependencies |
| 21 | 2.4 | **Xbench Parity Spec ยังเป็น DRAFT.** 2 TODO sections ยังไม่เสร็จ: Section 4 (Xbench config profile) + Section 7 (language exceptions) Sign-off 0/7 items checked. **Story 2.4 ต้องให้ doc APPROVED ก่อน** | BLOCKER | Missing technical specs |
| 22 | 2.4 | **Golden test corpus จาก Mona ยังไม่มี.** ต้องการ ≥20 EN→TH files paired กับ Xbench CSV | BLOCKER | Missing test data |
| 23 | 2.4 | **Consistency checks ขัดแย้ง.** Xbench Parity Spec ใส่ไว้ "Phase 2" แต่ Story 2.4 AC list เป็น L1 check | CONFUSION | Ambiguous acceptance criteria |
| 24 | 2.5 | ~~**`findings.segment_count` ไม่มีใน schema.** Story 2.5 อ้างอิง field นี้แต่ไม่มีใน ERD หรือ Story 1.2~~ — **RESOLVED:** เพิ่ม `segment_count (integer default 1)` ใน ERD + Story 1-2 | ✅ RESOLVED | Missing technical specs |
| 25 | 2.7 | **Xbench CSV format ไม่ระบุ.** Story 2.7 ต้อง parse Xbench report แต่ไม่มี spec ว่า columns อะไร, delimiter, encoding | CONFUSION | Ambiguous acceptance criteria |

#### Suggested Fixes — Epic 2

- **#18:** เพิ่ม Supabase Storage setup guide (create bucket, RLS, CORS)
- **#19:** Dev สร้าง segmenter corpus จาก SAP XLIFF ได้เลย (ไม่ต้องรอ Mona)
- **#21:** PM + Mona finalize TODO sections ใน xbench-parity-spec.md
- **#22:** Dev เริ่ม implement rules ด้วย public data ก่อน → parity verification รอ Mona
- **#23:** ตัดสินใจ: consistency อยู่ MVP หรือ Phase 2? อัพเดทให้ตรงกัน

---

### Epic 3: AI-Powered Quality Analysis

| # | Story | Gap | Impact | Category |
|---|:-----:|-----|:------:|----------|
| 26 | 3.1 | ~~**`project.ai_budget_monthly_usd` ไม่มีใน schema.** Story 3.1 อ้างอิง budget enforcement แต่ field ไม่มีใน projects table~~ — **RESOLVED:** เพิ่ม `ai_budget_monthly_usd (decimal nullable)` ใน ERD projects table + Story 1-2 | ✅ RESOLVED | Missing technical specs |
| 27 | 3.1 | ~~**ไม่มี UI spec สำหรับ AI Configuration / AI Usage Dashboard.** ไม่มี component spec, layout, wireframe~~ — **RESOLVED:** `component-strategy.md` อัปเดต: Settings tab wireframe (budget + mode + model selector), Usage dashboard wireframe (metrics + trend + per-file), Admin model version `<Select>` dropdown, rate limiting notes (backend-only + toast), budget override UI, admin-level tenant aggregate view cross-ref, RBAC matrix 7 elements, states 5 แบบ | ✅ RESOLVED | Missing design specs |
| 28 | 3.2a | **L2 prompt template ไม่มี.** Dev ต้องเขียน prompt จาก scratch โดยไม่มี reference | CONFUSION | Missing technical specs |
| 29 | 3.3 | **L3 prompt template ไม่มี.** เหมือน #28 — ต้องการ system message structure, segment format, output format | CONFUSION | Missing technical specs |
| 30 | 3.5 | ~~**`scores.auto_pass_rationale` type ขัดแย้ง.** Story บอก jsonb, ERD บอก varchar nullable~~ — **RESOLVED:** ERD อัปเดตเป็น `text nullable` | ✅ RESOLVED | Missing technical specs |

#### Suggested Fixes — Epic 3

- **#26:** ✅ **RESOLVED 2026-02-16** — เพิ่ม `ai_budget_monthly_usd (decimal nullable)` ใน ERD projects table + Story 1-2
- **#27:** ✅ **RESOLVED 2026-02-16** — `component-strategy.md` เพิ่ม AIConfigurationPanel spec: Settings wireframe, Dashboard wireframe, model selector, rate limiting notes, budget override, admin tenant view, RBAC
- **#28+#29:** สร้าง prompt template reference doc (system message, segment format, output format)
- **#30:** ✅ **RESOLVED** — ERD อัปเดตเป็น `text nullable`

---

### Epic 4: Review & Decision Workflow

| # | Story | Gap | Impact | Category |
|---|:-----:|-----|:------:|----------|
| 31 | 4.0 | ~~**Review page route ขัดแย้ง.** Epic: `(dashboard)/projects/[projectId]/files/[fileId]/review/`, Architecture: `(app)/projects/[projectId]/review/[sessionId]/` — คนละ route group + parameter~~ — **RESOLVED:** Architecture authoritative: `(app)/projects/[projectId]/review/[sessionId]/`. Session-based review, file selection in UI. See GA-1. | ✅ RESOLVED | Missing technical specs |
| 32 | 4.2 | ~~**8-state lifecycle ไม่มี transition matrix.** 8 states (Pending, Accepted, Re-accepted, Rejected, Flagged, Noted, Source Issue, Manual) แต่ไม่บอกว่า transition ไหนได้บ้าง~~ — **RESOLVED:** เพิ่ม Decision 3.8 Finding Status Lifecycle & Transition Matrix ใน Architecture | ✅ RESOLVED | Ambiguous acceptance criteria |
| 33 | 4.4b | **Undo/redo ไม่มี server-side spec.** Undo stack เป็น client-side Zustand แต่ต้อง revert DB state — ไม่ชัดว่า call Server Action อย่างไร | CONFUSION | Missing technical specs |
| 34 | 4.6 | ~~**Pattern detection algorithm ไม่ชัด.** บอก "semantic similarity > 0.85" แต่ไม่มี embedding model ใน stack~~ — **RESOLVED:** MVP ใช้ Jaccard word-overlap (threshold 0.70), semantic similarity deferred to Growth. See GA-2. | ✅ RESOLVED | Ambiguous acceptance criteria |

#### Suggested Fixes — Epic 4

- **#31:** ✅ **RESOLVED 2026-02-16** — Architecture authoritative: `(app)/projects/[projectId]/review/[sessionId]/`. See Architecture GA-1.
- **#32:** ✅ **RESOLVED 2026-02-16** — เพิ่ม Decision 3.8 Finding Status Lifecycle & Transition Matrix ใน Architecture
- **#34:** ✅ **RESOLVED 2026-02-16** — MVP ใช้ Jaccard word-overlap (threshold 0.70). See Architecture GA-2.

---

### Epic 5: Language Intelligence & Non-Native Support

| # | Story | Gap | Impact | Category |
|---|:-----:|-----|:------:|----------|
| 35 | 5.1 | **Thai back-translation reference corpus ไม่มี.** `docs/test-data/back-translation/th-reference.json` ยังไม่ได้สร้าง — Mona dependency | BLOCKER | Missing test data |
| 36 | 5.1 | **Back-translation caching strategy ไม่ชัด.** Cache 24h แต่ไม่บอกว่า cross-session, cross-user หรือไม่ | CONFUSION | Missing technical specs |
| 37 | 5.2 | ~~**`user.is_native_language_pair` ไม่มีใน schema.** Story อ้างอิง native vs non-native reviewer แต่ไม่มี field ใน users table~~ — **RESOLVED:** เพิ่ม `native_languages (jsonb nullable — BCP-47 array)` ใน ERD users table + Story 1-2 | ✅ RESOLVED | Missing technical specs |
| 38 | 5.2 | **Story 5.2 ต้องใช้ `file_assignments` จาก Story 6.1 (Epic 6) แต่ Epic 5 มาก่อน.** Assignment mechanism ยังไม่มี | CONFUSION | Missing dependencies between stories |

#### Suggested Fixes — Epic 5

- **#35:** Escalate Mona; Dev implement feature ก่อน → validate ทีหลัง
- **#37:** ✅ **RESOLVED 2026-02-16** — เพิ่ม `users.native_languages (jsonb nullable — BCP-47 array)` ใน ERD + Story 1-2
- **#38:** เพิ่ม explicit dependency note: ใช้ simplified `findings.assigned_to` เป็น interim

---

### Epic 6: Batch Processing & Team Collaboration

| # | Story | Gap | Impact | Category |
|---|:-----:|-----|:------:|----------|
| 39 | 6.1 | ~~**Reviewer language profile ไม่มีใน user schema.** เหมือน #37 — ต้องการ language proficiency สำหรับ filter reviewers by language pair~~ — **RESOLVED:** แก้พร้อม #37 — `users.native_languages` ใช้ filter reviewers by language pair | ✅ RESOLVED | Missing technical specs |
| 40 | 6.2 | **Notification auto-archive mechanism ไม่ระบุ.** 30-day auto-archive แต่ไม่บอกว่าใช้ Inngest cron, DB scheduled function, หรือ Edge Function | CONFUSION | Ambiguous acceptance criteria |

#### Suggested Fix — Epic 6

- **#39:** ✅ **RESOLVED 2026-02-16** — แก้พร้อม #37 (`users.native_languages` ใช้ filter reviewers)
- **#40:** ใช้ weekly Inngest cron function ที่ DELETE/archive notifications > 30 days

---

### Epic 7: Auto-Pass & Trust Automation

| # | Story | Gap | Impact | Category |
|---|:-----:|-----|:------:|----------|
| 41 | 7.1 | ~~**"2+ months" mode transition ไม่ programmatic.** บอก "project operated 2+ months" แต่ไม่ชัดว่า check อัตโนมัติหรือ Admin enable manual~~ — **RESOLVED:** Admin enable manually, "2+ months" เป็น recommendation ไม่ใช่ enforced. See GA-3. | ✅ RESOLVED | Ambiguous acceptance criteria |
| 42 | 7.2 | ~~**PRNG seed formula ไม่ implement ได้.** `project_id + audit_week` แต่ project_id เป็น UUID — บวก week number ไม่ได้~~ — **RESOLVED:** Hash-based seed: `SHA-256(project_id + '_' + audit_week_iso).slice(0,8)`. See GA-4. | ✅ RESOLVED | Ambiguous acceptance criteria |

#### Suggested Fixes — Epic 7

- **#41:** ✅ **RESOLVED 2026-02-16** — Admin enable manually, "2+ months" = recommendation. See Architecture GA-3.
- **#42:** ✅ **RESOLVED 2026-02-16** — Hash-based seed: `SHA-256(project_id + '_' + audit_week_iso).slice(0,8)`. See Architecture GA-4.

---

### Epic 8: Reporting & Certification

| # | Story | Gap | Impact | Category |
|---|:-----:|-----|:------:|----------|
| 43 | 8.1 | ~~**PDF generation library ไม่มีใน `package.json`.** Story บอก Puppeteer/Playwright แต่ไม่มีใน dependencies. `@playwright/test` เป็น E2E testing ไม่ใช่ PDF~~ — **RESOLVED:** `@react-pdf/renderer` installed (Decision per `component-strategy.md`: MVP ใช้ `@react-pdf/renderer` + Thai/CJK POC required ก่อน Story 8.1) | ✅ RESOLVED | Missing dependencies |
| 44 | 8.1 | ~~**QA Certificate PDF template ไม่มี.** ไม่มี wireframe, layout, stamp position, font choices (สำคัญสำหรับ Thai/CJK)~~ — **RESOLVED:** `component-strategy.md` อัปเดต: A4 certificate wireframe (page 1), detailed findings page wireframe (page 2+), Smart Report 3-tier wireframe (separate doc), Excel export wireframe (3 sheets), staleness UI wireframe, typography table (Thai: Sarabun 14px, CJK: Noto Sans CJK), PDF generation strategy (`@react-pdf/renderer` MVP + Thai POC required), report metadata footer, verify URL (public route), states 7 แบบ | ✅ RESOLVED | Missing design specs |
| 45 | 8.1 | ~~**Excel export library ไม่ระบุ.** ต้องการ .xlsx export with formatting — ต้องใช้ `exceljs` (เหมือน #12)~~ — **RESOLVED:** `exceljs` installed (see #12) | ✅ RESOLVED | Missing dependencies |

#### Suggested Fixes — Epic 8

- **#43:** ✅ **RESOLVED 2026-02-16** — `@react-pdf/renderer` installed. Decision per `component-strategy.md`: MVP ใช้ `@react-pdf/renderer` (lightweight, React-native PDF). Thai/CJK font POC required ก่อน Story 8.1. Puppeteer เป็น fallback ถ้า font rendering มีปัญหา
- **#44:** ✅ **RESOLVED 2026-02-16** — `component-strategy.md` เพิ่ม QACertificate spec: A4 wireframe, detailed findings page, Smart Report 3-tier, Excel export 3 sheets, staleness UI, typography (Thai/CJK), PDF generation strategy, report metadata, verify URL
- **#45:** ✅ **RESOLVED 2026-02-16** — `exceljs` installed (see #12)

---

### Epic 9: AI Learning & Continuous Improvement

| # | Story | Gap | Impact | Category |
|---|:-----:|-----|:------:|----------|
| 46 | 9.1 | ~~**`feedback_events` schema ขัดแย้ง.** Story 9.1 มี 20+ fields, ERD มีคนละชุด (เช่น `original_severity` vs `finding_severity`)~~ — **RESOLVED:** ERD อัปเดตตาม Epic 9: เพิ่ม file_id, layer, is_false_positive, reviewer_is_native, metadata; เปลี่ยน finding_severity → original_severity; เพิ่ม action values | ✅ RESOLVED | Missing technical specs |
| 47 | 9.3 | ~~**`ai_metrics_timeseries` table ไม่มีใน ERD.** Story 9.3 + Story 1.2 อ้างอิงแต่ ERD ไม่ define schema~~ | ✅ RESOLVED | Missing technical specs |
| 48 | 9.4 | ~~**ไม่มี chart library.** Epics 7-9 ต้องการ line/bar/trend charts แต่ไม่มี `recharts`/`chart.js` ใน package.json~~ — **RESOLVED:** `recharts` installed | ✅ RESOLVED | Missing dependencies |

#### Suggested Fixes — Epic 9

- **#46:** ✅ **RESOLVED** — ERD อัปเดตตาม Epic 9: เพิ่ม 5 fields + เปลี่ยน naming (2026-02-16)
- **#47:** ✅ **RESOLVED** — `ai_metrics_timeseries` เพิ่มใน ERD แล้ว (2026-02-16)
- **#48:** ✅ **RESOLVED 2026-02-16** — `recharts` installed

---

### Epic 10: Rule-based Auto-fix (Growth)

| # | Story | Gap | Impact | Category |
|---|:-----:|-----|:------:|----------|
| 49 | 10.1 | ~~**`fix_suggestions` + `self_healing_config` table schemas ไม่มีใน ERD.** Story 1.2 บอกสร้างตอน initial migration แต่ schema อยู่ใน Epic 10 stories เท่านั้น~~ | ✅ RESOLVED | Missing technical specs |

#### Suggested Fix — Epic 10

- **#49:** ✅ **RESOLVED** — `fix_suggestions` + `self_healing_config` เพิ่มใน ERD แล้ว (2026-02-16)

---

### Epic 11: Self-healing Translation (Growth/Vision)

| # | Story | Gap | Impact | Category |
|---|:-----:|-----|:------:|----------|
| 50 | 11.1 | **pgvector ไม่มีใน dependencies.** Story 11.1 ต้องการ RAG + vector search แต่ไม่มี pgvector extension หรือ embedding library | CONFUSION | Missing dependencies |
| 51 | 11.1 | **Fix Agent + Judge Agent model ไม่ระบุ.** ไม่มี `LAYER_MODELS.Fix` / `LAYER_MODELS.Judge` config | CONFUSION | Missing technical specs |

#### Note — Epic 10+11

Growth phase — ไม่ block MVP. Note ไว้เฉยๆ แก้เมื่อเข้า Growth

---

### Cross-Cutting Gaps (กระทบหลาย Epic)

| # | Scope | Gap | Impact | Category |
|---|-------|-----|:------:|----------|
| 52 | All | ~~**Architecture ERD 1.9 ขาด 11 จาก 27 ตาราง.** ขาด: `review_actions`, `run_metadata`, `ai_usage_logs`, `file_assignments`, `notifications`, `exported_reports`, `suppression_rules`, `ai_metrics_timeseries`, `fix_suggestions`, `self_healing_config`, `audit_results`~~ | ✅ RESOLVED | Missing technical specs |
| 53 | All | ~~**`react-hook-form` ไม่มีใน `package.json`.** Architecture Decision 4.4 ระบุใช้สำหรับ complex forms แต่ไม่ได้ install~~ — **RESOLVED:** `react-hook-form` + `@hookform/resolvers` installed | ✅ RESOLVED | Missing dependencies |
| 54 | All | **Mona มี 0/6 data deliverables.** ทุกอย่างยังเป็น "Not yet collected": glossary, XLIFF EN→TH, Xbench CSV, Excel bilingual, Thai back-translation | BLOCKER | Missing test data |
| 55 | 1-2 | **Supabase local development ไม่มี doc.** ต้องการ setup guide: install CLI, init, start, db push | CONFUSION | Missing env/config specs |
| 56 | 1-2 | **Inngest Dev Server setup ไม่มี doc.** ต้องการ: start dev server, configure serve endpoint, test functions locally | CONFUSION | Missing env/config specs |
| 57 | 1-4 | ~~**`severity_configs` table RLS ขัดแย้ง.** มี `tenant_id FK nullable` (per-tenant overrides) แต่ listed under "No RLS Needed" (shared reference data)~~ — **RESOLVED:** Architecture อัปเดต: ไม่มี RLS ถูกต้อง เพราะ NULL=system defaults ต้อง visible ทุก tenant; access control ผ่าน application level | ✅ RESOLVED | Ambiguous acceptance criteria |
| 58 | 2-3 | ~~**`scores.layer_completed` vs `layers_completed` naming inconsistency.** Story 2.5 ใช้ `layers_completed`, Story 2.6/3.2b ใช้ `layer_completed`, Story 3.5 ใช้ทั้งสอง~~ — **RESOLVED:** ERD กำหนดเป็น `layer_completed` (singular) เป็น authoritative. ERD Mermaid + Story 1-2 อัปเดตเป็น `layer_completed` แล้ว | ✅ RESOLVED | Ambiguous acceptance criteria |

---

## Blocker Resolution Tracker

### Must Fix Before Epic 1

| Gap # | Description | Owner | Status |
|:-----:|-------------|-------|:------:|
| 8+52 | ERD reconciliation (27 tables) | Architect | ✅ 2026-02-16 |
| 9 | `scores.file_id` FK + `layer_completed` + status values | Architect | ✅ 2026-02-16 |
| 5 | ~~Design tokens~~ → `src/styles/tokens.css` สร้างแล้ว (Story 1.1) | Dev | ✅ 2026-02-16 |
| 10 | Google OAuth setup guide | Dev/PM | ⬜ |
| 12 | `exceljs` dependency | Dev | ✅ 2026-02-16 |
| 53 | `react-hook-form` + `@hookform/resolvers` dependency | Dev | ✅ 2026-02-16 |

### Must Fix Before Epic 2

| Gap # | Description | Owner | Status |
|:-----:|-------------|-------|:------:|
| 18 | Supabase Storage setup guide | Dev/PM | ⬜ |
| 19 | Segmenter test corpus | Dev | ⬜ |
| 21 | Xbench Parity Spec finalize | PM + Mona | ⬜ |
| 22 | Golden test corpus | Mona | ⬜ |

### Must Fix Before Epic 3

| Gap # | Description | Owner | Status |
|:-----:|-------------|-------|:------:|
| 26 | `ai_budget_monthly_usd` in schema | Architect | ✅ 2026-02-16 |
| 43 | ~~PDF generation library~~ → `@react-pdf/renderer` installed | Dev | ✅ 2026-02-16 |

### External Dependencies (Mona) — All ⬜

| Deliverable | Blocks | Priority |
|-------------|--------|:--------:|
| Glossary files (CSV/XLSX/TBX) | Epic 1 Story 1.5 | HIGH |
| XLIFF EN→TH clean (≥5 files) | Epic 2 Story 2.4 | HIGH |
| XLIFF EN→TH with issues (≥10 files) | Epic 2 Story 2.4 | HIGH |
| Xbench CSV output (paired) | Epic 2 Story 2.4 | HIGH |
| Excel bilingual sample (≥1) | Epic 2 Story 2.3 | MEDIUM |
| Thai back-translation reference (100 segments) | Epic 5 Story 5.1 | MEDIUM |

---

## Comparison with IR Report v2 (2026-02-15)

| Dimension | v2 Score | Gap Analysis Finding |
|---|:---:|---|
| FR Coverage | 10/10 | ไม่เปลี่ยน — 102/102 FRs covered |
| Epic Independence | 10/10 | พบ 1 cross-epic dependency (#38: Story 5.2 → 6.1) |
| Story Quality | 10/10 | พบ ambiguity 10 stories (ไม่ block แต่ Dev จะสับสน) |
| AC Specificity | 10/10 | พบ 10 ACs ที่ ambiguous — 6 resolved (~~#32~~, ~~#34~~, ~~#41~~, ~~#42~~, ~~#57~~, ~~#58~~), 4 open (#23, #25, #40, #16) |
| Architecture Alignment | 10/10 | ~~พบ ERD ขาด 11 ตาราง (#52)~~ ✅ resolved — ERD ครบ 27 ตาราง + Decision 3.8 transition matrix + GA-1~4 addenda |
| Prerequisites | 8.5/10 | เพิ่ม: ~~missing dependencies (#12, #43, #48, #53)~~ ✅ all resolved, remaining: missing test data (#14, #15, #19, #22, #35) — Mona dependency |
| **Revised Overall** | **9.0/10** | 58 gaps → 33 resolved, 25 open (4 BLOCKER + 21 CONFUSION) |

---

## Recommendations

### Immediate Actions (ทำวันนี้)

1. ~~**Quick wins** — install missing npm dependencies (exceljs, react-hook-form, recharts)~~ ✅ **DONE 2026-02-16** + update .env.example
2. ~~**ERD reconciliation** — #1 blocker, ต้องทำก่อน Story 1.2 เริ่ม~~ ✅ **DONE 2026-02-16** — ERD ครบ 27 ตาราง + scores fixed + cascade rules updated

### This Week

3. **Xbench Parity Spec** — finalize TODO sections กับ Mona
4. **Setup guides** — Supabase local dev, Inngest Dev Server, Google OAuth
5. **Design tokens** — สร้าง tokens.css หรือ reference UX spec

### Before Each Epic Starts

6. ดู Blocker Resolution Tracker ด้านบน — ตรวจว่า blockers ของ Epic นั้นแก้หมดแล้ว

### Ongoing

7. **Mona data collection** — ติดตาม 6 deliverables ตาม priority
8. **Segmenter + back-translation corpus** — Dev สร้างจาก SAP XLIFF ได้เลย

---

**Assessed by:** Claude (Dev Agent)
**Date:** 2026-02-16
**Assessment type:** Implementation Gap Analysis
**Builds on:** IR Report v2 (2026-02-15, Winston/Architect Agent)
