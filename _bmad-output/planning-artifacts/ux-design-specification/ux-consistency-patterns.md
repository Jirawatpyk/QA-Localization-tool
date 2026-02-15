# UX Consistency Patterns

## 1. Action Patterns

### Action Hierarchy

| Level | Action | Visual | Shortcut | Usage |
|:-----:|--------|--------|:--------:|-------|
| **Primary** | Accept | Green filled button | `A` | Confirm finding is valid — most frequent action |
| **Primary** | Reject | Red filled button | `R` | Dismiss finding as false positive |
| **Secondary** | Flag | Yellow outline button | `F` | Mark for native review / escalation |
| **Secondary** | Note | Blue outline button | `N` | Add stylistic observation — marks finding as 'Noted' (no MQM score penalty) |
| **Tertiary** | Source Issue | Purple outline button | `S` | Reclassify as source problem |
| **Tertiary** | Add Finding | Ghost button with `+` | `+` | Manually add finding not caught by system |
| **Destructive** | Severity Override | Dropdown in context menu | — | Change severity level (logged + reversible) |

### Action Feedback Pattern

Every action follows the same feedback cycle:

```
User Action → Visual State Change (instant) → Score Update (300ms morph)
→ Toast Confirmation (subtle) → Auto-advance to next pending finding
```

| Step | Timing | Visual |
|------|:------:|--------|
| State change | 0ms | Row background tint changes immediately |
| Score morph | 300ms | Score number animates up/down |
| Toast | 500ms | "Finding accepted. Score: 87 → 89" — auto-dismiss 3s |
| Auto-advance | 200ms after action | Focus moves to next pending finding |

### Action Reversibility

| Pattern | Rule | Implementation |
|---------|------|----------------|
| **All actions reversible** | No action is permanent — override appends new entry | Immutable log, latest entry = current state |
| **Undo shortcut** | `Ctrl+Z` undoes last action within current session | Reverts to previous state, re-applies score |
| **Override badge** | Changed decisions show "Override" badge | Audit trail visible in finding detail |
| **No confirmation for single actions** | Accept/Reject/Flag = instant, no dialog | Speed is critical for 300 findings/day |
| **Confirmation for bulk > 5** | Bulk actions on 6+ items show confirmation dialog | Prevents accidental mass actions |
| **Bulk undo = undo entire batch** | `Ctrl+Z` after bulk accept 8 items → undo all 8, not just last 1 | Bulk action is atomic — undo is atomic too |
| **Undo stack depth** | 20 actions per session, oldest dropped on overflow | Balance memory vs safety |

### Bulk Action Pattern

```
Select (Shift+Click or Shift+J/K) → Bulk Action Bar appears at bottom
→ Show count: "8 findings selected"
→ [Bulk Accept] [Bulk Reject] [Clear Selection]
→ If > 5: Confirmation Dialog with summary
→ Execute → Individual toasts suppressed → Single summary toast
```

## 2. Feedback & Status Patterns

### Notification Hierarchy

| Type | Visual | Position | Duration | Use Case |
|------|--------|:--------:|:--------:|----------|
| **Success** | Green toast, checkmark icon | Bottom-right | 3s auto-dismiss | Action completed, file passed |
| **Warning** | Yellow toast, alert icon | Bottom-right | 5s, manual dismiss | Confidence below threshold, bulk action large |
| **Error** | Red toast, error icon | Top-center | Persistent until dismissed | File parse failed, AI error, network issue |
| **Info** | Blue toast, info icon | Bottom-right | 4s auto-dismiss | AI layer complete, batch status update |
| **Progress** | Indigo inline indicator | In-context | Until complete | AI processing, file uploading |
| **Learning** | Purple inline badge | After action | 5s | "AI learning from your feedback" |

### Status Color System

Consistent across all components:

| Color | Semantic | Used For |
|-------|----------|----------|
| **Green** | Safe / Complete / Pass | Auto-pass, accepted, score >= 95, high confidence |
| **Orange** | Attention / Review | Need review, score 70-94, medium confidence |
| **Red** | Critical / Fail / Urgent | Critical severity, score < 70, low confidence, errors |
| **Yellow** | Warning / Minor / Flagged | Minor severity, flagged findings, warnings |
| **Blue** | Info / Rule / Neutral | Rule-based layer, noted findings, informational |
| **Purple/Indigo** | AI / Processing / Premium | AI layer, processing state, AI learning |
| **Gray** | Inactive / Pending | Pending state, disabled, placeholder |

### Score Change Feedback

Every score change is communicated consistently:

| Trigger | Visual | Animation |
|---------|--------|-----------|
| Finding accepted (penalty removed) | Score number increases, green flash | Slide up 300ms |
| Finding rejected (penalty kept) | Score unchanged, subtle gray pulse | None |
| AI findings arrive | Score may drop, orange flash if significant | Slide down 300ms |
| Batch confirm | All files update simultaneously | Staggered animation per file |

## 3. Loading & Progressive Patterns

### 3-Layer Progressive Loading

```
PHASE 1: Upload (0-1s)
┌──────────────────────────────────────┐
│ Uploading file...                    │
└──────────────────────────────────────┘

PHASE 2: Rule-based (1-3s)
┌──────────────────────────────────────┐
│ Rule-based complete                  │
│ 14 findings found                    │
│ Score: 88 (Rule-based)               │
│ AI analyzing...                      │
└──────────────────────────────────────┘

PHASE 3: AI Layer 2 (10-30s)
┌──────────────────────────────────────┐
│ Rule-based: 14 findings              │
│ AI L2: 8/12 segments                 │
│ Score: 84 (Analyzing...)             │
└──────────────────────────────────────┘

PHASE 4: AI Layer 3 — Thorough only (30-120s)
┌──────────────────────────────────────┐
│ Rule-based: 14 findings              │
│ AI L2: Complete                      │
│ AI L3: Deep analysis                 │
│ Score: 82 (Analyzing...)             │
└──────────────────────────────────────┘

PHASE 5: Complete
┌──────────────────────────────────────┐
│ All layers complete                  │
│ Score: 82 (Final)                    │
│ 2 Critical, 3 Major, 14 Minor       │
└──────────────────────────────────────┘
```

### Loading State Rules

| Rule | Implementation |
|------|----------------|
| **Never block the user** | Rule-based results are reviewable immediately while AI processes |
| **Show what's done, not what's pending** | Display completed findings first, AI pending as badge |
| **Skeleton for incoming content** | AI suggestion area shows skeleton until loaded |
| **Progress is always visible** | ReviewProgress component always in view during review |
| **Notification on completion** | Toast + badge when AI layers finish for background processing |
| **Partial results are preserved** | If AI times out, rule-based results remain valid and actionable |

### Skeleton Loading Pattern

```
Before AI loads:
┌─────────────────────────────────────────┐
│ Critical │ Terminology │ AI             │
│─────────────────────────────────────────│
│ SRC: "Please transfer to your bank..." │
│ TGT: "กรุณาโอนไปยัง..."               │
│─────────────────────────────────────────│
│ ░░░░░░░░░░░░░░░░░░░  ← Suggestion      │
│ ░░░░░░░  ← Confidence                  │
│─────────────────────────────────────────│
│ [A] [R] [F] [N]  ← Actions available   │
└─────────────────────────────────────────┘
```

Actions are available even before AI suggestion loads — user can Accept/Reject based on source/target alone.

## 4. Navigation Patterns

### Drill-Down Hierarchy

```
Dashboard → Project → Batch → File → Finding → Detail Panel
   (L1)      (L2)     (L3)    (L4)    (L5)       (L5 side)
```

| Level | View | Back Navigation | Keyboard |
|:-----:|------|:---------------:|:--------:|
| L1 | Dashboard overview | — | — |
| L2 | Project file list | Breadcrumb → Dashboard | `Esc` |
| L3 | Batch summary | Breadcrumb → Project | `Esc` |
| L4 | File review (finding list) | Breadcrumb → Batch | `Esc` or `[` |
| L5 | Finding focused + detail panel | `Esc` → unfocus finding | `Esc` |

### Breadcrumb Pattern

Always visible at top of content area:

```
Dashboard / Project-ABC / Batch-Mon / file-03.xlf / Finding #14
```

- Each segment is clickable — navigates to that level
- Current level is bold, not clickable
- Truncation: middle segments collapse to `...` if > 4 levels

### Keyboard Navigation Master Pattern

| Context | Key | Action |
|---------|:---:|--------|
| **Global** | `Ctrl+K` | Command palette |
| **Global** | `Esc` | Go up one level / close panel / cancel |
| **Global** | `?` | Show keyboard shortcuts overlay |
| **Finding List** | `J` / `K` | Next / Previous finding |
| **Finding List** | `Enter` | Expand focused finding |
| **Finding List** | `Esc` | Collapse expanded finding |
| **Finding List** | `A` `R` `F` `N` `S` | Action on focused finding |
| **Finding List** | `Shift+J/K` | Extend selection |
| **Finding List** | `Ctrl+A` | Select all visible |
| **Batch View** | `]` / `Alt+↓` | Next file |
| **Batch View** | `[` / `Alt+↑` | Previous file |
| **Batch View** | `Enter` | Open focused file |
| **Command Palette** | Type | Filter actions/files/findings |
| **Command Palette** | `Enter` | Execute selected action |
| **Command Palette** | `Esc` | Close palette |

### Focus Management Rules

| Rule | Implementation |
|------|----------------|
| **Focus follows action** | After Accept/Reject → focus auto-advances to next pending |
| **Focus is visible** | Focused finding has indigo border + side panel syncs |
| **Focus is predictable** | Always moves forward (J) or backward (K), never jumps |
| **Focus persists** | Returning to a file restores last focused finding |
| **Skip resolved** | J/K skip accepted/rejected findings (configurable) |

## 5. Empty & Edge States

### Empty State Pattern

| State | Message | Action | Visual |
|-------|---------|--------|--------|
| **No projects** | "Create your first project to get started" | [Create Project] button | Illustration + CTA |
| **No files** | "Upload XLIFF files to begin QA review" | [Upload Files] button, drag-drop zone | Upload icon + dashed border |
| **No findings** | "No issues found — this file is clean!" | Score: 100, auto-pass | Celebration checkmark |
| **No findings after filter** | "No findings match your filters" | [Clear Filters] link | Filter icon with X |
| **AI unavailable** | "AI analysis unavailable — rule-based results shown" | [Retry AI] button | Warning icon, rule-based results visible |
| **First batch** | "Your first batch! Here's what to expect..." | Brief explanation + [Start Review] | Onboarding card |

### Error State Pattern

All errors follow this structure:

```
┌──────────────────────────────────────┐
│ [Error Title]                        │
│                                      │
│ [Human-readable explanation]         │
│                                      │
│ [Primary Recovery Action]            │
│ [Secondary: Contact support]         │
└──────────────────────────────────────┘
```

| Error Type | Title | Recovery Action |
|------------|-------|-----------------|
| File parse error | "Could not read this XLIFF file" | [Upload again] or [Check file format] |
| AI timeout | "AI analysis took too long" | [Retry AI] — rule-based results preserved |
| Network error | "Connection lost" | [Retry] — auto-retry 3x before showing |
| Batch partial failure | "2 of 12 files could not be processed" | [Retry failed files] — successful files unaffected |
| Glossary import error | "Some glossary entries could not be imported" | [View skipped entries] + [Import valid entries] |

### Edge State: Concurrent Editing

| Scenario | Handling |
|----------|----------|
| Two reviewers open same file | Warning banner: "คุณแพร is also reviewing this file" — real-time via Supabase Realtime |
| Conflicting actions | **Last-write-wins with notification**: if คุณแพร accepts and คุณนิด rejects same finding within 5s, second action wins and first user sees toast "Finding #14 was changed by คุณนิด" with [View] link |
| Conflict prevention | Finding shows lock icon while another user is actively typing a note (soft lock, 30s timeout) |
| AI updates during review | New findings appear with "New" badge at bottom of list, existing decisions preserved, toast notification |
| Re-run on already reviewed file | Warning dialog (not just banner): "This file has existing reviews. Re-run will add new findings but preserve your decisions. [Re-run] [Cancel]" |

## 6. Search & Filter Patterns

### Command Palette (Ctrl+K)

Global search across all contexts:

```
┌──────────────────────────────────────────────┐
│ Type a command or search...                  │
│──────────────────────────────────────────────│
│ ACTIONS                                      │
│   Accept all high-confidence findings        │
│   Export Smart Report                        │
│   Upgrade to Thorough mode                   │
│                                              │
│ FILES                                        │
│   file-03.xlf (Score: 82, 5 findings)        │
│   file-07.xlf (Score: 78, 8 findings)        │
│                                              │
│ FINDINGS                                     │
│   #14 "bank" → "ริมฝั่ง" (Critical)          │
│   #23 "quarterly" → "月度" (Major)            │
└──────────────────────────────────────────────┘
```

**Scopes:** Type `>` for actions only, `#` for findings only, `@` for files only

> **Note:** 'Upgrade to Thorough' triggers a re-processing confirmation dialog — this is a one-way upgrade that runs additional L3 analysis on Economy-processed files.

### Filter Bar Pattern

Persistent filter bar above finding list:

```
┌──────────────────────────────────────────────────────────────────┐
│ Severity: [All] Layer: [All] Status: [Pending] [Clear all]      │
└──────────────────────────────────────────────────────────────────┘
```

| Filter | Options | Default |
|--------|---------|:-------:|
| **Severity** | All, Critical, Major, Minor | All |
| **Layer** | All, Rule-based, AI | All |
| **Status** | All, Pending, Accepted, Rejected, Flagged | Pending |
| **Category** | All, Terminology, Consistency, Number, Grammar, ... | All |
| **Confidence** | All, High (>85%), Medium (70-85%), Low (<70%) | All |

**Filter interaction rules:**
- Filters are additive (AND logic)
- Active filters show as badges with X to remove
- Finding count updates instantly: "Showing 5 of 28 findings"
- Filter state persists per file within session
- `Ctrl+K` → "Clear all filters" action available

## 7. Form & Input Patterns

### File Upload Pattern

```
┌──────────────────────────────────────────────┐
│                                              │
│       Drag & drop XLIFF files here           │
│       or [Browse Files]                      │
│                                              │
│       Supported: .xlf, .xliff, .sdlxliff     │
│       Max: 50 files per batch                │
│                                              │
└──────────────────────────────────────────────┘

After files dropped — Processing Mode Dialog opens:
┌──────────────────────────────────────────────┐
│ Start Processing                         [×] │
│ Tuesday Batch · 12 files · EN→TH · 9,100 seg│
│──────────────────────────────────────────────│
│ SELECT QA MODE                               │
│                                              │
│ ┌─────────────┐  ┌──────────────────┐        │
│ │ Economy     │  │ ★ Recommended    │        │
│ │ L1 + L2     │  │ Thorough         │        │
│ │ ~30s/file   │  │ L1 + L2 + L3     │        │
│ │ $0.15/file  │  │ ~2min/file       │        │
│ │             │  │ $0.35/file       │        │
│ │ Can upgrade │  │ + Deep AI        │        │
│ │ later       │  │ Best accuracy    │        │
│ └─────────────┘  └──────────────────┘        │
│──────────────────────────────────────────────│
│ Est. cost: $4.20  Time: ~24min  Budget: $25  │
│──────────────────────────────────────────────│
│ [Cancel]              [▶ Start Processing]   │
└──────────────────────────────────────────────┘
Note: Thorough is pre-selected (Recommended). Mode is locked
after processing starts — Economy can upgrade to Thorough later.
```

### Form Validation Pattern

| Rule | Implementation |
|------|----------------|
| **Validate on blur** | Field validates when user moves to next field |
| **Inline error messages** | Error text appears below field, red border |
| **No validation on empty** | Don't show error until user has interacted with field |
| **Submit button state** | Disabled until all required fields valid |
| **Success indicator** | Green checkmark on valid fields (subtle) |

### Settings Pattern

Project settings use a consistent form layout:

```
┌──────────────────────────────────────────────┐
│ Project Settings                             │
│──────────────────────────────────────────────│
│                                              │
│ Project Name        [                     ]  │
│ Language Pair        [EN → TH]               │
│ Auto-pass Threshold  [95] (0-100)            │
│ Default Mode         [Economy / Thorough]    │
│ Glossary             [Upload CSV]  [View]    │
│                                              │
│ [Save Changes]                [Reset]        │
└──────────────────────────────────────────────┘
```

## Cross-Pattern Consistency Rules

Rules that apply across ALL patterns:

| # | Rule | Rationale |
|:-:|------|-----------|
| 1 | **Keyboard shortcut always shown** | Tooltip on every action button shows shortcut key |
| 2 | **Color = meaning, never decoration** | Green = safe, Red = critical, never used arbitrarily |
| 3 | **Animations respect reduced-motion** | All transitions check `prefers-reduced-motion` |
| 4 | **No modal for single-item actions** | Modals only for bulk (>5), destructive, or irreversible actions |
| 5 | **Toast position consistent** | Success/Info = bottom-right, Error = top-center |
| 6 | **Loading never blocks** | User can always act on available data while more loads |
| 7 | **State is always recoverable** | Undo, override, retry — no permanent dead ends |
| 8 | **Filter state communicates clearly** | Always show "X of Y" when filtered, clear-all always visible |
| 9 | **Empty states have CTAs** | Every empty state tells user what to do next |
| 10 | **Consistent spacing** | Compact mode (0.75x) for review, Comfortable (1x) for dashboard/settings |
