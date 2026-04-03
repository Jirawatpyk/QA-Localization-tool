# Deep Functional Verification Checklist

**Date:** 2026-04-03
**Purpose:** Verify ALL implemented features match UX spec — not just surface UI
**Method:** Playwright MCP browser testing
**Status:** IN PROGRESS

---

## 1. Glossary (Epic 1)

### Import Flow
- [x] Click "Import Glossary" → dialog opens with file input ✅ (screenshot: deep-01)
- [x] Upload CSV file → shows column mapping step ✅ (screenshot: deep-02, deep-03)
- [ ] Upload TBX file → parses terminology entries — NOT TESTED YET
- [ ] Upload XLSX file → shows column mapping step — NOT TESTED YET
- [ ] Invalid file type → error message — NOT TESTED YET
- [ ] Oversize file (>10MB) → error message — NOT TESTED YET
- [ ] After import → glossary terms display in table — NOT TESTED YET
- [ ] Term count shown after import — NOT TESTED YET

### Import Flow — Findings
- **FINDING G-01:** Column mapping shows default "source"/"target" instead of auto-detecting CSV column headers ("Description","en","de-AT","fr"). User must manually type correct column names. UX spec says auto-detect. **Priority: P2**
- **FINDING G-02:** File input uses native browser `<input type="file">` showing "เลือกไฟล์" in Thai — unstyled, inconsistent with drag-drop pattern on Upload page. **Priority: P2 (= UX-NEW-01, in sprint S-UX-4)**
- **FINDING G-03:** "Next: Column Mapping" button properly disabled until file selected ✅

### Glossary Display
- [ ] Table shows: Source term, Target term, language pair — NOT TESTED (no terms imported yet)
- [ ] Search/filter glossary terms — NOT TESTED
- [ ] Edit glossary term inline — NOT TESTED
- [ ] Delete glossary term — NOT TESTED
- [ ] Export glossary — NOT TESTED

### UX Spec Check
- [ ] "Precomputed index at import time" — instant match per run — NOT TESTED
- [x] UX spec: file input should be styled → **FAIL** (native input, G-02)

---

## 2. Taxonomy Editor (Epic 1)

### Display
- [x] Two-column: QA Cosmetic Term → MQM Category ✅
- [x] Shows MQM Parent, Severity, Description columns ✅ (Description truncated)
- [x] 74 mappings visible ✅
- [x] Actions column: Edit + Delete buttons per row ✅ (screenshot: deep-04)

### Display — Findings
- **FINDING T-01:** Description column text truncated with no tooltip/expand — user can't read full description. **Priority: P3**
- **FINDING T-02:** Stale E2E test data rows ("E2E Edit 1775020942885") visible in production taxonomy. Not a code bug but data cleanup needed. **Priority: P3**

### Edit Flow
- [x] Click Edit button → row becomes editable inline ✅ (screenshot: deep-05)
- [ ] Change MQM category via dropdown → **FAIL: renders as free text input, not dropdown** — UX spec says "dropdown selects correct MQM term"
- [x] Change severity → dropdown (major/minor/critical/enhancement) ✅
- [ ] Save changes → **FINDING: no explicit Save/Cancel buttons in edit mode** — unclear how to confirm or cancel edit
- [x] Add new mapping → "Add Mapping" button visible ✅

### Edit Flow — Findings
- **FINDING T-03:** MQM Category is free text input instead of dropdown selector. UX spec: "Click to edit, dropdown selects correct MQM term". Free text allows typos and invalid categories. **Priority: P2**
- **FINDING T-04:** No Save/Cancel buttons in edit mode. User doesn't know how to confirm changes. UX spec: "Save/Reset buttons". **Priority: P2**

### Drag & Drop
- [x] Drag handles visible (6-dot icon) ✅
- [ ] Reorder mappings via drag — NOT TESTED (functional)
- [ ] Order persists after save — NOT TESTED

### UX Spec Check
- [ ] "Mapping preview — shows how findings will be tagged in reports" — NOT VISIBLE
- [ ] "Validation — warn if QA term maps to multiple MQM terms" — NOT TESTED

---

## 3. Review Panel — Core Loop (Epic 4)

### Finding Card Display (per UX spec)
- [ ] Severity badge: colored icon (XCircle/AlertTriangle/Info) + text label
- [ ] Error type: QA Cosmetic term displayed
- [ ] Layer badge: "Rule" (blue) or "AI" (purple)
- [ ] Source text with error portion highlighted
- [ ] Target text with error portion highlighted
- [ ] AI suggestion: proposed fix in italic (AI findings only)
- [ ] Confidence indicator: colored dot + percentage (High/Medium/Low)
- [ ] Quick action buttons (Accept ✓ / Reject ✗)

### 7 Review Actions
- [ ] [A] Accept → finding accepted, green tint, auto-advance
- [ ] [R] Reject → finding rejected, red tint, auto-advance
- [ ] [F] Flag → for native review (yellow tint)
- [ ] [N] Note → stylistic observation, no penalty
- [ ] [S] Source Issue → problem in source text
- [ ] [-] Severity Override → change severity level
- [ ] [+] Add Finding → manually add new finding

### Finding States (8 states per UX spec)
- [ ] Pending (default) — white background
- [ ] Accepted — green tint
- [ ] Re-accepted — green + override badge
- [ ] Rejected — red tint, dimmed
- [ ] Flagged — yellow tint, flag icon
- [ ] Noted — blue tint, note icon
- [ ] Source Issue — purple tint, source icon
- [ ] Manual — amber background, "Manual" badge

### Keyboard Navigation
- [ ] J / ↓ → next finding
- [ ] K / ↑ → previous finding
- [ ] A → accept focused finding
- [ ] R → reject focused finding
- [ ] F → flag focused finding
- [ ] N → note
- [ ] S → source issue
- [ ] + → add finding
- [ ] - → severity override
- [ ] Ctrl+Z → undo last action
- [ ] ] or Alt+↓ → next file in batch
- [ ] [ or Alt+↑ → previous file in batch
- [ ] Alt+Home → back to batch summary
- [ ] Ctrl+K → command palette (DEFERRED → E7)
- [ ] Ctrl+Enter → focus mode (DEFERRED → E7)
- [ ] Ctrl+F → toggle filter panel
- [ ] Ctrl+B → bulk select mode
- [ ] Escape → back to list / close panel
- [ ] Shortcuts suppressed in input/textarea/select

### Filter Bar
- [ ] Severity filter: All / Critical / Major / Minor — with counts
- [ ] Layer filter: All / Rule-based / AI — with counts
- [ ] Status filter: All / Pending / Accepted / Rejected / Flagged
- [ ] Category filter: dynamic categories from findings
- [ ] Confidence filter: All / High / Medium / Low
- [ ] "Showing X of Y findings" counter updates on filter
- [ ] Multiple filters combine (AND logic)

### Bulk Operations (UX spec safety rules)
- [ ] Shift+Click or Shift+J/K → multi-select
- [ ] Bulk action bar appears: "N findings selected | [Bulk Accept] [Bulk Reject] [Clear]"
- [ ] Critical findings: bulk accept DISABLED with tooltip "Critical findings must be reviewed individually"
- [ ] Major findings: bulk accept requires CONFIRMATION dialog
- [ ] Minor + High confidence: bulk accept NO confirmation needed
- [ ] Bulk accept ≥6 items: confirmation dialog with summary
- [ ] Bulk accept >10 findings → spot check 2-3 random samples shown AFTER execution
- [ ] Ctrl+Z undoes entire bulk action (atomic)
- [ ] Ctrl+A select all visible findings
- [ ] Ctrl+Shift+A / Ctrl+Shift+R → bulk accept / bulk reject selected

### Auto-Accept (Safeguard #1 per UX spec)
- [ ] High confidence (>90%) + Minor severity → auto-accepted with "⚡ Auto-accepted" badge
- [ ] Auto-accepted: green tint + ⚡ badge
- [ ] Configurable per-project in Settings

### Triage Mode (Edge Case #1 per UX spec)
- [ ] Auto-activates when findings > 50
- [ ] Shows Critical + Major only
- [ ] Minor collapsed: "and N Minor findings (tap to expand)"
- [ ] "Triage Mode" badge visible on filter bar

### Concurrent Reviewer (Edge Case #3)
- [ ] Soft lock on first Accept/Reject/Flag (not on open)
- [ ] "In review by {name}" banner for second viewer
- [ ] View-only mode: actions disabled
- [ ] Lock timeout: 30 min + 25-min warning

### Rejection Flow Details
- [ ] After reject → optional reason dropdown: False positive / Already fixed / Intentional / Other
- [ ] "Other" → free text input
- [ ] After 3+ rejects of same pattern → toast: "Suppress this pattern?"
- [ ] Suppression scope options: This file / This language pair / All language pairs

### Score Feedback
- [ ] Score badge shows phase: "97 (Rule-based)" → "Analyzing..." → "72 (Final)"
- [ ] Score change animation: slide up (increase, green) / slide down (decrease, orange) 300ms
- [ ] Score change toast: "Score updated: AI found 2 Critical issues"

### Auto-Advance
- [ ] After Accept → focus moves to next pending finding
- [ ] After Reject → focus moves to next pending finding
- [ ] After Flag → focus moves to next pending finding
- [ ] No focus steal on mount

### Undo
- [ ] Ctrl+Z undoes last action
- [ ] Max 20 undo stack
- [ ] Bulk = 1 undo entry
- [ ] Undo stack clears on file switch

### Score
- [ ] Score badge visible (top-right)
- [ ] "AI Screened" label
- [ ] Approve button visible
- [ ] Score should update after accept/reject (BUG-7 — currently broken)

### Progress
- [ ] "Reviewed: X/Y" with progress bar
- [ ] "AI: L2 complete" or "AI: complete" progress bar
- [ ] Severity breakdown: Critical: N, Major: N, Minor: N, Total: N

---

## 4. Language Bridge (Epic 5)

### Setup
- [ ] Login as non-native reviewer (user whose native lang ≠ file target)
- [ ] Open review page → Language Bridge panel should appear

### Back-Translation Display
- [ ] Back-translation: English equivalent of target segment visible
- [ ] AI explanation: why finding matters
- [ ] Confidence indicator: separate from finding confidence
- [ ] "When in doubt, Flag" guidance text
- [ ] `lang` attribute on BT text elements

### Non-Native Auto-Tag
- [ ] Accept by non-native → tagged "subject to native audit"
- [ ] Tag is write-once (never cleared)

### Flag for Native
- [ ] Flag action available for non-native only
- [ ] Flagged findings route to native reviewers
- [ ] Notification sent to native reviewer

---

## 5. File Assignment (Epic 6)

### Assignment Flow
- [ ] History page → "Assign" button per file
- [ ] Click Assign → ReviewerSelector opens
- [ ] Reviewer list filtered by language pair
- [ ] Workload shown per reviewer
- [ ] Assign → success toast + audit log

### Urgency
- [ ] Urgency flag toggle visible
- [ ] Urgent file → red badge in reviewer queue

### Soft Lock
- [ ] File assigned → second user sees "In review by {name}"
- [ ] "View Read-Only" / "Take Over" options
- [ ] Take over → notification to original assignee

---

## 6. Upload & Processing (Epic 2-3)

### Upload
- [ ] Drag & drop zone accepts files
- [ ] Click to browse works
- [ ] File type validation (.sdlxliff, .xlf, .xliff, .xlsx)
- [ ] Size validation (max 15MB)
- [ ] Multiple files supported (up to 50)
- [ ] Parse progress per file ("Parsing..." → "Parsed (N segments)")

### Processing Mode Dialog
- [ ] Economy card: L1+L2, ~30s/file, $0.40/100K words
- [ ] Thorough card: L1+L2+L3, ~2min/file, $2.40/100K words, "Recommended"
- [ ] Cost estimation shown
- [ ] "vs. manual QA" comparison

### Pipeline Status
- [ ] History shows status progression (UX spec: 5-phase)
- [ ] Score updates after pipeline complete (BUG-7 — currently broken)

---

## 7. Dashboard (Epic 1)

### KPI Cards
- [ ] Recent Files: count + icon
- [ ] Pending Reviews: count + icon
- [ ] Auto-pass: status display
- [ ] Team Activity: count + icon

### Recent Files Table
- [ ] File name, Project, Score, Status columns
- [ ] Status badges human-friendly (UX-NEW-03 — currently raw)
- [ ] File rows clickable to review (UX-NEW-04 — currently not clickable)

### Onboarding
- [ ] Welcome tour: appears for new user
- [ ] Dismiss → doesn't repeat (UX-NEW-02 — currently repeats on dashboard)

---

## 8. Admin Pages (Epic 1)

### User Management
- [ ] User table: Name, Email, Role, Joined
- [ ] Role dropdown: Admin / QA Reviewer / Native Reviewer
- [ ] Add User button → dialog
- [ ] Language pairs per reviewer (UX-NEW-14 — not implemented)

### AI Usage
- [ ] KPI cards: Total Cost, Files Processed, Avg Cost/File, Projected
- [ ] Period selector: 7d / 30d / 90d
- [ ] Spend Trend chart
- [ ] L2/L3 Breakdown toggle
- [ ] Export CSV

### Suppression Rules
- [ ] Empty state with description
- [ ] Rules auto-created from review reject patterns

---

## 9. Cross-Cutting UI Design Check

### Layout (per visual-design-foundation.md)
- [ ] Top Bar: 48px height, Logo + Breadcrumb + Notifications + User
- [ ] Sidebar: 48px collapsed / 240px expanded
- [ ] Main Content: flexible width
- [ ] Detail Panel: 400px at ≥1440px (UX-NEW-11 — not implemented, deferred)
- [ ] Status Bar: 32px persistent (UX-NEW-09 — not implemented, deferred)

### Typography
- [ ] UI text: Inter (sans-serif)
- [ ] Segment text: JetBrains Mono (monospace)
- [ ] Body text: 13px minimum
- [ ] Thai text: adequate line-height (1.6+)
- [ ] Headings: proper H1-H6 hierarchy

### Color / Contrast
- [ ] Critical: red badge, white text, 4.5:1
- [ ] Major: orange badge, white text, 4.5:1
- [ ] Minor: yellow badge, dark text, 4.5:1
- [ ] Confidence High: green
- [ ] Confidence Medium: amber
- [ ] Confidence Low: red
- [ ] Color never sole information carrier (icon + text always)

### Toasts (per ux-consistency-patterns.md)
- [ ] Success: bottom-right, 3s auto-dismiss, green
- [ ] Info: bottom-right, 4s
- [ ] Warning: bottom-right, 5s manual dismiss
- [ ] Error: top-center, persistent until dismissed
- [ ] Max 1 toast at a time (queued)

### Accessibility
- [ ] Skip to main content link (UX-NEW-18 — in sprint)
- [ ] Focus ring: 2px on all interactive elements
- [ ] aria-live regions for dynamic content
- [ ] Keyboard-only full review possible
- [ ] Screen reader landmarks: nav, main, complementary
- [ ] Modal focus trap on dialogs

---

## Findings Log

| # | Feature | Finding | Priority | Action |
|---|---------|---------|----------|--------|
| G-01 | Glossary Import | Column mapping defaults "source"/"target" instead of auto-detecting CSV headers | P2 | Add to sprint or TD |
| G-02 | Glossary Import | Native file input unstyled "เลือกไฟล์" | P2 | = UX-NEW-01 (in S-UX-4) |
| T-01 | Taxonomy | Description column truncated, no tooltip | P3 | TD |
| T-02 | Taxonomy | Stale E2E test data in production | P3 | Data cleanup |
| T-03 | Taxonomy | MQM Category is free text input, not dropdown | P2 | Add to sprint or TD |
| T-04 | Taxonomy | No Save/Cancel buttons in edit mode | P2 | Add to sprint or TD |

### Progress Summary

| Section | Items | Tested | Passed | Failed/Gap | Not Tested |
|---|---|---|---|---|---|
| 1. Glossary | 17 | 4 | 2 | 2 (G-01, G-02) | 13 |
| 2. Taxonomy | 14 | 8 | 5 | 3 (T-01, T-03, T-04) | 6 |
| 3. Review Panel | 72 | 0 | 0 | 0 | 72 |
| 4. Language Bridge | 9 | 0 | 0 | 0 | 9 |
| 5. File Assignment | 9 | 0 | 0 | 0 | 9 |
| 6. Upload & Processing | 12 | 0 | 0 | 0 | 12 |
| 7. Dashboard | 9 | 0 | 0 | 0 | 9 |
| 8. Admin | 10 | 0 | 0 | 0 | 10 |
| 9. Cross-Cutting | 22 | 0 | 0 | 0 | 22 |
| **Total** | **174** | **12** | **7** | **5** | **162** |

**Completion: 7% (12/174 tested) — IN PROGRESS**

*Testing continues in next session for sections 3-9*
