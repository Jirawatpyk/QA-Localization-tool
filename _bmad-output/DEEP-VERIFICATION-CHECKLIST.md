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
- [x] Severity badge: colored icon (AlertTriangle for Major) + text label ✅
- [x] Error type: category displayed ("Accuracy", "Fluency") ✅
- [x] Layer badge: "AI" (purple-ish) / "Rule" (blue) ✅
- [x] Source → Target text: "© 2024 Starbucks..." → "© 2024 Starbucks..." ✅
- [ ] Source text with error portion **highlighted** → **FAIL: no pink highlight on error portion, shows full segment**
- [ ] Target text with error portion **highlighted** → **FAIL: same, no highlight**
- [ ] AI suggestion: proposed fix in italic → **FAIL: no inline suggestion on card, only in detail panel as explanation**
- [x] Confidence indicator: "High (90%)", "Medium (80%)" with colored badge ✅
- [x] Quick action buttons: Accept ✓ / Reject ✗ on each card ✅

### Finding Card — Findings
- **FINDING R-01:** Source/target text NOT highlighted — UX spec says "error portion highlighted (light pink background)". Currently shows full segment text truncated. **Priority: P2**
- **FINDING R-02:** AI suggestion NOT shown inline on card — UX spec says "Proposed fix text in italic". Suggestion only visible in expanded detail panel. **Priority: P2**
- **FINDING R-03:** Quick actions show only Accept/Reject — UX spec says "Action buttons: A/R/F/N/S/+". Flag/Note/Source/Add missing from card inline. Only available in detail panel (Accept/Reject/Flag) or bottom toolbar. **Priority: P2**

### 7 Review Actions
- [x] [A] Accept → finding accepted, auto-advance ✅ (tested: Reviewed 1/52)
- [x] [R] Reject → finding rejected, auto-advance ✅ (tested: Reviewed 2/52, status "Finding rejected")
- [x] [F] Flag → for native review, auto-advance ✅ (tested: Reviewed 3/52, status "Finding flagged")
- [x] [N] Note → stylistic observation, auto-advance ✅ (tested: "Finding noted. 4 of 52 reviewed")
- [x] [S] Source Issue → auto-advance ✅ (tested: "Finding marked as source issue. 5 of 52 reviewed")
- [x] [-] Severity Override → dropdown: Critical/Major/Minor ✅ (screenshot: deep-10)
- [ ] [+] Add Finding → **UNCLEAR: key pressed but no visible dialog/form appeared** — needs investigation

### 7 Review Actions — Findings
- **FINDING R-04:** [+] Add Finding via keyboard doesn't show visible response. May require a different flow (e.g. select segment first). UX spec says "select segment, specify error type + severity". **Priority: P2 — investigate**

### Finding States (8 states per UX spec)
- [x] Pending (default) — white/neutral background ✅
- [x] Accepted — auto-advance + hidden from Pending filter ✅
- [ ] Re-accepted — NOT TESTED (need to undo accept then re-accept)
- [x] Rejected — auto-advance + hidden from Pending filter ✅
- [x] Flagged — auto-advance ✅
- [x] Noted — auto-advance ✅
- [x] Source Issue — auto-advance ✅
- [ ] Manual — NOT TESTED (Add Finding not working via keyboard)
- [ ] **FINDING R-05:** Finding states don't show colored tints per UX spec — accepted/rejected/flagged findings are hidden by Pending filter, not shown with colored backgrounds. UX spec says "Green tint (accepted), Red tint (rejected), Yellow tint (flagged)". **Priority: P2**

### Keyboard Navigation
- [x] J / ↓ → next finding ✅ (tested: focus moved with blue border)
- [x] K / ↑ → previous finding ✅ (tested: moved back)
- [x] A → accept focused finding ✅
- [x] R → reject focused finding ✅
- [x] F → flag focused finding ✅
- [x] N → note ✅
- [x] S → source issue ✅
- [ ] + → add finding — **UNCLEAR** (R-04)
- [x] - → severity override dropdown ✅
- [x] Ctrl+Z → undo last action ✅ ("Undone: marked as source issue finding")
- [ ] ] or Alt+↓ → next file in batch — NOT TESTED
- [ ] [ or Alt+↑ → previous file in batch — NOT TESTED
- [ ] Alt+Home → back to batch summary — NOT TESTED
- [ ] Ctrl+K → command palette (DEFERRED → E7)
- [ ] Ctrl+Enter → focus mode (DEFERRED → E7)
- [ ] Ctrl+F → toggle filter panel — NOT TESTED
- [ ] Ctrl+B → bulk select mode — NOT TESTED
- [x] Escape → close detail panel ✅
- [ ] Shortcuts suppressed in input/textarea/select — NOT TESTED

### Filter Bar
- [x] Severity filter: All / Critical / Major / Minor — with `aria-pressed` ✅
- [x] Layer filter: All / Rule-based / AI ✅
- [x] Status filter: All / Pending / Accepted / Rejected / Flagged — Pending default ✅
- [x] Category filter: Accuracy / Fluency / completeness / punctuation / tag_integrity ✅
- [x] Confidence filter: All / High / Medium / Low ✅
- [x] "Showing X of Y findings" counter updates ✅ (48 of 52 after actions)
- [ ] Multiple filters combine (AND logic) — NOT TESTED

### Filter Bar — Findings
- **FINDING R-06:** Category filter labels are raw lowercase: "completeness", "punctuation", "tag_integrity" — UX spec says Title Case labels. **Priority: P2 (= UX-NEW-12, in sprint S-UX-4)**
- **FINDING R-07:** Status filter missing "Noted" and "Source Issue" options — only shows All/Pending/Accepted/Rejected/Flagged. UX spec defines 8 states. **Priority: P2**
- **FINDING R-08:** Filter buttons don't show finding counts — UX spec says "Critical (2)", "Major (11)" etc. Currently just labels without counts. **Wait — rechecking from earlier snapshot, counts were present on first load. May be a state issue after actions.** — NEEDS RECHECK

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

### Detail Panel (Finding Detail)
- [x] Opens as `role="complementary"` with `aria-label="Finding Detail"` ✅
- [x] Status region: "Viewing major Accuracy finding" ✅
- [x] Severity badge + Category in panel ✅
- [x] Layer (AI) + Status (Pending) badges ✅
- [x] AI explanation text: "The target text is identical to the source text..." ✅
- [x] Confidence: "High (90%)" + Model: "gpt-4o-mini" ✅
- [x] Segment Context: Seg 1/2/3 with source/target + context range selector (±1/±2/±3) ✅
- [x] Navigate to finding in segment buttons ✅
- [x] Language Bridge section: Back-translation + Contextual Explanation + confidence ✅
- [x] Refresh back-translation button ✅
- [x] Review actions toolbar: Accept / Reject / Flag ✅
- [x] Close button ✅

### Detail Panel — Findings
- **FINDING R-09:** Detail panel actions only show 3 buttons (Accept/Reject/Flag) — missing Note (N), Source Issue (S), Severity Override (-), Add Finding (+). UX spec defines all 7 actions. Keyboard shortcuts work for N/S/- but no buttons in panel. **Priority: P2**
- **FINDING R-10:** Detail panel opens as overlay (sliding from right) — UX spec says "Detail Panel always visible in review mode (400px)" as persistent side panel, not overlay. Currently panel covers main content. **Priority: P2 (= UX-NEW-11, deferred E7)**
- **FINDING R-11:** Language Bridge shows for admin user (mona-tour-test) reviewing EN→TH — this is correct IF admin's native language ≠ Thai. But UX spec says "Only shows if reviewer's native language ≠ file target language". Need to verify native language config. **Priority: P3 — verify**

### Score
- [x] Score badge visible (top-right): "0.0" ✅
- [x] "AI Screened" label ✅
- [x] Approve button visible ✅
- [ ] Score should update after accept/reject → **FAIL: stays 0.0 after 5 actions** (BUG-7 / TD-UX-011, in sprint S-UX-3)

### Progress
- [x] "Reviewed: X/Y" with progress bar ✅ (updates correctly: 0→1→2→3→4→5→4 after undo)
- [x] "AI: L2 complete" progress bar ✅
- [x] Severity breakdown: Critical: 2, Major: 11, Minor: 39, Total: 52 ✅
- [ ] **FINDING R-12:** Progress shows "AI: L2 complete" — UX spec says 3-phase indicator showing L1/L2/L3 separately. **Priority: P2 (= UX-NEW-08, in sprint S-UX-4)**

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
| R-01 | Review Card | Source/target text NOT highlighted (no pink background on error portion) | P2 | Add to sprint |
| R-02 | Review Card | AI suggestion NOT shown inline on card — only in detail panel | P2 | Add to sprint |
| R-03 | Review Card | Quick actions only Accept/Reject — missing F/N/S/+ on card | P2 | Design choice or gap |
| R-04 | Review Actions | [+] Add Finding keyboard doesn't show dialog | P2 | Investigate |
| R-05 | Review States | Finding state colored tints not visible (hidden by Pending filter) | P2 | UX design review |
| R-06 | Review Filters | Category labels lowercase: "completeness", "tag_integrity" | P2 | = UX-NEW-12 (in S-UX-4) |
| R-07 | Review Filters | Status filter missing "Noted" and "Source Issue" options | P2 | Add to sprint |
| R-08 | Review Filters | Filter button counts — need recheck if showing on fresh load | P3 | Recheck |
| R-09 | Detail Panel | Only 3 action buttons (A/R/F) — missing N/S/-/+ buttons | P2 | Add buttons |
| R-10 | Detail Panel | Opens as overlay, not persistent 400px side panel | P2 | = UX-NEW-11 (deferred E7) |
| R-11 | Detail Panel | Language Bridge shows for admin — verify native language config | P3 | Verify |
| R-12 | Review Progress | "AI: L2 complete" instead of 3-phase L1/L2/L3 indicator | P2 | = UX-NEW-08 (in S-UX-4) |

### Progress Summary

| Section | Items | Tested | Passed | Failed/Gap | Not Tested |
|---|---|---|---|---|---|
| 1. Glossary | 17 | 4 | 2 | 2 (G-01, G-02) | 13 |
| 2. Taxonomy | 14 | 8 | 5 | 3 (T-01, T-03, T-04) | 6 |
| 3. Review Panel | 72 | 40 | 28 | 12 (R-01~R-12) | 32 |
| 4. Language Bridge | 9 | 3 | 3 | 0 | 6 |
| 5. File Assignment | 9 | 0 | 0 | 0 | 9 |
| 6. Upload & Processing | 12 | 0 | 0 | 0 | 12 |
| 7. Dashboard | 9 | 0 | 0 | 0 | 9 |
| 8. Admin | 10 | 0 | 0 | 0 | 10 |
| 9. Cross-Cutting | 22 | 0 | 0 | 0 | 22 |
| **Total** | **174** | **55** | **38** | **17** | **119** |

**Completion: 32% (55/174 tested) — IN PROGRESS**

### Gap Summary So Far
- **Total new gaps found: 17** (5 Glossary/Taxonomy + 12 Review Panel)
- **Already in sprint:** 3 (R-06=UX-NEW-12, R-10=UX-NEW-11, R-12=UX-NEW-08)
- **Need to add to sprint:** ~8 new items (R-01, R-02, R-04, R-05, R-07, R-09, T-03, T-04)
- **Deferred/investigate:** 6

*Testing continues for sections 4-9*
