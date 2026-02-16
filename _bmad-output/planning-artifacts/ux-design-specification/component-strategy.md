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

**Purpose:** 5-step guided tour for first-time users — builds initial trust and reduces time-to-first-value

**Library:** `driver.js` (v1.3+)
- 5KB gzipped, zero dependencies, TypeScript native
- Supports highlight + popover positioning, step-by-step navigation
- `prefers-reduced-motion` respected, keyboard accessible (Tab/Enter/Esc)
- Install: `npm install driver.js`

**5-Step Flow** (from UJ1: First-Time Setup):

| Step | Target Element | Title | Content | Position |
|:---:|---|---|---|:---:|
| 1 | App shell (full overlay) | Welcome to QA Localization Tool | "Your AI-powered QA assistant — catches everything Xbench catches, plus semantic issues Xbench can't." Skip tour link visible. | center |
| 2 | Project create button | Create a Project | "Start by setting your language pair and QA mode. Tip: try with a file you already QA'd in Xbench." | bottom |
| 3 | Glossary nav item | Import Your Glossary | "Import your existing glossary (CSV/XLSX/TBX) — terminology checks start immediately." | right |
| 4 | Upload zone | Upload & Process | "Drag XLIFF/SDLXLIFF files here. Rule-based results appear in under 3 seconds." | bottom |
| 5 | Keyboard shortcuts indicator | Keyboard-First Review | "A=Accept, R=Reject, F=Flag, J/K=Navigate. Review 300+ findings/day without touching your mouse." | left |

**Wireframe:**
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   ┌─── Highlighted Element ───────────────┐             │
│   │   (pulsing border, rest dimmed)       │             │
│   └───────────────────────────────────────┘             │
│       ┌─────────────────────────────────┐               │
│       │ Step 2 of 5                     │               │
│       │                                 │               │
│       │ 🚀 Create a Project             │               │
│       │                                 │               │
│       │ Start by setting your language  │               │
│       │ pair and QA mode.               │               │
│       │                                 │               │
│       │ Tip: try with a file you        │               │
│       │ already QA'd in Xbench.         │               │
│       │                                 │               │
│       │ [← Back]  ● ● ◉ ● ●  [Next →]  │               │
│       │              [Skip tour]         │               │
│       └─────────────────────────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Variants:**

| Variant | Steps | Target User | Trigger |
|---------|:---:|---|---|
| `full` (default) | 5 | QA Reviewer first login | `!user.hasCompletedOnboarding` |
| `pm-lite` | 3 | PM first login (from UJ4) | Role = PM + first login |
| `feature-spotlight` | 1 | Any user after feature release | Feature flag per spotlight |

**States:**
- **Active:** Dimmed overlay, highlighted element, popover visible
- **Skipped:** User clicks "Skip tour" → `onboarding_completed_at` set, tour never shows again
- **Completed:** All 5 steps done → success toast "You're all set! Press Ctrl+K anytime for help."
- **Re-triggerable:** Settings → Help → "Replay onboarding tour"

**Accessibility:**
- `aria-live="polite"` announces step changes
- `Esc` exits tour at any step
- Tab cycles through Back/Next/Skip buttons
- Tour content readable by screen reader

**Persistence:** `users` metadata or localStorage flag `onboarding_completed`. Server-side preferred (persists across devices).

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
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Processing Mode Default                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Default mode:  (●) Economy (L1+L2)                  │ │
│ │                ( ) Thorough (L1+L2+L3)              │ │
│ │                                                     │ │
│ │ Note: Users can override per-batch at upload time.  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ AI Model Configuration                                  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ L2 Screening:   gpt-4o-mini (pinned)       [Info]  │ │
│ │ L3 Deep:        claude-sonnet-4-5 (pinned)  [Info]  │ │
│ │                                                     │ │
│ │ ⓘ Models are pinned for reproducibility.            │ │
│ │   Contact admin to update model versions.           │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [Save Changes]                                          │
└─────────────────────────────────────────────────────────┘
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

**States:**

| State | Visual | Condition |
|-------|--------|-----------|
| **Within budget** | Green progress bar, "✅ Within budget" | Usage < alert threshold |
| **Approaching limit** | Orange progress bar, "⚠️ 80% of budget used" | Usage >= alert threshold |
| **Over budget** | Red progress bar, "🚫 Budget exceeded — AI processing paused" | Usage > 100% |
| **Unlimited** | No progress bar, "No budget limit set" | `ai_budget_monthly_usd` = NULL |
| **No data** | Empty state with "Process your first file to see AI usage" | Zero usage |

**RBAC:**

| Element | Admin | QA Reviewer | PM |
|---------|:---:|:---:|:---:|
| Budget setting | Edit | View | View |
| Mode default | Edit | View | Edit |
| Model config | View | View | View |
| Usage dashboard | Full | Own files | Full |
| Alert threshold | Edit | — | Edit |

**Accessibility:**
- Budget input: `aria-label="Monthly AI budget in USD"`, `type="number"`, `step="0.01"`
- Progress bar: `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax`
- Chart: `aria-label` with text summary, data table fallback for screen readers

---

### QACertificate (P2 — Client Deliverable) — Gap #44

**Purpose:** 1-click PDF generation for client quality proof — must render Thai/CJK text correctly

**Wireframe — PDF Layout (A4 portrait):**
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
│  │ Rule-based checks (127 rules)  │ ✅ Pass │           │
│  │ AI screening (L2 — 342 segs)   │ ✅ Pass │           │
│  │ Deep analysis (L3 — 342 segs)  │ ✅ Pass │           │
│  │ Glossary compliance            │ ✅ Pass │           │
│  │ Consistency checks             │ ✅ Pass │           │
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
│  NPT (Normalized Penalty Total): 0.47 per 1,000 words  │
│  Penalty: 0 × 25 + 0 × 5 + 2 × 1 = 2                  │
│  Score: max(0, 100 − (2 / 4.218)) = 99.53 → 97*       │
│  * Rounded display score                                │
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
│  Generated: 2026-02-16 14:32 UTC                        │
│  Tool: qa-localization-tool v1.0                        │
│  Certificate ID: cert-a1b2c3d4                          │
│  Verify: /verify/cert-a1b2c3d4                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Typography for PDF:**

| Element | Font | Size | Weight | Notes |
|---------|------|:---:|:---:|-------|
| Title "QA QUALITY CERTIFICATE" | Inter | 24px | 700 | Uppercase, letter-spacing 2px |
| Section headers | Inter | 14px | 600 | Uppercase, letter-spacing 1px |
| Body text (EN) | Inter | 12px | 400 | |
| Body text (TH) | Sarabun | 14px | 400 | 2px larger for Thai readability |
| Body text (CJK) | Noto Sans CJK | 14px | 400 | |
| Score number | Inter (tabular) | 48px | 700 | Centered in score circle |
| Table data | Inter | 11px | 400 | |
| Footer/metadata | Inter | 9px | 400 | Slate-500 color |

**Score Circle Color:**

| Score Range | Circle Color | Label |
|:---:|---|---|
| >= 95 | `emerald-500` (#10B981) | PASSED |
| 70-94 | `orange-500` (#F97316) | REVIEWED |
| < 70 | `red-500` (#EF4444) | BELOW THRESHOLD |

**PDF Generation Strategy:**

| Option | Pros | Cons | Recommendation |
|--------|------|------|:---:|
| `@react-pdf/renderer` | Lightweight, React components, SSR-friendly | Limited CJK font support, layout constraints | MVP ⭐ |
| Puppeteer/Playwright | Pixel-perfect, full CSS, Thai/CJK native | Heavy (Chrome binary), memory on Vercel | Growth |
| HTML → PDF service (e.g., DocRaptor) | Best quality, no infra | External dependency, cost | Alternative |

**MVP approach:** Use `@react-pdf/renderer` with embedded Sarabun (Thai) and Noto Sans CJK fonts. Font files bundled in `/public/fonts/`. If CJK rendering quality is insufficient, upgrade to Puppeteer in Growth phase.

**Interaction Flow:**
1. User clicks "Generate Certificate" on reviewed file
2. Modal opens with live preview (React component rendering)
3. "Download PDF" → server-side generation via Route Handler
4. PDF returned as blob → browser download dialog
5. Certificate ID stored in `exported_reports` table with `format: 'pdf'`

**States:**

| State | Visual |
|-------|--------|
| **Ready** | "Generate Certificate" button enabled (file must be review-complete) |
| **Preview** | Modal with certificate preview, "Download PDF" button |
| **Generating** | Spinner on download button, "Generating PDF..." |
| **Complete** | Toast "Certificate downloaded", link to re-download in file history |
| **Error** | Toast error + "Retry" button |
| **Not eligible** | Button disabled, tooltip "Complete review to generate certificate" |

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
