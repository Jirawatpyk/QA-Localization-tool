# Component Strategy

### Component-to-Journey Dependency Map

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

### Component Composition Tree

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

### Custom Component Specifications

#### FindingCard (P0 — Core Loop)

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

#### FindingCardCompact (P0 — Scanning Mode)

**Purpose:** Maximally dense row for rapid scanning — power user default

**Anatomy:**
```
│ 🔴 │ Terminology │ AI │ "bank → ริม..." │ 94% │ ✓ ✗ │
```

**Columns:** Severity icon (16px) | Category (text) | Layer badge (Rule/AI) | Preview (truncated source→target) | Confidence % | Quick actions (Accept/Reject icons)

**States:** Same 8 states as FindingCard — indicated by row background tint + left border color

**Interaction:** Click/Enter → expands inline to full FindingCard. Quick action icons allow Accept/Reject without expanding.

#### LanguageBridge (P0 — Non-Native Critical)

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

#### BatchSummary (P0 — Entry Point for UJ2/UJ3/UJ4)

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

#### ScoreBadge (P0 — Ubiquitous)

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

#### ReviewProgress (P0 — Review Session Tracking)

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

#### SegmentContext (P1 — Decision Support)

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

#### AILearningIndicator (P1 — Trust Building)

**Purpose:** Make AI improvement visible — builds trust through demonstrated growth

**Anatomy:**
```
┌──────────────────────────────────────┐
│ AI Learning — EN→TH                  │
│──────────────────────────────────────│
│ Accuracy:  47% → 92%   +45%         │
│ Patterns learned: 23                 │
│ From your feedback: 18               │
│ Last improved: 2 hours ago           │
│──────────────────────────────────────│
│ [View learned patterns]              │
└──────────────────────────────────────┘
```

**States:**
- **Learning:** Pulse animation after user provides feedback — "Learning from your feedback..."
- **Improved:** Green highlight when accuracy increases — shows delta
- **Stable:** Neutral — no recent changes
- **New Language:** "Building model for EN→ZH — needs 10+ feedbacks to calibrate"

#### FileStatusCard (P1 — Batch Context)

**Purpose:** Per-file status row in batch summary and dashboard

**Anatomy:**
```
│ doc-03.xlf │ 82 │ Need Review │ 2C 3M 14m │ [Review] │
```

**Columns:** Filename | ScoreBadge (sm) | Status | Issue counts by severity | Action button

#### QACertificate (P2 — Client Deliverable)

**Purpose:** 1-click PDF generation for client quality proof

**Anatomy:** Modal preview showing: file metadata, score, all check categories with pass/fail status, issue summary, conclusion statement, timestamp + reviewer info.

**Interaction:** Preview in modal (React component) → "Download PDF" button → server-side PDF generation via Puppeteer/Playwright snapshot for pixel-perfect Thai text rendering. Client-side jsPDF fallback if server unavailable.

#### ScoreChangeLog (P2 — Audit Trail)

**Purpose:** Timeline of score changes with reasons — audit trail for accountability

**Anatomy:** Vertical timeline: each entry shows timestamp, action (Accept/Reject/Flag), score delta, cumulative score. Git-commit-history style.

#### ReviewerSelector (P1 — Collaboration)

**Purpose:** PM selects QA reviewer to route critical issues to — with availability and language pair matching

**Anatomy:** See Reviewer Selection UI wireframe in UJ4 section.

**States:**
- **Default:** Reviewer list filtered by file's language pair
- **Selected:** Chosen reviewer highlighted, Send button enabled
- **Sent:** Confirmation toast, finding list updates with "Routed to คุณแพร" badge

**Accessibility:** `role="listbox"` with `aria-label="Select reviewer"`, availability indicator has text label not just color

#### FindingPattern (P2 — Cross-File Intelligence)

**Purpose:** Group related findings across multiple files — "This pattern appears in 5 files"

**Anatomy:** Pattern description + instance count + file list + "Resolve all instances" bulk action.

**Architecture Note:** This is a backend-heavy feature, not just a UI component. Requires:
- Similarity detection algorithm (embedding-based or regex pattern matching) in backend
- Cross-file index structure in Supabase
- "Resolve all" = batch mutation across multiple files
- Must be designed in Architecture phase alongside the UI component

### Component Implementation Strategy

#### Build Approach

| Principle | Implementation |
|-----------|---------------|
| **shadcn/ui as foundation** | Install base components first, customize incrementally |
| **Composition over inheritance** | Custom components compose shadcn primitives — never fork |
| **Tokens for consistency** | All custom components use shared design tokens from Visual Foundation |
| **Storybook-driven** | Each custom component gets Storybook stories for all states/variants |
| **Accessibility-first** | ARIA attributes and keyboard support built in from day 1, not bolted on |

#### Shared Patterns Across Custom Components

| Pattern | Components Using It | Implementation |
|---------|-------------------|----------------|
| **State tinting** | FindingCard, FindingCardCompact | Background color from state → CSS variable |
| **Keyboard shortcut** | FindingCard, BatchSummary, ReviewProgress | Shared `useKeyboardActions` hook |
| **Score animation** | ScoreBadge, ScoreChangeLog | Shared `useAnimatedNumber` hook |
| **Progressive loading** | LanguageBridge, FindingCard (ai-pending) | Skeleton → content transition |
| **Bulk selection** | FindingCard, FileStatusCard | Shared `useBulkSelection` hook |
| **Keyboard range select** | FindingCard (Shift+J/K) | Shared `useKeyboardRangeSelect` hook — TanStack Table lacks native keyboard range select |
| **Optimistic update** | FindingCard, ScoreBadge | Shared pattern: `useMutation` + optimistic UI + server reconciliation |

### Implementation Roadmap

#### Phase 1 — Core Review Loop (MVP Sprint 1-3)

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

#### Phase 2 — Batch & Language Bridge (MVP Sprint 4-5)

| Order | Component | Type | Dependency | Effort |
|:-----:|-----------|:----:|------------|:------:|
| 12 | FileStatusCard | Custom | ScoreBadge, Badge | M |
| 13 | BatchSummary | Custom | FileStatusCard | L |
| 14 | LanguageBridge | Custom | None | L |
| 15 | ReviewerSelector | Custom | None | M |
| 16 | Dialog (bulk confirmation) | shadcn | None | S |
| 17 | Skeleton (AI loading) | shadcn | None | S |
| 18 | Alert (error states) | shadcn | None | S |

#### Phase 3 — Dashboard & Trust (MVP Sprint 6-7)

| Order | Component | Type | Dependency | Effort |
|:-----:|-----------|:----:|------------|:------:|
| 19 | Card (metric cards) | shadcn | None | S |
| 20 | Charts (trend graphs) | shadcn | None | M |
| 21 | AILearningIndicator | Custom | Charts | M |
| 22 | Tabs (score breakdown sections) | shadcn | None | S |
| 23 | ScoreChangeLog | Custom | None | M |
| 24 | Lightweight PM Onboarding (3-step) | Custom | BatchSummary | M |

#### Phase 4 — Polish & Advanced (Post-MVP)

| Order | Component | Type | Dependency | Effort |
|:-----:|-----------|:----:|------------|:------:|
| 25 | QACertificate (server-side PDF) | Custom | ScoreBadge, all data, backend PDF pipeline | L |
| 26 | FindingPattern (requires backend similarity engine) | Custom | FindingCard, backend | L |
| 27 | OnboardingTour (full 5-step) | Custom | All review components | L |

**Effort legend:** S = Small (< 1 day) | M = Medium (1-2 days) | L = Large (3-5 days)

**Total:** 16 shadcn (configure) + 14 custom (build) = 30 components (+2 from Party Mode review: ReviewerSelector, PM Onboarding)
**Critical path:** Phase 1 — Data Table + FindingCard inline expansion + keyboard range select are the highest-risk items
**Timeline:** 7 MVP sprints (adjusted from 6 based on Party Mode developer review)
