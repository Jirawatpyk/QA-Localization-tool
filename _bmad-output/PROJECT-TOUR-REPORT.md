# QA Localization Tool — Project Tour Report

**Date:** 2026-04-03
**Tested by:** Automated tour (Claude Code + Playwright)
**Test Accounts:**
- mona-tour-test@test.local (Admin)
- qa-reviewer-tour@test.local (QA Reviewer)
- native-reviewer-tour@test.local (Native Reviewer)
**Test Files:**
- AP BT Activity Guide.pptx.sdlxliff (68 segments, EN→TH) — Economy (L1+L2)
- AP BT DG Next Chapter.pptx.sdlxliff (EN→TH) — Thorough (L1+L2+L3)
**Inngest Pipeline:** Both Economy (L1+L2) and Thorough (L1+L2+L3) tested

---

## Project Progress Summary

| Epic | Description | Status | Progress |
|------|-------------|--------|----------|
| Epic 1 | Foundation & Auth | DONE | 100% |
| Epic 2 | Parser & Pipeline | DONE | 100% |
| Epic 3 | Review Panel & Scoring | DONE | 100% |
| Epic 4 | Accessibility & UX | DONE | 100% |
| Epic 5 | Language Intelligence & Non-Native Support | DONE | 100% |
| Epic 6 | File Assignment & Notifications | IN PROGRESS | ~40% |
| Epic 7 | Dashboard & Reporting | NOT STARTED | 0% |
| Epic 8 | Advanced Admin | NOT STARTED | 0% |
| Epic 9 | Export & Integration | NOT STARTED | 0% |
| Epic 10 | Performance & Scale | NOT STARTED | 0% |
| Epic 11 | Polish & Launch | NOT STARTED | 0% |

**Overall:** ~50-55% complete (5/11 epics done, 1 in-progress)

---

## Screenshot Catalog (23 screenshots)

### Auth Pages
| # | Screenshot | Page | Notes |
|---|-----------|------|-------|
| 01 | `01-login-page.png` | Login | Email/Password + Google OAuth, clean design |
| 02 | `02-signup-page.png` | Sign Up | Display Name + Email + Password + Google OAuth |

### Dashboard & Projects
| # | Screenshot | Page | Notes |
|---|-----------|------|-------|
| 03 | `03-dashboard-empty.png` | Dashboard (empty) | 4 KPI cards, onboarding tour, sidebar nav |
| 04 | `04-projects-empty.png` | Projects (empty) | Empty state with "Create Project" CTA |
| 05 | `05-create-project-dialog.png` | Create Project Dialog | Name, Description, Source/Target language (15 langs) |
| 06 | `06-projects-with-project.png` | Projects (with data) | Project card: EN→TH, file count, Settings link |

### Upload & Processing
| # | Screenshot | Page | Notes |
|---|-----------|------|-------|
| 07 | `07-upload-page.png` | Upload | Drag & drop zone, sub-nav, onboarding tooltip |
| 08 | `08-upload-file-selected.png` | Upload (parsing) | File selected, "Parsing..." status, 1.1 MB |
| 09 | `09-upload-parsed.png` | Upload (parsed) | "Parsed (68 segments)", Start Processing button |
| 10 | `10-processing-started.png` | Processing Dialog | Economy vs Thorough mode, cost estimation |
| 11 | `11-pipeline-running.png` | Upload (submitted) | File sent to pipeline, clean reset |

### File History & Pipeline
| # | Screenshot | Page | Notes |
|---|-----------|------|-------|
| 12 | `12-history-page.png` | File History (processing) | Status: "Processing", filter buttons |
| 21 | `21-history-pipeline-complete.png` | File History (complete) | Status: "Completed", MQM Score 0.0 |

### Review Panel (Core Feature)
| # | Screenshot | Page | Notes |
|---|-----------|------|-------|
| 22 | `22-review-page.png` | Review (with tooltip) | 52 findings, AI complete, severity breakdown |
| 23 | `23-review-page-clean.png` | Review (clean) | Full review UI: filters, findings, keyboard shortcuts |

### Project Sub-pages
| # | Screenshot | Page | Notes |
|---|-----------|------|-------|
| 13 | `13-settings-page.png` | Project Settings | Name, Description, Processing Mode, Auto-Pass Threshold |
| 14 | `14-glossary-page.png` | Glossary | Empty state, Import Glossary button |
| 15 | `15-batches-page.png` | Batches | 1 batch, 1 file, date display |
| 16 | `16-parity-page.png` | Xbench Parity | Upload Xbench report, Report Missing Check |

### Admin Pages
| # | Screenshot | Page | Notes |
|---|-----------|------|-------|
| 17 | `17-admin-users.png` | User Management | User table, role selector, Add User |
| 18 | `18-admin-taxonomy.png` | Taxonomy Mapping | 74 mappings, MQM categories, severity badges, drag handles |
| 19 | `19-admin-ai-usage.png` | AI Usage | KPI cards, Spend Trend chart, L2/L3 Breakdown, Export CSV |
| 20 | `20-admin-suppression-rules.png` | Suppression Rules | Empty state with description |

---

## Pipeline Test Results

| Metric | Result |
|--------|--------|
| File | AP BT Activity Guide.pptx.sdlxliff |
| Segments parsed | 68 |
| Processing mode | Economy (L1 + L2) |
| Pipeline status | Completed |
| Total findings | 52 |
| Critical | 2 (tag_integrity) |
| Major | 11 (1 Accuracy, 9 Fluency, 1 completeness) |
| Minor | 39 (punctuation) |
| Rule-based findings | 42 |
| AI findings | 10 |
| Console errors | 0 |
| MQM Score | 0.0 (Fail) |

**Pipeline verdict:** L1 + L2 pipeline works end-to-end. File upload, parsing, rule engine, AI screening, findings display, and review UI all functional.

### L3 Thorough Mode Test

| Metric | Result |
|--------|--------|
| File | AP BT DG Next Chapter.pptx.sdlxliff |
| Processing mode | Thorough (L1 + L2 + L3) |
| Pipeline status | l3_completed |
| Console errors | 0 |
| MQM Score | 0.0 |

**L3 verdict:** Thorough pipeline (L1+L2+L3 with Claude Sonnet) completes successfully. Dashboard shows "l3_completed" status.

---

## Role-Based UI Testing

| Feature | Admin | QA Reviewer | Native Reviewer |
|---------|-------|-------------|-----------------|
| Dashboard | Full KPI + file table | Same layout, empty (own tenant) | Same layout, empty (own tenant) |
| Projects: Create button | Yes | No (correct) | No (correct) |
| Projects: Empty state msg | "Create your first project" | "Contact your admin" | "Contact your admin" |
| Admin link in sidebar | Yes (correct) | **BUG: visible** (redirects) | **BUG: visible** (redirects) |
| Admin page access | Full access | Redirected to dashboard | Redirected to dashboard |
| Logout button | **MISSING** | **MISSING** | **MISSING** |
| Project Settings button | Visible on card | Not visible (correct) | Not visible (correct) |

### Role Testing Screenshots
| # | Screenshot | Description |
|---|-----------|-------------|
| 26 | `26-dashboard-qa-reviewer.png` | QA Reviewer dashboard — Admin link visible (BUG) |
| 27 | `27-admin-qa-reviewer-access.png` | QA Reviewer redirected from Admin (protection works) |
| 28 | `28-projects-qa-reviewer.png` | QA Reviewer: no Create button, correct empty state |
| 29 | `29-dashboard-native-reviewer.png` | Native Reviewer: same bugs as QA Reviewer |

---

## Bugs Found

### BUG-1: Project Card Not Clickable (Medium)
- **Location:** `src/features/project/components/ProjectCard.tsx` lines 34-70
- **Root Cause:** Card wraps content in `<Card>` which is NOT a clickable link. Only "Settings" button (lines 58-67) is wrapped in `<Link>` and is admin-only. Non-admin users have zero interactive elements.
- **Impact:** Non-admin users are stuck on the projects page — cannot enter any project
- **Fix:** Wrap entire `<Card>` in `<Link href={/projects/${id}/upload}>`. Keep Settings button separate for admin.

### BUG-2: "-1 days ago" Date Display (Low)
- **Location:** `src/features/project/components/ProjectCard.tsx` lines 17-32 (`formatRelativeDate`)
- **Root Cause:** `diffDays = Math.floor(diffMs / ...)` — when timezone causes `diffMs` to be negative, `Math.floor(-0.5)` = `-1`. Lines 22-24 only guard `=== 0` and `=== 1`, no guard for `< 0`.
- **Fix:** Add `if (diffDays <= 0) return 'Today'` before line 22

### BUG-3: Breadcrumb Shows Raw UUID (Low)
- **Location:** `src/components/layout/app-breadcrumb.tsx` lines 21-34 (`STATIC_SEGMENTS` set)
- **Root Cause:** `STATIC_SEGMENTS` includes `'settings'`, `'upload'`, `'review'` but MISSING `'files'`, `'batches'`, `'parity'`. Parser misclassifies these as dynamic entity IDs → falls through to UUID display.
- **Affected pages:** History, Batches, Parity | **Correct pages:** Settings, Upload, Review
- **Fix:** Add `'files'`, `'batches'`, `'parity'` to `STATIC_SEGMENTS` set

### BUG-4: Breadcrumb Shows kebab-case Route Names (Low)
- **Location:** `src/components/layout/app-breadcrumb.tsx` lines 42-45 (`capitalize` function)
- **Root Cause:** `capitalize()` only handles special case `'ai-usage'` → `'AI Usage'`. All other kebab-case routes go through generic `s.charAt(0).toUpperCase() + s.slice(1)` which produces "Suppression-rules" (keeps the hyphen).
- **Fix:** Update `capitalize()` to split on `'-'` and capitalize each word: `s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')`

### BUG-5: File Name Not Clickable in History Table (Medium)
- **Location:** `src/features/batch/components/FileHistoryTable.tsx` line 129
- **Root Cause:** File name cell rendered as plain `<td>` text without `<Link>` wrapper. Sibling component `FileStatusCard` (line 27-60) correctly uses `<Link href={href}>` — pattern exists but not replicated here.
- **Fix:** Wrap fileName in `<Link href={/projects/${projectId}/review/${file.fileId}}>` matching FileStatusCard pattern

### BUG-6: Onboarding Tooltip Repeats on Every Page (Low)
- **Location:** `src/features/onboarding/components/ProjectTour.tsx` lines 46-117 + `src/app/(app)/projects/[projectId]/layout.tsx` line 20
- **Root Cause:** ProjectTour mounted at project layout level → remounts on every sub-page navigation. `dismissedRef` (local ref) resets to `false` on remount. Dismissal IS persisted to DB via `updateTourState` but client-side ref state lost during navigation.
- **Fix:** Check `userMetadata?.dismissed_at_step?.project` on mount to re-sync `dismissedRef`, OR move ProjectTour to higher-level layout

### BUG-7: MQM Score 0.0 After Pipeline Complete (Medium)
- **Location:** `src/features/pipeline/inngest/processFile.ts` lines 66-122 + `src/features/pipeline/inngest/recalculateScore.ts`
- **Root Cause:** Pipeline calculates scores per-layer but does NOT emit `'finding.changed'` event after all L2/L3 findings are inserted. `recalculateScore` only triggers from review actions (finding.changed), not from pipeline completion. Score calculated with incomplete findings data → defaults to 0.
- **Fix:** Emit `'finding.changed'` event after final layer completes (all findings inserted), OR call `scoreFile()` as final pipeline step after all findings committed

### BUG-8: No Logout Button (High)
- **Location:** `src/components/layout/app-header.tsx` lines 30-35
- **Root Cause:** User button is a plain `<button>` with `aria-label="User menu"` but NO `onClick`, NO `DropdownMenu`, NO sign-out logic. `DropdownMenu` component exists in `src/components/ui/dropdown-menu.tsx` but is never imported/used here. Only sign-out in codebase is `useIdleTimeout` auto-signout after 30min.
- **Impact:** Users cannot voluntarily logout — security + UX issue
- **Fix:** Wrap button with `<DropdownMenu>` + `<DropdownMenuTrigger>` + `<DropdownMenuContent>` containing user info + Sign Out item calling `supabase.auth.signOut()`

### BUG-9: Sidebar Shows "Admin" Link for Non-Admin Roles (Medium)
- **Location:** `src/components/layout/app-sidebar.tsx` lines 12-16 (navItems array) + lines 55-70 (render loop)
- **Root Cause:** `navItems` array is hardcoded with Admin link. Component is `'use client'` with no role prop. Render loop iterates ALL items without role-based filtering. Server-side redirect works but UI leaks the link.
- **Impact:** Non-admin users see "Admin" link that redirects them — confusing UX
- **Fix:** Pass `role` prop from server layout → filter `navItems`: only show Admin for `role === 'admin'`

---

## Console Errors
- **Total across all pages: 0 errors**
- Some warnings present (non-critical)

---

## Summary

The QA Localization Tool is in solid shape at ~55% completion. Core features (auth, upload, parsing, pipeline, review, scoring, admin) are all functional. Both Economy (L1+L2) and Thorough (L1+L2+L3) pipelines work end-to-end with real AI processing. Found **9 bugs** (1 high, 3 medium, 5 low). **BUG-8 (No Logout)** is the most critical — users cannot sign out.

**Strengths:**
- Clean, professional UI design
- End-to-end pipeline works with real AI
- Rich filter system in review panel
- Keyboard shortcuts for review workflow
- Cost tracking and AI usage dashboard
- Onboarding tour for new users

**Areas for Improvement:**
- **[HIGH] Add Logout button** — currently no way to sign out
- **[MEDIUM] Hide Admin sidebar link** for non-admin roles
- **[MEDIUM] Make Project card clickable** — non-admin users stuck
- **[MEDIUM] Link file names** in History table to review page
- Navigation consistency (breadcrumbs show UUIDs/kebab-case)
- Onboarding tooltip persistence (repeats every page)
- MQM score calculation verification (shows 0.0)
