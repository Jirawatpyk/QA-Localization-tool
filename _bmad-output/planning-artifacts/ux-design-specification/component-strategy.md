# Component Strategy

## Component-to-Journey Dependency Map

| Component | UJ1 | UJ2 | UJ3 | UJ4 | UJ5 | UJ6 | Criticality |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:-----------:|
| **FindingCard** | | Core | Core | | | Core | P0 |
| **FindingCardCompact** | | Core | | | | Core | P0 |
| **BatchSummary** | | Core | Core | Core | | | P0 |
| **LanguageBridge** | | | Core | | | | P0 |
| **ScoreBadge** | Used | Core | Used | Used | Core | | P0 |
| **ReviewProgress** | | Core | Core | | | | P0 |
| **FileStatusCard** | | Core | Used | Core | Core | | P1 |
| **SegmentContext** | Used | Core | Core | | | | P1 |
| **AILearningIndicator** | | | | | | Core | P1 |
| **ScoreChangeLog** | | Used | | | Core | Used | P2 |
| **QACertificate** | | | | | Core | | P2 |
| **FindingPattern** | | Used | | | | Used | P2 |

## Component Composition Tree

```
App Layout
├── Sidebar (shadcn Sheet — collapsible)
│   ├── ProjectSelector (shadcn Select)
│   └── NavigationMenu (shadcn)
│
├── Main Content Area
│   ├── BatchView
│   │   ├── BatchSummary ★
│   │   │   ├── FileStatusCard ★ (× N files)
│   │   │   │   ├── ScoreBadge ★
│   │   │   │   └── Badge (shadcn — severity counts)
│   │   │   └── BatchActionBar
│   │   │       ├── Button (shadcn — Confirm All Passed)
│   │   │       └── Button (shadcn — Export Report)
│   │   │
│   │   ├── ProcessingModeDialog (shadcn Dialog — modal overlay triggered on upload)
│   │   │   ├── ModeCard ★ (Economy: L1+L2, cost/time estimates)
│   │   │   ├── ModeCard ★ (Thorough: L1+L2+L3, Recommended badge)
│   │   │   ├── CostEstimateBar (total cost, time, budget remaining)
│   │   │   └── Button (shadcn — Start Processing)
│   │   │
│   │   └── ReviewView (per-file)
│   │       ├── ReviewHeader
│   │       │   ├── ScoreBadge ★
│   │       │   ├── ReviewProgress ★
│   │       │   └── ModeBadge ★ (display-only — shows active mode e.g. "✓ Thorough L1+L2+L3")
│   │       │       └── UpgradeButton (Economy→Thorough one-way upgrade — triggers re-processing confirmation dialog, hidden if already Thorough)
│   │       │
│   │       ├── FindingList (shadcn Data Table)
│   │       │   ├── FindingCardCompact ★ (default row)
│   │       │   │   ├── Badge (shadcn — severity)
│   │       │   │   ├── Badge (shadcn — layer: Rule/AI)
│   │       │   │   └── InlineActions (A/R buttons)
│   │       │   │
│   │       │   └── FindingCard ★ (expanded on focus)
│   │       │       ├── SegmentHighlight (source/target diff)
│   │       │       ├── SuggestionBlock
│   │       │       │   ├── Badge (shadcn — confidence %)
│   │       │       │   └── Tooltip (shadcn — confidence detail)
│   │       │       └── ActionBar (A/R/F/N/S/+ buttons)
│   │       │
│   │       └── BulkActionBar (appears on multi-select)
│   │           ├── SelectionCount
│   │           ├── BulkAccept / BulkReject
│   │           └── Dialog (shadcn — confirmation if > 5)
│   │
│   └── DashboardView
│       ├── MetricCards (shadcn Card × 4)
│       ├── TrendCharts (shadcn Charts)
│       ├── RecentFiles (shadcn Data Table)
│       │   └── FileStatusCard ★ (per row)
│       └── AILearningIndicator ★
│
├── Detail Panel (shadcn Sheet — always visible in review)
│   ├── SegmentContext ★
│   │   └── SegmentRow (× 3-5 surrounding segments)
│   ├── LanguageBridge ★ (if non-native language pair)
│   │   ├── BackTranslation
│   │   ├── AIExplanation
│   │   └── ConfidenceBar
│   ├── ScoreChangeLog ★
│   └── FindingPattern ★ (if cross-file pattern detected)
│
└── Overlays
    ├── Command (shadcn — Ctrl+K palette)
    ├── Toast (shadcn — notifications)
    ├── QACertificate ★ (modal preview + PDF export)
    └── OnboardingTour (step-by-step overlay)
```

★ = Custom component | unmarked = shadcn/ui component

## Custom Component Specifications

### FindingCard (P0 — Core Loop)

**Purpose:** Primary interaction unit — where reviewers make accept/reject decisions 100-300 times/day

**Anatomy:**
```
┌─────────────────────────────────────────────────────────┐
│ [Severity] [Category]  [Layer Badge]         [#14/28]   │  ← Header
│─────────────────────────────────────────────────────────│
│ SRC: "Please transfer to your ███ account"              │  ← Source with highlight
│ TGT: "กรุณาโอนไปยัง ████████████ ของคุณ"                │  ← Target with highlight
│─────────────────────────────────────────────────────────│
│ Suggestion: "บัญชีธนาคาร"             Confidence: 94%   │  ← Suggestion block
│─────────────────────────────────────────────────────────│
│ [A Accept] [R Reject] [F Flag] [N Note] [S Source] [+]  │  ← Action bar
└─────────────────────────────────────────────────────────┘
```

**States:**

| State | Visual | Trigger | Score Impact |
|-------|--------|---------|:---:|
| **Pending** | White background, full actions visible | Initial state | None |
| **Focused** | Light indigo border, side panel syncs | Arrow key / click | None |
| **Accepted** | Green-tinted, strikethrough on finding | `A` key / Accept click | Yes (MQM penalty) |
| **Re-accepted** | Green-tinted + override badge | Re-accept a previously Rejected finding | Penalty re-applied |
| **Rejected** | Red-tinted, dimmed | `R` key / Reject click | No penalty (false positive) |
| **Flagged** | Yellow-tinted, flag icon | `F` key / Flag click | Pending |
| **Noted** | Blue-tinted, note icon | `N` key / Note click | Unchanged |
| **Source Issue** | Purple-tinted, source icon | `S` key | Reclassified |

> **Note:** 'Re-accepted' (re-accepting a rejected finding) is distinct from Severity Override (changing a finding's severity level via the Severity Override action). Both produce an 'override' badge but serve different purposes.

**Variants:**

| Variant | Usage | Differences |
|---------|-------|-------------|
| `default` | Standard finding display | Full anatomy as shown |
| `compact` | When user toggles compact mode globally | Merges into FindingCardCompact |
| `bulk-selected` | Multi-select mode active | Checkbox visible, highlight border |
| `ai-pending` | AI layer still processing | Suggestion area shows skeleton loader |
| `manual` | User-added finding via `+` | "Manual" badge, no confidence score |

**Accessibility:**
- `role="row"` within Data Table, `aria-selected` for focused state
- Action buttons: `aria-label="Accept finding 14 of 28 — Critical terminology error"`
- State changes announce via `aria-live="polite"`: "Finding accepted. Score updated to 87."
- Full keyboard: `A/R/F/N/S` keys only active when finding is focused
- High contrast: severity colors meet 3:1 against both light and dark backgrounds

**Interaction Behavior:**
- `Enter` on compact row → expand to full FindingCard (150ms ease-out)
- `Esc` → collapse back to compact row
- Action key → apply state + auto-advance to next pending finding
- `Shift+A/R` → add to bulk selection instead of individual action

### FindingCardCompact (P0 — Scanning Mode)

**Purpose:** Maximally dense row for rapid scanning — power user default

**Anatomy:**
```
│ 🔴 │ Terminology │ AI │ "bank → ริม..." │ 94% │ ✓ ✗ │
```

**Columns:** Severity icon (16px) | Category (text) | Layer badge (Rule/AI) | Preview (truncated source→target) | Confidence % | Quick actions (Accept/Reject icons)

**States:** Same 8 states as FindingCard — indicated by row background tint + left border color

**Interaction:** Click/Enter → expands inline to full FindingCard. Quick action icons allow Accept/Reject without expanding.

### LanguageBridge (P0 — Non-Native Critical)

**Purpose:** Enable non-native reviewers to understand and act on findings in languages they cannot read

**Anatomy:**
```
┌───────────────────────────────────────┐
│ Language Bridge                  [?]   │
│───────────────────────────────────────│
│ SOURCE (EN):                          │
│ "Please submit the quarterly report"  │
│                                       │
│ TARGET (ZH):                          │
│ "请提交月度报告"                       │
│                                       │
│ BACK-TRANSLATION:                     │
│ "Please submit the monthly report"    │
│  difference highlighted               │
│                                       │
│ AI EXPLANATION:                        │
│ "Source: every 3 months               │
│  Target: every month                  │
│  → frequency mismatch"               │
│                                       │
│ Confidence: 89%                        │
│ ZH threshold: 92%                     │
│───────────────────────────────────────│
│ [Accept] [Flag for Native] [Reject]   │
│ "When in doubt, Flag"                 │
└───────────────────────────────────────┘
```

**States:**

| State | Visual | Condition |
|-------|--------|-----------|
| **Standard** | Full panel as shown | Non-native language pair detected |
| **Hidden** | Panel not rendered | Native language pair (e.g., คุณแพร reviewing EN→TH) |
| **Confidence Warning** | Orange border, "Flag recommended" text | Confidence below language threshold |
| **Loading** | Back-translation + explanation show skeleton | AI still generating explanation |
| **Error** | "Back-translation unavailable" fallback | AI explanation failed |

**Accessibility:**
- `aria-label="Language Bridge panel for Chinese to English back-translation"`
- Back-translation diff highlighted with `<mark>` + `aria-label="difference from source"`
- "When in doubt, Flag" — visible guidance reduces decision anxiety

### BatchSummary (P0 — Entry Point for UJ2/UJ3/UJ4)

**Purpose:** First view after batch processing — instant triage of files into pass/review categories

**Anatomy:**
```
┌─────────────────────────────────────────────────────────┐
│ Batch Summary: Monday batch (12 files)        2m 14s    │
│─────────────────────────────────────────────────────────│
│                                                         │
│  Recommended Pass (8)           Need Review (4)         │
│  ┌───────────────────────┐      ┌───────────────────┐   │
│  │ FileStatusCard × 8    │      │ FileStatusCard × 4│   │
│  │ (sorted by score desc)│      │ (sorted by score  │   │
│  │                       │      │  asc — worst first)│  │
│  └───────────────────────┘      └───────────────────┘   │
│                                                         │
│  [Confirm All Passed]  [Export Report]  [View Details]   │
└─────────────────────────────────────────────────────────┘
```

**States:**

| State | Visual | Trigger |
|-------|--------|---------|
| **Processing** | Files appear one-by-one as L1 completes, AI status badges | During batch run |
| **Complete** | Full summary with pass/review split | All layers done |
| **Partial** | Some files complete, some still processing | Large batch, AI queue |
| **All Passed** | Celebratory state — all green, prominent Confirm All | Score >= 95 all files |
| **All Need Review** | No pass section, review section expanded | Score < 95 all files |

**Interaction:**
- Click FileStatusCard → navigate to that file's ReviewView
- "Need Review" files sorted worst-first (lowest score at top) — helps prioritize
- "Confirm All Passed" — single action for all passing files (audit trail records per-file)

### ScoreBadge (P0 — Ubiquitous)

**Purpose:** MQM quality score display — the most-glanced element in the entire UI

**Anatomy:**
```
┌─────────────┐
│  82         │  ← Score number (large, tabular figures)
│  Analyzing  │  ← Phase label
└─────────────┘
```

**Variants:**

| Variant | Size | Usage |
|---------|:----:|-------|
| `lg` | 48px number | File header, batch summary |
| `md` | 24px number | Finding list header, dashboard cards |
| `sm` | 16px number | Inline within tables, file status rows |

**States:**

| State | Color | Label | Condition |
|-------|-------|-------|-----------|
| **Pass** | Green (--status-pass) | "Passed" | Score >= 95 AND 0 Critical |
| **Review** | Orange (--status-pending) | "Review" | Score < 95 OR has Critical |
| **Fail** | Red (--status-fail) | "Fail" | Score < 70 |
| **Analyzing** | Indigo pulse animation | "Analyzing..." | AI layer in progress |
| **Rule-only** | Blue | "Rule-based" | Only L1 complete |

**Animation:** Score number morphs on change (300ms ease-out). Old value fades out, new value fades in. Direction indicates improvement (slide up) or decline (slide down). Respects `prefers-reduced-motion`.

### ReviewProgress (P0 — Review Session Tracking)

**Purpose:** Dual-track progress showing reviewed findings vs total, with AI processing status

**Anatomy:**
```
┌──────────────────────────────────────────────────┐
│ Reviewed: 14/28            AI: 8 pending         │
│ ████████████░░░░░░░░░░░░░  ██████░░░░░░░░░░░░░░  │
│ 50% complete               Processing L2...      │
└──────────────────────────────────────────────────┘
```

**States:**
- **Active:** Both bars updating, review count increments on each action
- **AI Complete:** Right bar full green, "AI Complete" label
- **Review Complete:** Left bar full, "All reviewed" with checkmark
- **All Done:** Both complete — file summary and next file prompt

### SegmentContext (P1 — Decision Support)

**Purpose:** Show surrounding segments for translation context — prevents out-of-context decisions

**Anatomy:**
```
┌──────────────────────────────────────┐
│ Segment Context                      │
│──────────────────────────────────────│
│ #45  "The user should navigate..."   │  ← Previous (dimmed)
│ #46  "Click on the account..."       │  ← Previous (dimmed)
│ #47  "Transfer to your bank..."   ◀  │  ← TARGET (highlighted)
│ #48  "Confirm the transaction..."    │  ← Next (dimmed)
│ #49  "A receipt will be sent..."     │  ← Next (dimmed)
└──────────────────────────────────────┘
```

**Interaction:** Click any surrounding segment → navigate there (if it has findings). Segment count configurable (1-3 segments before/after, default 2).

### AILearningIndicator (P1 — Trust Building)

**Purpose:** Make AI improvement visible — builds trust through demonstrated growth

**Anatomy:**
```
┌──────────────────────────────────────┐
│ AI Learning — EN→TH                  │
│──────────────────────────────────────│
│ Accuracy:  47% → 92%   +45%         │
│ Patterns learned: 23                 │
│ From your feedback: 18               │
│ Last improved: 2 hours ago              │
│──────────────────────────────────────│
│ [View learned patterns]              │
└──────────────────────────────────────┘
```

**States:**
- **Learning:** Pulse animation after user provides feedback — "Learning from your feedback..."
- **Improved:** Green highlight when accuracy increases — shows delta
- **Stable:** Neutral — no recent changes
- **New Language:** "Building model for EN→ZH — needs 10+ feedbacks to calibrate"

### FileStatusCard (P1 — Batch Context)

**Purpose:** Per-file status row in batch summary and dashboard

**Anatomy:**
```
│ doc-03.xlf │ 82 │ Need Review │ 2C 3M 14m │ [Review] │
```

**Columns:** Filename | ScoreBadge (sm) | Status | Issue counts by severity | Action button

### OnboardingTour (P2 — First-Time Experience) — Gap #17

**Purpose:** Guided tour system for first-time users — builds initial trust and reduces time-to-first-value

**Library:** `driver.js` (v1.3+)
- 5KB gzipped, zero dependencies, TypeScript native
- Supports highlight + popover positioning, step-by-step navigation
- `prefers-reduced-motion` respected, keyboard accessible (Tab/Enter/Esc)
- Install: `npm install driver.js`

#### Tour Architecture — Two-Phase Approach

The onboarding consists of **2 sequential tours** triggered at different moments:

| Tour | Trigger | Steps | Purpose |
|------|---------|:---:|---------|
| **Setup Tour** | First login (dashboard) | 4 | Guide user to create project, import glossary, upload first file |
| **Review Tour** | First time entering ReviewView (per Epic 1.7 AC) | 5 | Teach review features: severity, actions, auto-pass, reports, shortcuts |

#### Setup Tour — 4 Steps (First Login)

| Step | Target Element | Title | Content | Position |
|:---:|---|---|---|:---:|
| 1 | App shell (full overlay) | Welcome to QA Localization Tool | "Your AI-powered QA assistant — catches everything Xbench catches, plus semantic issues Xbench can't." | center |
| 2 | Project create button | Create a Project | "Start by setting your language pair and QA mode." | bottom |
| 3 | Glossary nav item | Import Your Glossary | "Import your existing glossary (CSV/XLSX/TBX) — terminology checks start immediately." | right |
| 4 | File upload area | Upload Your First File | "Try with a file you already QA'd in Xbench — compare results side-by-side to see what AI catches extra." | bottom |

#### Review Tour — 5 Steps (First ReviewView Entry, per Epic 1.7 AC)

| Step | Target Element | Title | Content | Position |
|:---:|---|---|---|:---:|
| 1 | Severity badge (first finding) | Severity Levels | "Icon shapes + colors indicate severity: Red circle = Critical, Orange triangle = Major, Yellow diamond = Minor. Each carries different MQM penalty weight." | right |
| 2 | Action bar (first finding) | Review Actions | "7 actions: Accept (A), Reject (R), Flag (F), Note (N), Source Issue (S), Severity Override, Add Manual. Keyboard hotkeys shown in parentheses." | bottom |
| 3 | ScoreBadge (file header) | Auto-Pass | "Files scoring 95+ with 0 Critical findings qualify for auto-pass. System recommends pass — you confirm with one click." | left |
| 4 | Export/Certificate button | Report Generation | "Generate PDF reports and QA Certificates for client delivery. Excel export available with full finding details." | bottom |
| 5 | Keyboard shortcuts indicator | Keyboard Shortcuts | "Ctrl+? toggles the full shortcut cheat sheet. J/K=Navigate, A/R/F=Actions, Shift+A=Bulk select. Review 300+ findings/day." | left |

**Wireframe — Popover:**
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   ┌─── Highlighted Element ───────────────┐             │
│   │   (pulsing border, rest dimmed)       │             │
│   └───────────────────────────────────────┘             │
│       ┌─────────────────────────────────┐               │
│       │ Step 2 of 5                     │               │
│       │                                 │               │
│       │  Review Actions                 │               │
│       │                                 │               │
│       │  7 actions: Accept (A),         │               │
│       │  Reject (R), Flag (F),          │               │
│       │  Note (N), Source Issue (S),     │               │
│       │  Severity Override, Add Manual.  │               │
│       │                                 │               │
│       │ [← Back]  ● ● ◉ ● ●  [Next →]  │               │
│       │      [Dismiss]  [Skip all]       │               │
│       └─────────────────────────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Navigation Actions:**
- **Back / Next** — move between steps
- **Dismiss** — close tour temporarily, resumes at same step on next visit
- **Skip all** — skip entire tour permanently, sets `onboarding_completed_at`

**Variants:**

| Variant | Steps | Target User | Trigger |
|---------|:---:|---|---|
| `setup` | 4 | All roles, first login | `!user.setup_tour_completed` on dashboard |
| `review` (Epic 1.7 AC) | 5 | QA Reviewer, first review entry | `!user.review_tour_completed` on ReviewView |
| `pm-lite` | 3 | PM first login | Role = PM + first login (see PM steps below) |
| `feature-spotlight` | 1 | Any user after feature release | Feature flag per spotlight |

**PM-Lite Tour — 3 Steps:**

| Step | Target Element | Title | Content | Position |
|:---:|---|---|---|:---:|
| 1 | Dashboard metric cards | Project Overview | "Track quality scores, auto-pass rates, and team progress at a glance." | bottom |
| 2 | File assignment area | Assign & Route | "Assign files to reviewers by language pair. Route critical issues to native speakers." | right |
| 3 | Export/Report button | Reports & Certificates | "Export PDF/Excel reports for clients. Generate QA Certificates with one click." | bottom |

**States:**
- **Active:** Dimmed overlay, highlighted element, popover visible
- **Dismissed:** User clicks "Dismiss" → tour pauses, resumes at same step on next visit
- **Skipped:** User clicks "Skip all" → `onboarding_completed_at` set, tour never shows again
- **Completed:** All steps done → success toast "You're all set! Press Ctrl+? anytime for shortcuts."
- **Re-triggerable:** Settings → Help → "Replay onboarding tour" (offers choice: Setup tour / Review tour)

**Mobile Behavior (<768px):**
- Tours are **not shown** on mobile — mobile has limited UI (summary cards + batch status only per Story 1.7)
- Instead, show a persistent banner: "Switch to desktop for the best onboarding experience"
- If user completes setup tour on desktop → mobile banner goes away

**Accessibility:**
- `aria-live="polite"` announces step changes
- `Esc` exits tour at any step (same as Dismiss — resumes later)
- Tab cycles through Back/Next/Dismiss/Skip buttons
- Tour content readable by screen reader
- `prefers-reduced-motion`: no pulsing border, instant transitions

**Persistence:** Server-side in `users` table metadata (jsonb field):
```json
{
  "setup_tour_completed": "2026-02-16T10:00:00Z",
  "review_tour_completed": null,
  "dismissed_at_step": { "review": 3 }
}
```
Server-side preferred — persists across devices and browser clears.

**driver.js CSS Customization** (`src/styles/onboarding.css`):
```css
.driver-popover {
  background: var(--surface);           /* slate-50 */
  border: 1px solid var(--border-strong); /* slate-300 */
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  font-family: Inter, system-ui, sans-serif;
}
.driver-popover-title { font-size: 14px; font-weight: 600; color: var(--text-heading); }
.driver-popover-description { font-size: 13px; line-height: 1.5; color: var(--text-body); }
.driver-popover-progress-text { font-size: 12px; color: var(--text-muted); }
.driver-highlight-element { border: 2px solid var(--primary); border-radius: 6px; }
/* Buttons — match shadcn hierarchy */
.driver-popover-next-btn { background: var(--primary); color: white; border-radius: 6px; padding: 8px 16px; }
.driver-popover-prev-btn { background: white; color: var(--text-body); border: 1px solid var(--border); border-radius: 6px; }
```

**Focus Management:**
- On tour start → focus moves to Next button (primary action)
- Tab order: Back → Next → Dismiss → Skip all
- Esc = Dismiss (pause, not skip) → focus returns to previously focused element
- **No focus trap** — user can Tab out of popover to page (unlike Dialog which traps)
- `aria-current="step"` on active dot, `aria-label="Step N of M"` on container

**Responsive:**

| Breakpoint | Behavior |
|:---:|---|
| Desktop 1024px+ | Full tour with popover |
| Tablet 768-1023px | Same tour, popover max-width 360px centered |
| Mobile <768px | Tour suppressed. Sticky banner: `bg-indigo-50 border-b border-indigo-200 text-indigo-900 p-3`, dismissible (session-scoped) |

**Persistence Implementation:**
- Field: `users.metadata` (jsonb) — already defined in Story 1-2 schema
- Update via Server Action: `src/features/onboarding/actions/updateTourState.action.ts`
- Reads: getCurrentUser() → metadata check on page load (RSC)

---

### AIConfigurationPanel (P1 — AI Budget & Model Settings) — Gap #27

**Purpose:** Admin/PM configures AI budget limits, views usage, and manages model preferences per project

**Location:** `(app)/projects/[projectId]/settings/page.tsx` — AI Configuration tab

**Wireframe — Settings Tab:**
```
┌─────────────────────────────────────────────────────────┐
│ Project Settings                                        │
│ [General] [AI Configuration] [Glossary] [Team]          │
│─────────────────────────────────────────────────────────│
│                                                         │
│ AI Budget                                               │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Monthly budget:  [$50.00        ]  (leave blank =   │ │
│ │                                     unlimited)      │ │
│ │                                                     │ │
│ │ Current usage:   $12.40 / $50.00                    │ │
│ │ ████████████░░░░░░░░░░░░  24.8%                     │ │
│ │                                                     │ │
│ │ Projected:  $38.20 this month                       │ │
│ │ Status:     ✅ Within budget                        │ │
│ │ Resets:     March 1, 2026 (15 days)                 │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Processing Mode Default                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Default mode:  (●) Economy (L1+L2)                  │ │
│ │                    ~$0.40 per 100K words             │ │
│ │                ( ) Thorough (L1+L2+L3)              │ │
│ │                    ~$2.40 per 100K words             │ │
│ │                                                     │ │
│ │ Note: Users can override per-batch at upload time.  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ AI Model Configuration                                  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ L2 Screening:  [gpt-4o-mini-2024-07-18      v]     │ │  ← Admin: Select dropdown
│ │ L3 Deep:       [claude-sonnet-4-5-20250929  v]     │ │  ← Admin: Select dropdown
│ │                                                     │ │
│ │ ⓘ Models are pinned per project for reproducibility.│ │
│ │   Fallback chain: pinned → latest same provider     │ │
│ │   → next provider.                                  │ │
│ │   Unavailable model triggers admin notification.    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [Save Changes]                                          │
└─────────────────────────────────────────────────────────┘
```

**Model Configuration — Role-based rendering:**
```
Admin view:     [gpt-4o-mini-2024-07-18      v]   ← <Select> dropdown with available versions
Non-admin view:  gpt-4o-mini-2024-07-18 (pinned)  ← Display-only text with (pinned) badge
```

**Wireframe — AI Usage Dashboard (read-only, visible to all roles):**
```
┌─────────────────────────────────────────────────────────┐
│ AI Usage — This Month                                   │
│─────────────────────────────────────────────────────────│
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Total    │  │ L2 Cost  │  │ L3 Cost  │  │ Files  │  │
│  │ $12.40   │  │ $4.20    │  │ $8.20    │  │ 47     │  │
│  │ +12% MoM │  │ 34%      │  │ 66%      │  │ +8     │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│                                                         │
│  Cost Trend (30 days)                                   │
│  ┌─────────────────────────────────────────────────┐    │
│  │     $2                                          │    │
│  │      ╱╲    ╱╲                                   │    │
│  │  $1 ╱  ╲──╱  ╲──╱╲                             │    │
│  │    ╱              ╲──                           │    │
│  │  $0───────────────────────────────────          │    │
│  │    W1     W2     W3     W4                      │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Per-File Breakdown                                     │
│  ┌──────────┬──────┬───────┬───────┬────────┐           │
│  │ File     │ Segs │ L2    │ L3    │ Total  │           │
│  │ doc-47   │ 342  │ $0.08 │ $0.22 │ $0.30  │           │
│  │ doc-46   │ 218  │ $0.05 │ —     │ $0.05  │           │
│  │ doc-45   │ 156  │ $0.04 │ $0.12 │ $0.16  │           │
│  └──────────┴──────┴───────┴───────┴────────┘           │
│                                                         │
│  Budget Alert Threshold                                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Alert when usage reaches: [80] %  of budget     │    │
│  │ Alert method: Toast notification + Email         │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**Rate Limiting & Concurrency (backend-enforced, no config UI):**

Rate limits are enforced entirely server-side via Upstash Redis. Users see toast notifications when limits are hit:

| Limit | Value | User-Facing Message (Toast) |
|-------|:---:|---|
| AI pipeline trigger | 5 req / 60s per user | "Rate limit exceeded — please wait before starting another analysis" |
| L2 per-project | 100 / hour | "L2 analysis queue full for this project. Resuming shortly." |
| L3 per-project | 50 / hour | "L3 deep analysis queue full. Resuming shortly." |
| Concurrency | 1 pipeline / project | Queue position shown in BatchView (not in Settings) |

> **Cross-reference:** Queue position + estimated wait time is displayed in **BatchView** (`ProcessingModeDialog`) during upload/processing, not in the AI Configuration tab. See BatchSummary component.

**Budget Override (Admin only):**

When budget is exceeded and AI processing is paused, Admin sees an additional action:
```
┌─────────────────────────────────────────────────────────┐
│ Status: 🚫 Budget exceeded — AI processing paused       │
│                                                         │
│ [Increase Budget]  [Override: Allow 1 more batch]       │
│                                                         │
│ Override logs to audit trail with reason field.          │
└─────────────────────────────────────────────────────────┘
```

**Admin-Level AI Usage (tenant aggregate):**

Admin also has access to a tenant-wide AI usage view at `(app)/admin/ai-usage/`:
- Aggregated spend across **all projects** (not just one)
- Breakdown by project, by model/provider
- Top 5 cost drivers (projects)
- Tenant-level monthly trend

> This is a separate route from the per-project AI Configuration tab. Per-project = project settings. Tenant-wide = admin dashboard.

**States:**

| State | Visual | Condition |
|-------|--------|-----------|
| **Within budget** | Green progress bar, "Within budget" | Usage < alert threshold |
| **Approaching limit** | Orange progress bar, "80% of budget used" | Usage >= alert threshold |
| **Over budget** | Red progress bar, "Budget exceeded — AI processing paused" + Admin override button | Usage > 100% |
| **Unlimited** | No progress bar, "No budget limit set" | `ai_budget_monthly_usd` = NULL |
| **No data** | Empty state with "Process your first file to see AI usage" | Zero usage |

**RBAC:**

| Element | Admin | QA Reviewer | PM |
|---------|:---:|:---:|:---:|
| Budget setting | Edit | View | View |
| Mode default | Edit | View | Edit |
| Model version select | **Edit** | View | View |
| Budget override | **Edit** | — | — |
| Usage dashboard (project) | Full | Own files | Full |
| Usage dashboard (tenant) | **Full** | — | — |
| Alert threshold | Edit | — | Edit |

**Accessibility:**
- Budget input: `aria-label="Monthly AI budget in USD"`, `type="number"`, `step="0.01"`
- Progress bar: `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax`
- Model select: `aria-label="Select L2 screening model version"`
- Chart: `aria-label` with text summary, data table fallback for screen readers
- Budget reset date: plain text, no special ARIA needed

**Form Validation:**
- Budget input: validate on blur, inline error below field (`text-red-600`, `border-red-500`)
- Threshold: validate range 1-100, error: "Must be between 1 and 100"
- Save button: `disabled` until form is dirty AND all fields valid
- On save success: `toast.success("AI configuration saved")`
- On save error: `toast.error("Failed to save — please try again")` (persistent, manual dismiss)

**Chart Specification (Recharts):**
```tsx
<LineChart data={dailyCosts} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickFormatter={v => `$${v}`} />
  <Line type="monotone" dataKey="cost" stroke="var(--primary)" strokeWidth={2} dot={false} />
  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
</LineChart>
```
- Screen reader fallback: `aria-label="AI cost trend for the last 30 days. Total: $12.40"` + hidden data table
- `prefers-reduced-motion`: disable hover animations on chart

**Responsive:**

| Breakpoint | Behavior |
|:---:|---|
| Desktop 1440px+ | Full 2-column layout: Settings (left 60%) + Usage Dashboard (right 40%) |
| Desktop 1024-1439px | Single column: Settings → Usage stacked |
| Tablet 768-1023px | Same as 1024, card padding reduced to `space-3` |
| Mobile <768px | AI Configuration not available. Banner: "Switch to desktop to manage AI settings" (consistent with responsive-accessibility.md Dashboard-only policy) |

---

### QACertificate (P2 — Client Deliverable) — Gap #44

**Purpose:** 1-click PDF generation for client quality proof — must render Thai/CJK text correctly

> **Document types:** This spec covers 2 distinct exports:
> 1. **QA Certificate** — 1-page summary for client delivery (this section)
> 2. **Smart Report** — Multi-page detailed report with 3-tier classification (see Smart Report sub-section below)
>
> Both are separate PDF documents. Certificate = quick proof. Smart Report = full audit detail.

#### Wireframe — QA Certificate PDF (A4 portrait, Page 1)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              ◆ QA QUALITY CERTIFICATE ◆                 │
│              ─────────────────────────                   │
│                                                         │
│  Project:    Client-ABC Localization                    │
│  File:       report_TH.sdlxliff                        │
│  Language:   EN → TH                                    │
│  Date:       2026-02-16                                 │
│  Reviewer:   คุณแพร (QA Reviewer)                       │
│                                                         │
│  ═══════════════════════════════════════════════════     │
│                                                         │
│                    QUALITY SCORE                         │
│                                                         │
│                  ┌──────────┐                            │
│                  │          │                            │
│                  │    97    │                            │
│                  │  / 100   │                            │
│                  │  PASSED  │                            │
│                  └──────────┘                            │
│                                                         │
│  ═══════════════════════════════════════════════════     │
│                                                         │
│  CHECK SUMMARY                                          │
│  ┌─────────────────────────────────┬────────┐           │
│  │ Rule-based checks (127 rules)  │ Pass   │           │
│  │ AI screening (L2 — 342 segs)   │ Pass   │           │
│  │ Deep analysis (L3 — 342 segs)  │ Pass   │           │
│  │ Glossary compliance            │ Pass   │           │
│  │ Consistency checks             │ Pass   │           │
│  └─────────────────────────────────┴────────┘           │
│                                                         │
│  FINDINGS SUMMARY                                       │
│  ┌──────────┬───────┬──────────────────────┐            │
│  │ Severity │ Count │ Resolution           │            │
│  │ Critical │   0   │ —                    │            │
│  │ Major    │   0   │ —                    │            │
│  │ Minor    │   2   │ 2 Accepted (cosmetic)│            │
│  └──────────┴───────┴──────────────────────┘            │
│                                                         │
│  MQM SCORE BREAKDOWN                                    │
│  Total words: 4,218                                     │
│  Penalty: 0 × 25 + 0 × 5 + 2 × 1 = 2                  │
│  NPT: 2 / 4.218 = 0.47 per 1,000 words                 │
│  Score: 100 − 0.47 = 99.53                              │
│  Display: 97 (adjusted: 2 minor findings applied -3)    │
│                                                         │
│  ═══════════════════════════════════════════════════     │
│                                                         │
│  CONCLUSION                                             │
│                                                         │
│  This file has passed automated quality assurance.      │
│  All rule-based and AI-powered checks completed.        │
│  No critical or major issues found.                     │
│                                                         │
│  ─────────────────────────────────────────────────      │
│  REPORT METADATA                                        │
│  AI Models: gpt-4o-mini-2024-07-18 (L2),               │
│             claude-sonnet-4-5-20250929 (L3)             │
│  Glossary: client-abc-v2.3 (1,247 terms)               │
│  Rule config: sha256:a1b2c3...                          │
│  Processing cost: $0.28                                 │
│                                                         │
│  Generated: 2026-02-16 14:32 UTC                        │
│  Tool: qa-localization-tool v1.0                        │
│  Certificate ID: cert-a1b2c3d4                          │
│  Verify: https://app.example.com/verify/cert-a1b2c3d4  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Verify URL:** Public route (no auth required) — allows clients to verify certificate authenticity without an account. Shows only: certificate ID, file name, score, date, pass/fail status. Does NOT expose finding details or segment text.

#### Wireframe — Detailed Findings Page (Page 2+, per Epic 8.1 AC)

Appended to certificate when "Include findings detail" is checked in preview modal.

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  DETAILED FINDINGS — report_TH.sdlxliff                │
│  ─────────────────────────────────────                   │
│                                                         │
│  CRITICAL FINDINGS (0)                                  │
│  No critical findings.                                  │
│                                                         │
│  MAJOR FINDINGS (0)                                     │
│  No major findings.                                     │
│                                                         │
│  MINOR FINDINGS (2)                                     │
│  ┌───┬──────────┬──────────────────────────────────────┐│
│  │ # │ Category │ Details                              ││
│  ├───┼──────────┼──────────────────────────────────────┤│
│  │ 1 │ Style    │ Seg #47: "transfer to your bank..." ││
│  │   │          │ SRC: "...transfer to your bank acc..." ││
│  │   │          │ TGT: "...โอนไปยังบัญชีธนาคาร..."      ││
│  │   │          │ Issue: Informal register detected    ││
│  │   │          │ Decision: Accepted (cosmetic)        ││
│  │   │          │ Detected by: L2 (AI, 89%)           ││
│  ├───┼──────────┼──────────────────────────────────────┤│
│  │ 2 │ Style    │ Seg #128: "click the button bel..." ││
│  │   │          │ SRC: "...click the button below..."   ││
│  │   │          │ TGT: "...คลิกปุ่มด้านล่าง..."         ││
│  │   │          │ Issue: Spacing inconsistency          ││
│  │   │          │ Decision: Accepted (cosmetic)        ││
│  │   │          │ Detected by: L1 (Rule-based)         ││
│  └───┴──────────┴──────────────────────────────────────┘│
│                                                         │
│  Terminology: Uses MQM standard category names          │
│  (not internal QA Cosmetic terms)                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Finding detail fields per Epic 8.1:** category, description, segment reference (`segment_number` + `source_excerpt_50chars` + `target_excerpt_50chars`), reviewer decision, detected by layer.

#### Smart Report — 3-Tier Classification (FR47, separate document)

Smart Report is a **separate PDF export** from the certificate. Used when non-native reviewers are involved and review confidence levels need to be communicated.

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              SMART QA REPORT                            │
│              report_TH.sdlxliff                         │
│              ────────────────────                        │
│                                                         │
│  TIER 1: VERIFIED (Native Reviewer)              12     │
│  ┌───────────────────────────────────────────────────┐  │
│  │ All findings reviewed and confirmed by native     │  │
│  │ Thai speaker. High confidence.                    │  │
│  │ [Finding list — same format as Detailed Findings] │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  TIER 2: NON-NATIVE ACCEPTED                      8    │
│  ┌───────────────────────────────────────────────────┐  │
│  │ "Accepted by non-native reviewer —                │  │
│  │  subject to native audit"                         │  │
│  │ [Finding list with non-native badge]              │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  TIER 3: NEEDS NATIVE REVIEW                      3    │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Flagged or pending items requiring native speaker │  │
│  │ verification before final sign-off.               │  │
│  │ [Finding list with flag/pending badge]            │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Excel Export Wireframe (FR46, .xlsx with 3 sheets)

```
Sheet 1: "Summary"
┌────────────┬──────────────────────────────┐
│ Field      │ Value                        │
├────────────┼──────────────────────────────┤
│ File       │ report_TH.sdlxliff           │
│ Language   │ EN → TH                      │
│ Score      │ 97 / 100                     │
│ Status     │ Passed                       │
│ Words      │ 4,218                        │
│ Critical   │ 0                            │
│ Major      │ 0                            │
│ Minor      │ 2                            │
│ Reviewed   │ 2026-02-16                   │
│ Reviewer   │ คุณแพร                        │
│ Mode       │ Thorough (L1+L2+L3)          │
│ AI Models  │ gpt-4o-mini, claude-sonnet   │
│ AI Cost    │ $0.28                        │
└────────────┴──────────────────────────────┘

Sheet 2: "Findings" (one row per finding, auto-filter enabled)
┌────┬──────┬──────────┬─────────┬──────────┬────────────┬──────────┬───────┐
│ #  │ Seg# │ Category │Severity │ Source   │ Target     │ Decision │ Layer │
├────┼──────┼──────────┼─────────┼──────────┼────────────┼──────────┼───────┤
│ 1  │ 47   │ Style    │ Minor   │ transf...│ โอนไปยัง...  │ Accepted │ L2    │
│ 2  │ 128  │ Style    │ Minor   │ click ...│ คลิกปุ่ม... │ Accepted │ L1    │
└────┴──────┴──────────┴─────────┴──────────┴────────────┴──────────┴───────┘
Conditional formatting: Critical=red fill, Major=orange fill, Minor=yellow fill

Sheet 3: "Segments" (full segment list)
┌────┬──────────────────────┬──────────────────────┬───────┬──────────┐
│ #  │ Source               │ Target               │ Words │ Findings │
├────┼──────────────────────┼──────────────────────┼───────┼──────────┤
│ 1  │ Welcome to...        │ ยินดีต้อนรับ...        │ 12    │ 0        │
│ 2  │ Please submit...     │ กรุณาส่ง...           │ 8     │ 0        │
│ 47 │ transfer to your...  │ โอนไปยังบัญชี...       │ 14    │ 1        │
└────┴──────────────────────┴──────────────────────┴───────┴──────────┘
```

#### Report Staleness UI

```
┌─────────────────────────────────────────────────────────┐
│ Previous Report                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [!] STALE — 3 finding decisions changed since       │ │
│ │ this report was generated on 2026-02-15.            │ │
│ │                                                     │ │
│ │ [Regenerate Report]   [View Changes]                │ │
│ │                                                     │ │
│ │ [Download PDF] ← disabled (grayed out)              │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

Fresh report (no staleness):
┌─────────────────────────────────────────────────────────┐
│ Latest Report — Generated 2026-02-16 14:32 UTC          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [Download PDF]  [Download Excel]  [Share Link]      │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Staleness logic:** On finding state override → query `exported_reports` → if `export_date < override_date` → flag as "Stale". Download disabled until regenerated.

**Typography for PDF:**

| Element | Font | Size | Weight | Notes |
|---------|------|:---:|:---:|-------|
| Title "QA QUALITY CERTIFICATE" | Inter | 24px | 700 | Uppercase, letter-spacing 2px |
| Section headers | Inter | 14px | 600 | Uppercase, letter-spacing 1px, line-height 1.4 (matches H3 scale) |
| Body text (EN) | Inter | 12px | 400 | |
| Body text (TH) | Sarabun | 14px | 400 | 2px larger for Thai readability |
| Body text (CJK) | Noto Sans CJK | 14px | 400 | |
| Score number | Inter (tabular) | 48px | 700 | Centered in score circle |
| Table data | Inter | 11px | 400 | |
| Footer/metadata | Inter | 9px | 400 | Slate-500 color |

**Score Circle Color:**

| Score Range | Circle Color | Label | Condition |
|:---:|---|---|---|
| >= 95 | `emerald-500` (#10B981) | PASSED | Score >= 95 AND 0 Critical findings (aligns with ScoreBadge "Pass" state) |
| 70-94 OR has Critical | `orange-500` (#F97316) | REVIEWED | Score 70-94, OR score >= 95 but has Critical findings |
| < 70 | `red-500` (#EF4444) | BELOW THRESHOLD | Score < 70 regardless of findings |

**PDF Generation Strategy:**

| Option | Pros | Cons | Recommendation |
|--------|------|------|:---:|
| `@react-pdf/renderer` | Lightweight, React components, SSR-friendly | Limited CJK font support, layout constraints | MVP |
| Puppeteer/Playwright | Pixel-perfect, full CSS, Thai/CJK native | Heavy (Chrome binary), memory on Vercel | Growth |
| HTML-to-PDF service (e.g., DocRaptor) | Best quality, no infra | External dependency, cost | Alternative |

**MVP approach:** Use `@react-pdf/renderer` with embedded Sarabun (Thai) and Noto Sans CJK fonts. Font files bundled in `/public/fonts/`.

**CRITICAL — Thai/CJK Rendering POC Required:**
`@react-pdf/renderer` has known limitations with complex scripts. Before committing to this library for Story 8.1:
1. Create a POC rendering 50 Thai segments + 50 CJK segments
2. Verify: line-breaking, tone marks, combining characters, mixed EN/TH text
3. If POC fails → fallback to Puppeteer (server-side Chrome) immediately
4. POC should be done in Sprint 1-2 as a spike, not deferred to Story 8.1

**Interaction Flow:**
1. User clicks "Generate Certificate" on reviewed file
2. Modal opens with live preview (React component rendering)
3. Options: "Include findings detail" checkbox, "Format: Certificate / Smart Report" toggle
4. "Download PDF" → server-side generation via Route Handler
5. PDF returned as blob → browser download dialog
6. Certificate ID stored in `exported_reports` table with `format: 'pdf'`

**States:**

| State | Visual |
|-------|--------|
| **Ready** | "Generate Certificate" button enabled (file must be review-complete) |
| **Preview** | Modal with certificate preview + options, "Download PDF" / "Download Excel" buttons |
| **Generating** | Spinner on download button, "Generating PDF..." |
| **Complete** | Toast "Certificate downloaded", link to re-download in file history |
| **Stale** | Orange "STALE" badge, "Regenerate" button, Download PDF disabled |
| **Error** | Toast error + "Retry" button |
| **Not eligible** | Button disabled, tooltip "Complete review to generate certificate" |

**Smart Report — 3-Tier Badge Colors:**

| Tier | Badge Color | Background | Text | Usage |
|------|------------|:---:|:---:|-------|
| Tier 1: Verified | `emerald-100` bg | `emerald-50` | `emerald-900` | Native reviewer confirmed — highest confidence (text -900 per severity pattern) |
| Tier 2: Non-native Accepted | `amber-100` bg | `amber-50` | `amber-900` | Non-native accepted — subject to audit (text -900 per severity pattern) |
| Tier 3: Needs Native Review | `orange-100` bg | `orange-50` | `orange-900` | Flagged/pending — requires native verification (text -900 per severity pattern) |

> Cross-reference: Tier colors follow confidence token pattern (`--confidence-high` = emerald, `--confidence-medium` = amber). Tier 3 uses `orange` (not red) to indicate "needs action" rather than "failure".

**Excel Conditional Formatting — Severity Hex Values:**

| Severity | Fill Color (Hex) | Font Color (Hex) | Design Token Mapping |
|----------|:---:|:---:|---|
| Critical | `#FEE2E2` (red-100) | `#DC2626` (red-600) | `--severity-critical` bg/text |
| Major | `#FFEDD5` (orange-100) | `#F97316` (orange-500) | `--severity-major` bg/text (orange-500 per visual-design-foundation) |
| Minor | `#FEF9C3` (yellow-100) | `#CA8A04` (yellow-600) | `--severity-minor` bg/text |
| Pass (header) | `#D1FAE5` (emerald-100) | `#059669` (emerald-600) | `--status-pass` |

> These hex values must be used in the `xlsx` library's `fill` and `font` options to match the web UI severity colors exactly.

**PDF Font Files (bundled in `/public/fonts/`):**

| Font | File | Weight | Usage |
|------|------|:---:|-------|
| Inter | `Inter-Regular.ttf` | 400 | EN body text, metadata |
| Inter | `Inter-SemiBold.ttf` | 600 | Section headers |
| Inter | `Inter-Bold.ttf` | 700 | Title, score number |
| Sarabun | `Sarabun-Regular.ttf` | 400 | Thai body text |
| Sarabun | `Sarabun-SemiBold.ttf` | 600 | Thai headers |
| Noto Sans CJK | `NotoSansCJKsc-Regular.otf` | 400 | CJK body text |
| Noto Sans CJK | `NotoSansCJKsc-Bold.otf` | 700 | CJK headers |

> **Warning:** Noto Sans CJK font files are ~16MB each. For `@react-pdf/renderer`, use subset fonts or load on-demand. Full font files acceptable for server-side Puppeteer fallback.

**Preview Modal Layout:**

| Breakpoint | Behavior |
|:---:|---|
| Desktop 1440px+ | Modal 800px wide, certificate preview at ~70% A4 scale, scroll for Page 2+ |
| Desktop 1024-1439px | Modal 720px wide, same layout |
| Tablet 768-1023px | Modal full-width with 16px padding, preview scaled down |
| Mobile <768px | Modal hidden. "Generate Certificate" shows `toast.info("Switch to desktop to preview certificates")`. Direct download (no preview) still available via button |

**Interaction Integration:**
- Generate button → opens `Dialog` → preview renders as React component (same layout as PDF)
- "Download PDF" → `POST /api/reports/certificate` → server-side `@react-pdf/renderer` → blob → browser download
- "Download Excel" → `POST /api/reports/excel` → server-side `xlsx` generation → blob → browser download
- "Share Link" → copies `https://app.example.com/verify/{cert-id}` to clipboard
- Stale detection: on dialog open, check `exported_reports` staleness → show alert if stale
- Loading state: `Loader2` spinner on button + `DialogContent` shows skeleton preview during generation

### ScoreChangeLog (P2 — Audit Trail)

**Purpose:** Timeline of score changes with reasons — audit trail for accountability

**Anatomy:** Vertical timeline: each entry shows timestamp, action (Accept/Reject/Flag), score delta, cumulative score. Git-commit-history style.

### ReviewerSelector (P1 — Collaboration)

**Purpose:** PM selects QA reviewer to route critical issues to — with availability and language pair matching

**Anatomy:** See Reviewer Selection UI wireframe in UJ4 section.

**States:**
- **Default:** Reviewer list filtered by file's language pair
- **Selected:** Chosen reviewer highlighted, Send button enabled
- **Sent:** Confirmation toast, finding list updates with "Routed to คุณแพร" badge

**Accessibility:** `role="listbox"` with `aria-label="Select reviewer"`, availability indicator has text label not just color

### FindingPattern (P2 — Cross-File Intelligence)

**Purpose:** Group related findings across multiple files — "This pattern appears in 5 files"

**Anatomy:** Pattern description + instance count + file list + "Resolve all instances" bulk action.

**Architecture Note:** This is a backend-heavy feature, not just a UI component. Requires:
- Similarity detection algorithm (embedding-based or regex pattern matching) in backend
- Cross-file index structure in Supabase
- "Resolve all" = batch mutation across multiple files
- Must be designed in Architecture phase alongside the UI component

## Component Implementation Strategy

### Build Approach

| Principle | Implementation |
|-----------|---------------|
| **shadcn/ui as foundation** | Install base components first, customize incrementally |
| **Composition over inheritance** | Custom components compose shadcn primitives — never fork |
| **Tokens for consistency** | All custom components use shared design tokens from Visual Foundation |
| **Storybook-driven** | Each custom component gets Storybook stories for all states/variants |
| **Accessibility-first** | ARIA attributes and keyboard support built in from day 1, not bolted on |

### Shared Patterns Across Custom Components

| Pattern | Components Using It | Implementation |
|---------|-------------------|----------------|
| **State tinting** | FindingCard, FindingCardCompact | Background color from state → CSS variable |
| **Keyboard shortcut** | FindingCard, BatchSummary, ReviewProgress | Shared `useKeyboardActions` hook |
| **Score animation** | ScoreBadge, ScoreChangeLog | Shared `useAnimatedNumber` hook |
| **Progressive loading** | LanguageBridge, FindingCard (ai-pending) | Skeleton → content transition |
| **Bulk selection** | FindingCard, FileStatusCard | Shared `useBulkSelection` hook |
| **Keyboard range select** | FindingCard (Shift+J/K) | Shared `useKeyboardRangeSelect` hook — TanStack Table lacks native keyboard range select |
| **Optimistic update** | FindingCard, ScoreBadge | Shared pattern: `useMutation` + optimistic UI + server reconciliation |

## Implementation Roadmap

### Phase 1 — Core Review Loop (MVP Sprint 1-3)

> **Note (Party Mode Review):** Timeline adjusted from 2 to 3 sprints based on developer review. FindingCardCompact→FindingCard inline transition requires custom TanStack Table work, and keyboard range select needs a new custom hook.

| Order | Component | Type | Dependency | Effort |
|:-----:|-----------|:----:|------------|:------:|
| 1 | Data Table setup + custom row expansion | shadcn | None | L |
| 2 | Badge (severity/layer/confidence) | shadcn | None | S |
| 3 | ScoreBadge | Custom | None | S |
| 4 | FindingCardCompact | Custom | Badge, ScoreBadge | M |
| 5 | FindingCard | Custom | FindingCardCompact, Badge | L |
| 6 | `useKeyboardRangeSelect` hook | Custom | Data Table | M |
| 7 | Sheet (detail panel) | shadcn | None | S |
| 8 | SegmentContext | Custom | None | M |
| 9 | ReviewProgress | Custom | Progress (shadcn) | S |
| 10 | Command palette (3-tier search) | shadcn | None | M |
| 11 | Toast notifications | shadcn | None | S |

### Phase 2 — Batch & Language Bridge (MVP Sprint 4-5)

| Order | Component | Type | Dependency | Effort |
|:-----:|-----------|:----:|------------|:------:|
| 12 | FileStatusCard | Custom | ScoreBadge, Badge | M |
| 13 | BatchSummary | Custom | FileStatusCard | L |
| 14 | LanguageBridge | Custom | None | L |
| 15 | ReviewerSelector | Custom | None | M |
| 16 | Dialog (bulk confirmation) | shadcn | None | S |
| 17 | Skeleton (AI loading) | shadcn | None | S |
| 18 | Alert (error states) | shadcn | None | S |

### Phase 3 — Dashboard & Trust (MVP Sprint 6-7)

| Order | Component | Type | Dependency | Effort |
|:-----:|-----------|:----:|------------|:------:|
| 19 | Card (metric cards) | shadcn | None | S |
| 20 | Charts (trend graphs) | shadcn | None | M |
| 21 | AILearningIndicator | Custom | Charts | M |
| 22 | Tabs (score breakdown sections) | shadcn | None | S |
| 23 | ScoreChangeLog | Custom | None | M |
| 24 | Lightweight PM Onboarding (3-step) | Custom | BatchSummary | M |

### Phase 4 — Polish & Advanced (Post-MVP)

| Order | Component | Type | Dependency | Effort |
|:-----:|-----------|:----:|------------|:------:|
| 25 | QACertificate (server-side PDF) | Custom | ScoreBadge, all data, backend PDF pipeline | L |
| 26 | FindingPattern (requires backend similarity engine) | Custom | FindingCard, backend | L |
| 27 | OnboardingTour (full 5-step) | Custom | All review components | L |

**Effort legend:** S = Small (< 1 day) | M = Medium (1-2 days) | L = Large (3-5 days)

**Total:** 16 shadcn (configure) + 14 custom (build) = 30 components (+2 from Party Mode review: ReviewerSelector, PM Onboarding)
**Critical path:** Phase 1 — Data Table + FindingCard inline expansion + keyboard range select are the highest-risk items
**Timeline:** 7 MVP sprints (adjusted from 6 based on Party Mode developer review)
