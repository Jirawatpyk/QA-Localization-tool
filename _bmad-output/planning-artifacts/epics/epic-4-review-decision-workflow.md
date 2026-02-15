# Epic 4: Review & Decision Workflow

**Goal:** Reviewers can efficiently review findings using progressive disclosure, perform 7 review actions with keyboard hotkeys, use bulk operations, suppress false positive patterns, and complete file QA in a single pass — the core daily workflow loop.

**FRs covered:** FR24, FR25, FR26, FR27, FR28, FR30, FR31, FR34, FR42, FR76, FR77, FR78, FR79, FR80
**NFRs addressed:** NFR17 (no progress lost on crash), NFR25 (WCAG 2.1 AA), NFR26 (all 7 actions keyboard-reachable), NFR27 (severity icon+text+color), NFR28 (contrast 4.5:1)
**Architecture:** FindingCard (P0), FindingCardCompact (P0), ReviewProgress (P0), Zustand `useReviewStore`, Supabase Realtime for live updates, immutable audit log per action

### Story 4.0: Review Infrastructure Setup

As a Developer,
I want the hotkey framework, accessibility foundation, and review UI shell established,
So that Stories 4.1-4.7 can build review features on a consistent, accessible, keyboard-driven foundation.

**Acceptance Criteria:**

**Given** the review feature area at `src/features/review/`
**When** the infrastructure is implemented
**Then** a `useKeyboardActions` hook is created at `src/features/review/hooks/use-keyboard-actions.ts` managing: hotkey registration/deregistration, scope-based activation (global vs component-scoped), conflict detection (warn if duplicate key binding), and modifier key support (Ctrl, Shift, Alt)
**And** the hook supports the 7 review action hotkeys: A (Accept), R (Reject), F (Flag), N (Note), S (Source Issue), - (Severity Override menu), + (Add Finding)
**And** hotkeys are disabled when: input/textarea is focused, modal is open, or Command Palette is active
**And** the hook is tested with: registration, deregistration, scope isolation, and conflict detection unit tests

**Given** the accessibility foundation
**When** the review UI shell is implemented
**Then** focus management follows logical tab order: filter bar → finding list → detail panel → action bar
**And** a `useFocusManagement` hook at `src/features/review/hooks/use-focus-management.ts` manages: focus trap in modals (Tab cycles within modal boundary), auto-advance after action (focus moves to next Pending finding), Esc hierarchy (modal → expanded card → filter → page level), and focus restore on modal close
**And** all focus indicators use: `outline: 2px solid #4f46e5` (indigo), `outline-offset: 4px`
**And** ARIA roles are established: `role="grid"` for finding list, `role="row"` for each finding, `aria-expanded` for collapsible cards, `aria-live="polite"` for score changes

**Given** the review UI shell layout
**When** the shell renders at `src/app/(dashboard)/projects/[projectId]/files/[fileId]/review/page.tsx`
**Then** the layout defines 3 zones: file navigation (left, collapsible), finding list (center), detail panel (right, Sheet component)
**And** the `useReviewStore` from Story 3.0 is wired to the review page
**And** the ReviewProgress component shell renders with placeholder data
**And** the action bar renders with all 7 action buttons (disabled until Story 4.2 implements logic)
**And** each button shows its hotkey label: "[A] Accept", "[R] Reject", "[F] Flag", "[N] Note", "[S] Source", "[-] Override", "[+] Add"

**Given** the Ctrl+? keyboard shortcut cheat sheet
**When** the user presses Ctrl+?
**Then** a modal displays all available hotkeys grouped by category: Navigation (J/K/↑/↓/Enter/Esc), Review Actions (A/R/F/N/S/-/+), Bulk Operations (Shift+Click, Ctrl+A, Ctrl+Z), Search (Ctrl+K, Ctrl+F), and Panels (Ctrl+? for this sheet)
**And** the modal is dismissable via Esc or clicking outside

### Story 4.1a: Finding List Display & Progressive Disclosure

As a QA Reviewer,
I want to see findings organized by severity with critical issues expanded first,
So that I can focus on the most important issues first.

**Acceptance Criteria:**

**Given** a file has findings from any completed pipeline layer (L1, L2, or L3)
**When** the QA Reviewer opens the file review view
**Then** findings are displayed in a FindingList (shadcn Data Table) sorted by severity: Critical first, then Major, then Minor
**And** Critical findings are auto-expanded showing full FindingCard detail (findings with severity='Critical' have `aria-expanded='true'` on load)
**And** Major findings show as collapsed FindingCardCompact rows (severity icon + category + layer badge + preview + confidence)
**And** Minor findings are collapsed under a "Minor (N)" accordion header (FR24)

**Given** a finding row in FindingCardCompact format
**When** the reviewer scans it
**Then** they see: severity icon (16px, with color+icon per NFR27), category label, layer badge (blue=Rule, purple=AI), source→target preview (truncated), confidence % (AI only), and quick action icons (Accept/Reject)

**Given** the finding list with mixed layer results
**When** L1 results are available but AI is still processing
**Then** L1 findings are displayed immediately
**And** a ReviewProgress component shows dual-track synchronized bars: (1) Reviewed count bar: "Reviewed: 0/14", (2) AI processing bar: "AI: analyzing...". States: Active (both updating), AI Complete (right bar 100%), Review Complete (left bar 100%), All Done. Animations respect prefers-reduced-motion. Shows "Processing L2..." label during AI work
**And** new AI findings appear in real-time via Supabase Realtime push, inserted at correct severity position

**Given** accessibility requirements
**When** the finding list renders
**Then** severity uses icon + text_label + color (never color alone) — EVERY severity badge contains {icon, text_label, color} and icon is distinct per severity (visually testable) (NFR27)
**And** contrast ratios meet WCAG 2.1 AA: 4.5:1 normal text, 3:1 large text (NFR28)

### Story 4.1b: Keyboard Navigation & Focus Management

As a QA Reviewer,
I want to navigate findings using keyboard shortcuts with clear focus indicators,
So that I can review 300+ findings per day efficiently without switching between mouse and keyboard.

**Acceptance Criteria:**

**Given** the finding list is displayed
**When** the reviewer uses keyboard navigation (J/↓ = next, K/↑ = previous)
**Then** focus moves between findings with visible focus indicator: `border: 2px solid #4f46e5` (indigo)
**And** pressing Enter expands a collapsed finding, Esc collapses an expanded finding
**And** focus management uses `useKeyboardActions` and `useFocusManagement` hooks from Story 4.0

**Given** all findings are navigable
**When** keyboard-only interaction is tested
**Then** all findings are reachable via keyboard only (no mouse required)
**And** focus management follows logical tab order: filter bar → finding list → detail panel → action bar (established in Story 4.0)
**And** focus wraps: pressing J/↓ on last finding cycles to first finding (optional via user preference)

### Story 4.1c: Detail Panel & Segment Context

As a QA Reviewer,
I want to see full finding details with surrounding segment context when I focus a finding,
So that I can understand each issue in its translation context and make informed review decisions.

**Acceptance Criteria:**

**Given** a finding is focused or expanded
**When** the detail panel (shadcn Sheet, right side) syncs to show the focused finding's full context
**Then** it shows: source text with highlighted issue span, target text with highlighted issue span, suggestion text, confidence badge, layer badge (Rule-based/AI), category, and the action button bar (FR25)
**And** surrounding context is shown: ±2 segments above and below, displayed as 2-column layout: source (left, light gray, 70% opacity), target (right, normal opacity). Context segments are read-only. Clicking any context segment navigates to it if it has findings. Segment count configurable 1-3 before/after (default 2)

**Given** the detail panel content
**When** text is displayed for Thai/CJK segments
**Then** `lang` attribute is set on segment text elements (e.g., `lang="th"`, `lang="ja"`) for correct text rendering
**And** CJK text uses 1.1x font scale per UX accessibility spec

### Story 4.1d: Responsive Layout

As a QA Reviewer,
I want the review interface to adapt gracefully to different screen sizes,
So that I can review on various displays without losing critical functionality.

**Acceptance Criteria:**

**Given** the review view on different screen sizes
**When** viewed at ≥1440px: full 3-column fixed layout (file list | finding list | detail panel)
**When** viewed at ≥1024px: 2-column layout with file list collapsed to dropdown. Detail panel overlays with scrim
**When** viewed at <768px: single column, detail panel overlays above list. FindingCard expansion uses 150ms ease-out slide. Banner: "For the best review experience, use a desktop browser"

**Given** detail panel responsive behavior
**When** viewed at ≥1440px: detail panel width = 400px (fixed right side)
**When** viewed at 1024-1439px: detail panel width = 360px (overlay with scrim)
**When** viewed at <1024px: detail panel width = 300px (hidden drawer, accessible via toggle button)

### Story 4.2: Core Review Actions — Accept, Reject, Flag & Finding States

As a QA Reviewer,
I want to Accept, Reject, or Flag findings using keyboard hotkeys with immediate visual feedback,
So that I can review 300+ findings per day efficiently with a consistent state lifecycle.

**Acceptance Criteria:**

**Given** a finding is focused in the finding list
**When** the reviewer presses `A` (Accept hotkey)
**Then** the finding transitions to "Accepted" state: background-color=#dcfce7 (green-tinted), text-decoration:line-through, status='Accepted' in DB
**And** Action feedback cycle: visual state change (0ms) → score number morphs (300ms ease-out, slide direction matches up/down) → toast appears (500ms, auto-dismiss 3s): "Finding #14 accepted" → focus advances (200ms after action). All animations respect prefers-reduced-motion
**And** the MQM score recalculates via `finding.changed` event (debounced 500ms) — score recalculation event fires once within 500-1500ms of final change
**And** focus auto-advances to the next Pending finding; if no more pending findings, focus moves to review actions bar
**And** the Server Action returns `{ success: true, data: { finding_id, new_state } }` per ActionResult<T> pattern (Architecture Decision 3.2)
**And** the action is saved immediately (auto-save, NFR17) with an immutable audit log entry: `{ action: 'accept', finding_id, user_id, timestamp, previous_state }`

**Given** a finding is focused
**When** the reviewer presses `R` (Reject hotkey)
**Then** the finding transitions to "Rejected" state: red-tinted background, dimmed text
**And** the MQM score recalculates (penalty remains — false positive dismissed)
**And** a toast confirms: "Finding #14 rejected"
**And** focus auto-advances to next Pending finding
**And** the rejection is logged for AI training via `feedback_events` table (MVP data collection for Growth self-healing)

**Given** a finding is focused
**When** the reviewer presses `F` (Flag hotkey)
**Then** the finding transitions to "Flagged" state: yellow-tinted background, flag icon
**And** the score impact is "held" (finding stays in score calculation but marked for escalation)
**And** a toast confirms: "Finding #14 flagged for review"
**And** flagged findings are visible to all team members on the project

**Given** the 8-state lifecycle system
**When** any finding transitions between states
**Then** valid states are: Pending, Accepted, Re-accepted, Rejected, Flagged, Noted, Source Issue, Manual (FR76)
**And** each state has defined score impact: Accepted (penalty counts), Rejected/Noted/Source Issue (no penalty), Flagged (penalty held), Manual (penalty counts per assigned severity)
**And** every state transition creates an immutable `review_actions` log entry
**And** the `review_actions` table (defined in Story 1.2 migration) contains: id, finding_id, file_id, project_id, tenant_id, action_type, previous_state, new_state, user_id, batch_id (uuid FK nullable — null for single actions), metadata (jsonb), created_at
**And** Server Actions for all review actions return ActionResult<T> pattern; on error: `{ success: false, error: string, code: string }` (Architecture Decision 3.2)

**Given** the reviewer clicks the Accept/Reject/Flag button (mouse) instead of using a hotkey
**When** the button is clicked
**Then** the same state transition occurs as the keyboard hotkey
**And** buttons show: Accept (green filled), Reject (red filled), Flag (yellow outline)
**And** each button displays its hotkey label: "[A] Accept", "[R] Reject", "[F] Flag"
**And** button styling: focus ring = 2px indigo outline, 4px offset; hover = brightness +10%; disabled = 50% opacity, cursor not-allowed; tooltip shows hotkey on hover (500ms delay, auto-hide 5s)

**Given** a browser crash or accidental page close during review
**When** the reviewer returns to the file
**Then** all previously saved actions are preserved (auto-saved on every action) (NFR17)
**And** the ReviewProgress shows accurate count of reviewed findings
**And** the reviewer can continue from where they left off

### Story 4.3: Extended Actions — Note, Source Issue, Severity Override & Add Finding

As a QA Reviewer,
I want to mark findings as Notes, Source Issues, override severity, and manually add findings,
So that I have full control over the review outcome with nuanced categorization beyond Accept/Reject.

**Acceptance Criteria:**

**Given** a finding is focused
**When** the reviewer presses `N` (Note hotkey)
**Then** the finding transitions to "Noted" state: blue-tinted background, note icon
**And** a note input field appears for optional comment text
**And** the finding has NO MQM score penalty (stylistic observation only) (FR77)
**And** toast confirms: "Finding #14 noted"

**Given** a finding is focused
**When** the reviewer presses `S` (Source Issue hotkey)
**Then** the finding transitions to "Source Issue" state: purple-tinted background, source icon
**And** the finding is reclassified as a source text problem — no translation penalty (FR78)
**And** source issues are tracked separately for reporting (count of source problems per file)
**And** toast confirms: "Finding #14 — source issue"

**Given** a finding is focused
**When** the reviewer selects Severity Override from the context menu (right-click or "..." menu)
**Then** a dropdown appears with options: "Accept as Critical", "Accept as Major", "Accept as Minor" — dropdown is keyboard navigable (arrow keys) and each option is reachable via hotkey
**And** selecting an option changes the finding's effective severity for MQM calculation. Score recalculation depends on Story 3.5 infrastructure (FR79)
**And** the finding shows the original severity crossed out and the new severity: "~~Critical~~ → Minor"
**And** the score recalculates with the overridden severity weight
**And** an override badge is displayed on the finding
**And** the audit log records: `{ action: 'severity_override', original_severity, new_severity, user_id }`

**Given** the reviewer presses `+` (Add Finding hotkey)
**When** the Add Finding dialog opens
**Then** the dialog shows: segment selector (dropdown of all segments), category selector (from taxonomy), severity selector (Critical/Major/Minor), description text field, and suggestion text field (FR80)
**And** the reviewer fills in the details and submits

**Given** a manual finding is submitted
**When** it is created
**Then** the finding is inserted with: layer = "Manual", confidence = null, status = "Manual", a "Manual" badge
**And** the MQM score recalculates including the manual finding's penalty
**And** manual findings are visually distinct (dotted border + "Manual" badge) from system-detected findings

**Given** any extended action is performed
**When** the action saves
**Then** the ReviewProgress component updates: "Reviewed: X/N" increments
**And** all actions are auto-saved immediately (NFR17)
**And** each action creates an immutable audit log entry

### Story 4.4a: Bulk Operations & Decision Override

As a QA Reviewer,
I want to bulk accept or reject multiple findings at once and override previous decisions when needed,
So that I can handle large batches of false positives efficiently and correct mistakes without losing audit history.

**Acceptance Criteria:**

**Given** the finding list is displayed
**When** the reviewer uses Shift+Click or Shift+J/K to select multiple findings
**Then** selected findings show a checkbox indicator
**And** a BulkActionBar appears at the bottom: "[X] findings selected | [Bulk Accept] [Bulk Reject] [Clear Selection]"
**And** Ctrl+A selects all findings matching current filter (including off-screen, not just viewport-visible)

**Given** 3 findings are selected (≤5)
**When** the reviewer clicks "Bulk Accept"
**Then** all 3 findings transition to "Accepted" state immediately (no confirmation dialog) — all 3 save in single transaction OR all 3 rollback on any failure (atomic)
**And** a single summary toast: "3 findings accepted"
**And** individual per-finding toasts are suppressed
**And** the score recalculates once (not 3 times) after bulk operation completes (FR27)

**Given** 8 findings are selected (>5)
**When** the reviewer clicks "Bulk Reject"
**Then** a confirmation dialog appears: "Reject 8 findings? This will dismiss them as false positives."
**And** the dialog shows a severity breakdown: "2 Critical, 3 Major, 3 Minor"
**And** the reviewer must confirm before the bulk action executes (FR27)

**Given** a finding was previously Accepted
**When** the reviewer changes their decision to Reject (or any other action)
**Then** the finding transitions to the new state
**And** a new immutable audit entry is created (previous entry is NOT modified) (FR28)
**And** an "Override" badge appears on the finding showing it was changed
**And** if the finding was Rejected and is now Accepted again, the state is "Re-accepted" (distinct from first Accept)

**Given** the override history for a finding
**When** the reviewer clicks the "Override" badge or views finding history
**Then** the full decision history is displayed: each action with timestamp, user, and previous→new state
**And** all entries are read-only (immutable audit trail)

**Given** bulk operations and overrides
**When** each action is recorded
**Then** the `review_actions` table captures: batch_id (for bulk operations, null for single), action_type, is_bulk (boolean)
**And** bulk operations share the same batch_id for atomic undo tracking

### Story 4.4b: Undo/Redo & Realtime Conflict Resolution

As a QA Reviewer,
I want to undo my last review actions and see conflicts when another reviewer edits the same finding,
So that I can recover from mistakes and collaborate without overwriting each other's work.

**Acceptance Criteria:**

**Given** a review action (single or bulk) was just performed
**When** the reviewer presses Ctrl+Z (undo)
**Then** the action is undone atomically (bulk action = 1 undo entry, all findings revert to previous state)
**And** undo stack stored in Zustand store (per-tab, not per-session), max 20 entries; when 21st action performed, action #1 is removed from stack
**And** undo does NOT persist across file navigation (switching files clears undo stack)
**And** toast confirms: "Undone: [action description]"

**Given** an action was undone
**When** the reviewer presses Ctrl+Shift+Z (redo)
**Then** the undone action is re-applied
**And** redo stack clears when a new action is performed (standard undo/redo behavior)

**Given** the reviewer attempts to undo an action
**When** the target finding was modified by another user via Supabase Realtime
**Then** a conflict dialog appears: "This finding was modified by [user B]. Undo your change?"
**And** the reviewer can choose: "Undo anyway" (force) or "Cancel" (keep current state)
**And** undo is disabled for stale findings (finding no longer exists in DB)

### Story 4.5: Search, Filter & AI Layer Toggle

As a QA Reviewer,
I want to search and filter findings by severity, type, segment range, and keyword, and toggle AI suggestions on/off,
So that I can quickly find specific issues and focus on rule-based results when needed.

**Acceptance Criteria:**

**Given** the finding list is displayed
**When** the filter bar renders above the list
**Then** filter options are: Severity (All/Critical/Major/Minor), Layer (All/Rule-based/AI), Status (All/Pending/Accepted/Rejected/Flagged), Category (All/Terminology/Consistency/Number/Grammar/...), Confidence (All/High >85%/Medium 70-85%/Low <70%) (FR34)
**And** default filter is: Status = Pending (show unreviewed findings first)

**Given** the reviewer selects filters
**When** filters are applied
**Then** the finding list updates instantly (client-side filtering via Zustand store)
**And** active filters show as removable badge chips above the list
**And** the count updates: "Showing 5 of 28 findings"
**And** filters use AND logic (all conditions must match)

**Given** the reviewer types in the search box
**When** they enter a keyword (e.g., "bank" or "ธนาคาร")
**Then** findings are filtered to those containing the keyword in: source text, target text, description, or suggestion
**And** the matching text is highlighted in the results
**And** search supports both source and target language text (FR34)

**Given** the reviewer presses Ctrl+K
**When** the Command Palette opens
**Then** 3-tier search is available with scope shortcuts: `>` (actions only), `#` (findings only), `@` (files only)
**And** finding search shows: finding number, source→target preview, severity, category
**And** selecting a finding navigates to and focuses it in the finding list

**Given** the reviewer wants to see only rule-based results
**When** they activate "Rule-based only" toggle (or use Layer filter = Rule-based)
**Then** FR31 Implementation: "AI suggestions: OFF" toggle in review header (distinct from Layer filter). When OFF: all L2/L3 findings hidden, score recalculates to L1-only. When ON: L2/L3 re-appear (FR31)
**And** toggle state saved per file within session. Enabling AI does NOT re-run pipeline (still shows cached results if available)
**And** Layer filter is distinct from AI toggle: filter hides findings by layer, toggle disables entire AI layer visibility
**And** the toggle state is clearly visible: "AI suggestions: OFF" indicator
**And** toggling back to "All" restores AI findings and full score

**Given** filter interaction details
**When** filter buttons render
**Then** filter buttons show active state with bg color + border. Clear [X] chip removes individual filter. "Clear all" link visible when any filter active
**And** filter state persists per file within session
**And** keyboard: Tab navigates filter buttons, Enter toggles
**And** screen reader: `aria-label="Critical severity filter, [number] of [total] findings match"`

**Given** filter state during a review session
**When** the reviewer switches between files in a batch
**Then** filter state persists per file within the session
**And** returning to a previously viewed file restores its filter state

### Story 4.6: Suppress False Positive Patterns

As a QA Reviewer,
I want the system to detect recurring false positive patterns and offer to suppress them,
So that I don't waste time rejecting the same false positive type repeatedly.

**Acceptance Criteria:**

**Given** the reviewer has rejected 3 or more findings with the same error pattern (same category + similar description)
**When** the 3rd rejection is made
**Then** a toast notification appears: "Pattern detected: '{pattern_name}' (3 rejects) — [Suppress this pattern] [Keep checking]" — pattern matched by: (1) exact category match + (2) description field contains ≥3 word overlap (case-insensitive) OR semantic similarity >0.85. Pattern detection algorithm documented in `src/lib/pattern-detection.ts` with test cases (FR30)

**Given** the reviewer clicks "Suppress this pattern"
**When** the suppress configuration dialog opens
**Then** the dialog shows:
- Pattern description: preview of what will be suppressed
- Scope: radio buttons — "This file only" / "This language pair (EN→TH)" / "All language pairs"
- Duration: radio buttons — "Until AI accuracy improves" / "Permanently" / "This session only"
**And** default scope is "This language pair"
**And** default duration is "Until AI accuracy improves"

**Given** the reviewer confirms suppression
**When** the pattern is suppressed
**Then** all matching Pending findings in the current file are auto-rejected with a "Suppressed" tag
**And** future findings matching this pattern (based on scope) are auto-rejected on detection
**And** suppressed findings are still logged in `feedback_events` with `suppressed=true` flag for ML training exclusion
**And** scope and duration stored in `suppression_rules` table: id, project_id, tenant_id, pattern_description, pattern_category, scope (file/language_pair/all), duration (session/permanent/until_improved), reason, created_by, created_at
**And** a toast confirms: "Pattern suppressed — X findings auto-rejected"

**Given** the reviewer clicks "Keep checking"
**When** the toast is dismissed
**Then** no suppression occurs and the pattern detection counter resets
**And** the system will re-detect at the next 3+ rejection threshold

**Given** suppressed patterns exist for a project
**When** an Admin views Settings → AI Learning → Suppressed Patterns
**Then** all active suppressions are listed with: pattern description, scope, duration, created by, created date, match count
**And** each pattern has a "[Re-enable]" button to remove the suppression
**And** re-enabling restores future detection without affecting previously suppressed findings

**Given** a suppression with duration "This session only"
**When** the reviewer's session ends (logout or browser close)
**Then** the suppression is automatically removed
**And** the pattern will be detected again in the next session

### Story 4.7: Add to Glossary from Review

As a QA Reviewer,
I want to add terms to the project glossary directly from the review interface with one click,
So that I can build the glossary organically as I discover terminology issues during review.

**Acceptance Criteria:**

**Given** a finding is focused that involves a terminology issue (category = Terminology or Glossary)
**When** the reviewer clicks "Add to Glossary" button in the finding detail panel
**Then** a pre-filled glossary entry dialog appears with:
- Source term: extracted from the finding's source text highlight
- Target term: extracted from the suggestion or the reviewer can type the correct translation
- Language pair: auto-populated from the file's language pair
- Notes: optional field for usage context
**And** the dialog is pre-filled to minimize typing (1-click goal) (FR42)

**Given** the glossary entry dialog is filled
**When** the reviewer confirms the addition
**Then** the term is added to the project's glossary immediately
**And** a toast confirms: "Added to glossary: '{source}' → '{target}'"
**And** the glossary cache is invalidated so future rule-based checks use the new term
**And** the action is logged in the audit trail

**Given** the term already exists in the project glossary
**When** the reviewer attempts to add a duplicate
**Then** the dialog shows a warning: "Term '{source}' already exists with target '{existing_target}'" — duplicate check is CASE_INSENSITIVE and exact phrase match (not substring)
**And** the reviewer can choose: "Update existing" (replace target) or "Cancel"

**Given** a non-terminology finding is focused (e.g., tag error, number mismatch)
**When** the finding detail panel renders
**Then** the "Add to Glossary" button is not shown (only relevant for terminology/glossary findings)

**Given** the reviewer adds a glossary term
**When** other findings in the same file are re-evaluated
**Then** the system does NOT automatically re-run QA (to avoid disrupting the current review)
**And** a subtle note appears: "New glossary term will apply to future QA runs"

---
