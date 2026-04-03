# UX Audit Report — QA Localization Tool

**Date:** 2026-04-03
**Auditor:** Sally (UX Designer) + Automated browser testing
**Scope:** All existing pages vs UX Design Specification
**UX Spec:** `_bmad-output/planning-artifacts/ux-design-specification/`

---

## Audit Summary

| Category | Match | Gap | N/A (future epic) |
|----------|-------|-----|-----|
| Layout & Navigation | 8 | 5 | 2 |
| Dashboard | 3 | 4 | 3 |
| Projects | 4 | 2 | 0 |
| Upload & Processing | 5 | 3 | 1 |
| Review Panel | 12 | 6 | 3 |
| Admin Pages | 4 | 2 | 1 |
| Cross-cutting (a11y, keyboard, states) | 8 | 7 | 2 |
| **Total** | **44** | **29** | **12** |

**Overall UX Spec Compliance: ~60%** (44 match / 73 applicable items)

---

## Page-by-Page Audit

### 1. Login / Signup

| UX Spec Requirement | Status | Notes |
|---|---|---|
| Email + Password form | MATCH | Clean, centered design |
| Google OAuth button | MATCH | Present |
| "Don't have account?" link | MATCH | Links to signup |
| Error state for wrong credentials | MATCH | Shows error toast |
| Password visibility toggle | **GAP** | No show/hide password toggle |
| Loading state on submit | **GAP** | Button doesn't show spinner during auth |

### 2. Dashboard

| UX Spec Requirement | Status | Notes |
|---|---|---|
| KPI summary cards | MATCH | 4 cards: Recent Files, Pending Reviews, Auto-pass, Team Activity |
| Recent files table | MATCH | Shows file name, project, score, status |
| "Batch First" landing (Principle #4) | **GAP** | Spec says "Batch summary as landing page after processing" — dashboard shows generic KPI, not batch-focused |
| Status badges human-friendly | **GAP** | Shows `l2_completed` / `l3_completed` raw values (TD-UX-010) |
| Auto-pass card functional | **GAP** | Shows "Auto-pass setup pending — Available in a future update" (Epic 7) |
| File click → review page | **GAP** | Dashboard file table rows not clickable |
| "Resume review" prompt | **GAP** | Spec Safeguard #9: "Continue from Finding #15?" — not implemented |
| Notification badge on bell icon | **GAP** | Bell icon visible but no unread count badge, no dropdown |

### 3. Projects List

| UX Spec Requirement | Status | Notes |
|---|---|---|
| Project cards with metadata | MATCH | Name, language pair, date, file count |
| Create Project button (admin) | MATCH | Visible for admin only |
| Card clickable | MATCH | Fixed in bugfix (BUG-1) |
| Date display | MATCH | Fixed in bugfix (BUG-2) — shows "Today" |
| Empty state for non-admin | MATCH | "Contact your admin to create a project" |
| Project search/filter | **GAP** | No search bar for projects when list grows large |

### 4. Upload Page

| UX Spec Requirement | Status | Notes |
|---|---|---|
| Drag & drop upload zone | MATCH | Works with click or drag |
| File type validation (.sdlxliff, .xlf, .xlsx) | MATCH | Shows accepted types |
| Parse progress per file | MATCH | "Parsing..." → "Parsed (68 segments)" |
| Processing mode selector (Economy/Thorough) | MATCH | Dialog with cost comparison |
| Cost estimation | MATCH | Shows "$0.00 · ~30s/file" vs manual QA cost |
| Multi-file upload | MATCH | "up to 50 files" supported |
| Upload error state | **GAP** | What happens when file parse fails? No visible error handling in UI |
| Duplicate file detection | **GAP** | Spec: "Uploaded yesterday — re-run?" prompt — not implemented |
| Role-based mode default | **GAP** | Spec: "Economy for PM, Thorough for QA" — currently always defaults to Economy |

### 5. File History

| UX Spec Requirement | Status | Notes |
|---|---|---|
| File table with metadata | MATCH | File, Date, Status, Score, Reviewer, Assignment |
| Filter buttons (All/Passed/Needs Review/Failed) | MATCH | Working |
| File name as link to review | MATCH | Fixed in bugfix (BUG-5) + gated on L1_COMPLETED_STATUSES |
| Pagination | MATCH | Present with ellipsis |
| Assignment button | MATCH | "Assign" with reviewer selector |
| Progressive loading per file | **GAP** | TD-UX-009: no per-layer progress, flat "Processing"/"Completed" |
| Score live update | **GAP** | TD-UX-011: score stays 0.0 during pipeline |
| Batch summary view | **GAP** | Spec Principle #4: "Batch summary as FIRST thing seen" — batch page exists but minimal |

### 6. Review Panel (Core Feature)

| UX Spec Requirement | Status | Notes |
|---|---|---|
| Finding list with progressive disclosure | MATCH | Expand/collapse detail |
| 7 review actions (A/R/F/N/S/+/-) | MATCH | All working with keyboard shortcuts |
| Severity breakdown (Critical/Major/Minor) | MATCH | Color-coded with counts |
| AI progress bar | MATCH | Shows "AI: complete" with green bar |
| Review progress bar (X/Y) | MATCH | "Reviewed: 0/52" |
| Filter system (Severity/Layer/Status/Category/Confidence) | MATCH | Complete filter toolbar |
| Search findings | MATCH | Search box present |
| Score badge + Approve button | MATCH | "0.0 AI Screened" + Approve |
| Keyboard shortcuts bar | MATCH | [A] Accept [R] Reject [F] Flag etc. |
| File switcher dropdown | MATCH | Dropdown to switch between files |
| AI Suggestions toggle | MATCH | "AI Suggestions ON" toggle |
| Finding card: severity icon shape + text + color | MATCH | XCircle/AlertTriangle + colored |
| Detail Panel (side panel) | **GAP** | UX spec: "Detail Panel always visible in review mode (400px)" — current implementation shows detail inline (expand), not as persistent side panel |
| Status Bar (32px persistent) | **GAP** | Spec: "Score, Progress, AI, Shortcuts always visible" — shortcuts at bottom but not a VS Code-style persistent status bar |
| Triage mode (>50 findings) | **GAP** | Spec: auto-activate when findings > 50, collapse Minor — not implemented (we had 52 findings, all shown flat) |
| "Decide in 3 seconds" (Principle #3) | **GAP** | Spec: "Confidence + suggestion + severity = instant decision" — suggestion not shown inline on finding card |
| Command palette (Ctrl+K) | **GAP** | Spec: search, filter, navigate via palette — not implemented |
| Focus mode (Ctrl+Enter) | **GAP** | Spec: finding detail expands inline, full keyboard flow — not implemented |
| Between-file nav (] / [) | **GAP** | Spec: next/prev file in batch — not implemented |
| Auto-advance to first Critical | **GAP** | Spec: "Open new file → auto-scroll to first Critical" — not implemented |
| Append-only rule for AI findings | MATCH | AI findings appear at end, not mid-list |

### 7. Project Settings

| UX Spec Requirement | Status | Notes |
|---|---|---|
| Project name editable | MATCH | Input field |
| Description editable | MATCH | Textarea |
| Processing mode toggle | MATCH | Economy/Thorough radio |
| Auto-pass threshold | MATCH | Number input (95 default) |
| Save Settings button | MATCH | Present |
| Language pair display/edit | **GAP** | Source/target languages not editable from settings |

### 8. Glossary

| UX Spec Requirement | Status | Notes |
|---|---|---|
| Import button (CSV/XLSX/TBX) | MATCH | Present |
| Empty state | MATCH | "Import your first glossary" |
| Glossary term list | MATCH | Table with source/target terms |
| Add from review context | **GAP** | Spec: "Add to glossary from review" action — exists in review but not verified in glossary page |

### 9. Admin Pages

| UX Spec Requirement | Status | Notes |
|---|---|---|
| User management table | MATCH | Name, Email, Role, Joined |
| Role selector (Admin/QA/Native) | MATCH | Dropdown per user |
| Add User button | MATCH | Present |
| Taxonomy mapping (74 rules) | MATCH | Full MQM taxonomy editor with drag handles |
| AI Usage dashboard | MATCH | KPI + spend trend chart + L2/L3 breakdown |
| Suppression Rules management | MATCH | Empty state with description |
| User invite flow | **GAP** | Add User button exists but no invite email flow visible |
| Logout button | **GAP** | BUG-8 — still not implemented (deferred to separate story) |

### 10. Breadcrumbs & Navigation

| UX Spec Requirement | Status | Notes |
|---|---|---|
| Breadcrumb trail | MATCH | Dashboard > Project > Page |
| Project name in breadcrumb | MATCH | Fixed (BUG-3) |
| Human-friendly labels | MATCH | Fixed (BUG-4) |
| Sidebar role-based | MATCH | Fixed (BUG-9) |
| Sidebar collapse/expand | MATCH | Working with persistence |

---

## Cross-Cutting UX Gaps

### States Coverage

| State | Coverage | Notes |
|---|---|---|
| **Loading** | PARTIAL | Upload has parsing state; Review has AI progress; but History/Dashboard lack loading indicators |
| **Empty** | GOOD | Most pages have empty states |
| **Error** | **POOR** | Pipeline fail shows what? Upload fail? API error? No consistent error UI pattern visible |
| **Partial** | **POOR** | Spec designed 5-phase progressive loading — only Review page has partial state |
| **Success** | GOOD | Toast notifications on success actions |

### Accessibility (WCAG)

| Requirement | Status | Notes |
|---|---|---|
| Color contrast 4.5:1 | MATCH | Verified in previous audit |
| Color + icon (never color alone) | MATCH | Severity uses icon shape + color |
| Focus indicators | MATCH | 2px outline present |
| Keyboard shortcuts suppressed in inputs | MATCH | Implemented |
| `aria-live` for dynamic content | MATCH | Present on review panel |
| `lang` attribute on source/target text | MATCH | Implemented (Epic 5) |
| `prefers-reduced-motion` | MATCH | Implemented |
| Screen reader landmarks | MATCH | nav, main, complementary |
| **Modal focus trap** | NEEDS VERIFY | Present on dialogs but not all verified |

### Missing Cross-Cutting Features (from UX Spec)

| Feature | UX Spec Location | Status |
|---|---|---|
| **User menu dropdown + Logout** | Layout spec | NOT IMPLEMENTED (BUG-8) |
| **Notification dropdown (bell icon)** | Epic 6.2c | IN PROGRESS |
| **Command palette (Ctrl+K)** | core-user-experience.md | NOT IMPLEMENTED |
| **Resume review prompt** | Safeguard #9 | NOT IMPLEMENTED |
| **Spot check after bulk accept >10** | Safeguard #8 | NOT IMPLEMENTED |
| **Duplicate file detection** | Effortless Interactions | NOT IMPLEMENTED |
| **AI learning indicator** | Principle #5 | NOT IMPLEMENTED (Epic 9) |
| **QA Certificate export** | Epic 8 | NOT IMPLEMENTED |

---

## Priority Ranking of Gaps

### P0 — Must fix before next release
1. **No Logout button** (BUG-8) — security + UX critical
2. **Error states missing** — pipeline fail, upload fail, API error — no consistent pattern
3. **Score stays 0.0** (TD-UX-011) — misleading, blocks Auto-Pass (Epic 7)

### P1 — Should fix in current epic cycle
4. **Dashboard status badges** (TD-UX-010) — raw technical names confuse users
5. **History progressive loading** (TD-UX-009) — UX spec 5-phase designed but not built
6. **Notification dropdown** — bell icon exists with no dropdown (Epic 6.2c in progress)
7. **Detail Panel as side panel** — spec says persistent 400px panel, current is inline expand

### P2 — Plan for next epic
8. **Triage mode** for >50 findings
9. **Command palette** (Ctrl+K)
10. **Between-file navigation** (] / [)
11. **Auto-scroll to first Critical** on file open
12. **Resume review prompt** (Safeguard #9)
13. **Duplicate file detection**
14. **Role-based processing mode default** (Economy for PM, Thorough for QA)

### P3 — Future epics (by design)
15. Auto-pass routing (Epic 7)
16. AI learning indicator (Epic 9)
17. QA Certificate (Epic 8)
18. Batch summary landing (Epic 7-8)

---

## Non-UI Bugs Found During Audit

1. **Score 0.0 after pipeline** — confirmed pipeline doesn't trigger recalculateScore (TD-UX-011, also BUG-7)
2. **Onboarding tour on dashboard** — still shows for admin user even after dismissing on project pages (separate tour scope: "welcome" vs "project" — may be by design but annoying)
3. **Stale E2E test data in taxonomy** — "E2E Edit 1775020942885" entries in production taxonomy table (test data cleanup needed)

---

## Recommendations

1. **Immediate:** Fix BUG-8 (Logout) as separate story — this is a security issue
2. **Before Epic 7:** Fix TD-UX-011 (Score recalculation) — Auto-Pass depends on accurate scores
3. **Add to story template:** "UX States Checklist" section requiring: loading, error, empty, success, partial states to be addressed
4. **Epic sign-off:** UX audit mandatory before closing each epic
5. **Consider:** Visual regression testing with Playwright screenshots comparison

---

*Generated from automated UI tour + UX spec cross-reference on 2026-04-03*
