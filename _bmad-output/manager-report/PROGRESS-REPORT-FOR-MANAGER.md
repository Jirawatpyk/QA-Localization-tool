# QA Localization Tool — Progress Report

**Date:** 3 April 2026
**Prepared by:** Development Team
**Report Period:** Project inception to current
**Overall Status:** On Track

---

## Executive Summary

ระบบ QA Localization Tool เป็นเครื่องมือตรวจสอบคุณภาพงานแปลที่ใช้ AI ร่วมกับ Rule Engine ทำงานได้ 3 ชั้น (L1 Rule-based, L2 AI Screening, L3 Deep AI Analysis) โดยมีเป้าหมายให้ QA Reviewer สามารถตรวจจบได้ในรอบเดียว (Single-Pass Completion) ไม่ต้องส่งกลับไปแก้ซ้ำ

**ความคืบหน้ารวม: ~55%** (5 จาก 10 Epics เสร็จสมบูรณ์, 1 กำลังทำ, 4 ยังไม่เริ่ม)

---

## Progress by Epic

### Epic 1: Project Foundation & Configuration — DONE 100%
**เป้าหมาย:** วางรากฐานระบบทั้งหมด — Authentication, Project management, Glossary, Taxonomy

**สิ่งที่ทำเสร็จแล้ว:**
- Supabase Auth + RBAC (3 roles: Admin, QA Reviewer, Native Reviewer)
- Row Level Security (RLS) multi-tenant isolation ตั้งแต่วันแรก
- Project CRUD (สร้าง/แก้ไข/ตั้งค่า project, 15 ภาษา)
- Glossary import/export (CSV, XLSX, TBX) + multi-token matching
- Taxonomy Mapping editor (MQM + Custom, 74 mappings)
- Dashboard shell + KPI cards
- Onboarding tour (driver.js) สำหรับ user ใหม่
- CI/CD pipeline (GitHub Actions: quality-gate, e2e-gate)
- Immutable audit trail ทุก action

**FRs covered:** 12 | **Stories:** ทั้งหมดเสร็จ

---

### Epic 2: File Processing & Rule-based QA Engine — DONE 100%
**เป้าหมาย:** Upload ไฟล์แปล + Rule Engine ที่ตรวจได้เท่า Xbench (100% parity)

**สิ่งที่ทำเสร็จแล้ว:**
- File upload (drag & drop, max 15 MB/file, 50 files)
- Parser: SDLXLIFF, XLIFF 1.2, Excel — รองรับ CJK/Thai text
- L1 Rule Engine: tag integrity, punctuation, completeness, number consistency
- Xbench Parity: 100% ตรงกับ Xbench ทุก rule category
- MQM Score calculation (Critical/Major/Minor weighting)
- Language-specific rules (Thai tone marks, CJK normalization)
- Inngest pipeline foundation (L1 orchestration)
- Economy / Thorough mode selection UI
- Parity comparison page (upload Xbench report เปรียบเทียบ)

**FRs covered:** 16 | **Stories:** ทั้งหมดเสร็จ

---

### Epic 3: AI-Powered Quality Analysis — DONE 100%
**เป้าหมาย:** AI วิเคราะห์ semantic ที่ Rule Engine จับไม่ได้ — L2 (fast) + L3 (deep)

**สิ่งที่ทำเสร็จแล้ว:**
- L2 AI Screening (GPT-4o-mini): fast triage ~30s/file
- L3 Deep Analysis (Claude Sonnet): detailed review ~2min/file
- Inngest durable pipeline: retry, failure handling, serial queue per project
- Confidence scoring (High/Medium/Low) per finding
- AI cost tracking + budget check ก่อนทุก AI call
- Fallback provider chain (OpenAI → Anthropic)
- Chunking at 30K chars สำหรับไฟล์ใหญ่
- Cost estimation UI ก่อน processing ($0.40 vs $2.40 /100K words)
- AI Usage dashboard (spend trend chart, L2/L3 breakdown, CSV export)

**FRs covered:** 12 | **Stories:** ทั้งหมดเสร็จ
**ทดสอบจริง:** ทั้ง Economy (L1+L2) และ Thorough (L1+L2+L3) ทำงานสำเร็จ 100%

---

### Epic 4: Review & Decision Workflow — DONE 100%
**เป้าหมาย:** Reviewer ตรวจ findings ได้เร็วด้วย keyboard shortcuts + bulk actions

**สิ่งที่ทำเสร็จแล้ว:**
- Finding list with progressive disclosure (expand/collapse detail)
- 7 Review Actions: Accept, Reject, Flag, Note, Source Issue, Severity Override, Add Finding
- Keyboard hotkeys (A/R/F/N/S/+/-/J/K) — active เฉพาะใน review area
- Bulk accept/reject with undo stack (max 20, per-tab)
- Filter system: Severity, Layer (Rule/AI), Status, Category, Confidence
- Search findings
- Suppress false positive patterns → Suppression Rules admin
- Review progress bar (X/Y reviewed)
- File approve/reject workflow
- Roving tabindex grid navigation (WCAG 2.4.7)
- AI Suggestions toggle
- WCAG accessibility: contrast 4.5:1, focus indicators, aria landmarks, prefers-reduced-motion

**FRs covered:** 14 | **Stories:** ทั้งหมดเสร็จ

---

### Epic 5: Language Intelligence & Non-Native Support — DONE 100%
**เป้าหมาย:** Non-native reviewer ตรวจงานแปลภาษาที่อ่านไม่ออกได้ด้วย AI back-translation

**สิ่งที่ทำเสร็จแล้ว:**
- Language Bridge sidebar (back-translation + AI explanation)
- Per-segment BT caching (targetTextHash key) + dual TTL invalidation
- Non-native auto-tag: "subject to native audit" (write-once, never clear)
- Flag-for-native review action (atomic 3-table transaction)
- Native reviewer scoped access (RLS + finding_assignments)
- Thai/CJK back-translation quality: tone/compound/particle handling
- `lang` attribute on all BT text elements
- Budget-gated fallback for BT calls
- RLS policies + E2E tests ครบ

**FRs covered:** 4 | **Stories:** 5/5 เสร็จ | **Streak:** 5 epics ติดต่อกัน 100% ไม่มี descoping

---

### Epic 6: Batch Processing & Team Collaboration — IN PROGRESS ~40%
**เป้าหมาย:** ทีมทำงานร่วมกัน — assign files, priority queue, notifications

**สิ่งที่ทำเสร็จแล้ว:**
- **Story 6.1 DONE:** File assignment & language-pair matching
  - ReviewerSelector component (filter by language pair + workload)
  - Assign/reassign/takeover workflow
  - Soft lock via DB heartbeat
  - Urgency flag + priority ordering
  - Assignment status display on History page
  - "View Read-Only" / "Take Over" conflict resolution
- **Story 6.2a DONE:** Notification schema & helper centralization
  - `notifications` table + RLS policy
  - Centralized `insertNotification()` helper
  - Server-side grouping logic
  - `project_id` + `archived_at` columns
- **Story 6.2b DONE:** 3 notification event types wired
  - Analysis complete, file assigned, glossary updated notifications
  - Toast coalescing for batch operations

**สิ่งที่เหลือ:**
- **Story 6.2c:** Auto-pass notification + notification dropdown UI (bell icon)
- **Story 6.3:** Responsive layout + mobile optimization
- **Verification story:** Real E2E test ทุก feature ใน Epic 6

**FRs covered:** 4 | **Stories:** 3/~6 เสร็จ

---

### Epic 7: Auto-Pass & Trust Automation — NOT STARTED
**เป้าหมาย:** ระบบ auto-pass ไฟล์ที่สะอาด ไม่ต้องให้คน review

**สิ่งที่จะทำ:**
- Recommended-pass (Month 1) → Full auto-pass (Month 2+)
- Configurable auto-pass criteria (MQM threshold, finding types)
- Blind audit protocol (random sample re-review)
- Auto-pass rationale display ให้ user เข้าใจว่าทำไมถึง pass

**FRs covered:** 4

---

### Epic 8: Reporting & Certification — NOT STARTED
**เป้าหมาย:** Export QA reports + QA Certificate สำหรับส่งลูกค้า

**สิ่งที่จะทำ:**
- PDF/Excel report export
- Smart Reports (3-tier: summary, detailed, full)
- QA Certificate (1-click PDF สำหรับ client delivery)
- QA Audit Trail per file
- Report invalidation on severity override
- Immutable audit log viewer
- Run metadata logging

**FRs covered:** 7

---

### Epic 9: AI Learning & Continuous Improvement — NOT STARTED
**เป้าหมาย:** AI เรียนรู้จาก reviewer decisions ปรับปรุงตัวเองอัตโนมัติ

**สิ่งที่จะทำ:**
- Structured feedback logging (ทุก accept/reject เป็น training data)
- False positive rate tracking per language pair
- AI learning indicator (accuracy trend graph)
- Feedback states: logged vs applied
- AI-to-Rule promotion candidate detection (finding ที่ AI จับได้ซ้ำๆ → เสนอเป็น Rule)

**FRs covered:** 5

---

### Epic 10: Rule-based Auto-fix (Growth) — NOT STARTED
**เป้าหมาย:** ระบบแก้ไข error อัตโนมัติ (tags, numbers, placeholders) + promote AI findings เป็น rules

**สิ่งที่จะทำ:**
- Auto-fix engine สำหรับ deterministic errors
- Fix preview + acceptance tracking
- AI-to-Rule promotion pipeline (FR82-84)
- Self-healing config (shadow → assisted → autonomous)

**FRs covered:** 6
**Note:** Schema design (fix_suggestions, self_healing_config) รอไว้ใน DB แล้ว mode="disabled"

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Epics completed | 5 / 10 |
| Epic completion streak | 5 ต่อเนื่อง (100% ไม่มี descoping) |
| Functional Requirements covered | 62 / 99 FRs |
| Total pages/screens built | 17 |
| Test coverage | Unit + RLS + E2E ครอบคลุมทุก feature |
| Console errors ล่าสุด | 0 (ทดสอบทุกหน้า) |
| Pipeline tested | Economy (L1+L2) + Thorough (L1+L2+L3) ผ่านทั้งคู่ |
| Supported languages | 15 (EN, TH, JA, KO, ZH, ZH-Hant, FR, DE, ES, PT, IT, AR, VI, ID, MS) |

---

## Known Issues (from UI Tour 2026-04-03)

| Priority | Issue | Impact |
|----------|-------|--------|
| **HIGH** | ไม่มีปุ่ม Logout | User ไม่สามารถ sign out ได้ |
| Medium | Project Card ไม่ clickable | Non-admin user navigate เข้า project ไม่ได้ |
| Medium | File name ใน History ไม่เป็น link | ต้องไป review page ผ่าน URL ตรง |
| Medium | Sidebar แสดง Admin link ให้ทุก role | non-admin เห็น link ที่ใช้ไม่ได้ |
| Low | Breadcrumb แสดง UUID/kebab-case | 3 หน้า breadcrumb ไม่แสดงชื่อ project |
| Low | Onboarding tooltip ซ้ำทุกหน้า | dismiss แล้วยังกลับมา |
| Low | MQM Score 0.0 | ต้อง investigate score recalculation |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 + React 19 + Tailwind CSS v4 + shadcn/ui |
| Backend | Supabase (Auth + PostgreSQL + Storage + Realtime) |
| ORM | Drizzle ORM |
| Queue | Inngest (durable functions) |
| AI | OpenAI GPT-4o-mini (L2) + Anthropic Claude Sonnet (L3) |
| Testing | Vitest + Playwright |
| CI/CD | GitHub Actions (quality-gate + e2e-gate) |

---

## Roadmap (Remaining)

```
Epic 6 (Team Collaboration) ─────── กำลังทำ (~2 weeks remaining)
Epic 7 (Auto-Pass)          ─────── ถัดไป
Epic 8 (Reporting)          ─────── ตาม
Epic 9 (AI Learning)        ─────── ตาม
Epic 10 (Auto-fix)          ─────── Growth phase
```

---

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| AI cost escalation | Budget check ก่อนทุก call + cost dashboard + Economy mode default |
| Multi-tenant data leak | RLS Day 1 + withTenant() on every query + RLS tests |
| Pipeline failure | Inngest retry + onFailure handler + NonRetriableError classification |
| CJK/Thai text issues | Full ICU required + Intl.Segmenter + language-specific rules |

---

---

## Screenshots แนะนำแนบ (10 รูปหลัก)

| # | ไฟล์ | อธิบาย |
|---|------|--------|
| 1 | `screenshots/01-login-page.png` | หน้า Login |
| 2 | `screenshots/03-dashboard-empty.png` | Dashboard + Onboarding tour |
| 3 | `screenshots/05-create-project-dialog.png` | สร้าง Project (15 ภาษา) |
| 4 | `screenshots/09-upload-parsed.png` | Upload + Parse ไฟล์ SDLXLIFF |
| 5 | `screenshots/10-processing-started.png` | เลือก Economy/Thorough mode |
| 6 | `screenshots/23-review-page-clean.png` | Review Panel — findings + filters + keyboard shortcuts |
| 7 | `screenshots/25-dashboard-with-data.png` | Dashboard มีข้อมูลจริง (L2 + L3 completed) |
| 8 | `screenshots/18-admin-taxonomy.png` | Taxonomy Mapping (74 rules) |
| 9 | `screenshots/19-admin-ai-usage.png` | AI Usage Dashboard + Spend Trend |
| 10 | `screenshots/28-projects-qa-reviewer.png` | QA Reviewer role — no admin access |

*Report generated from automated UI tour + codebase analysis on 2026-04-03*
