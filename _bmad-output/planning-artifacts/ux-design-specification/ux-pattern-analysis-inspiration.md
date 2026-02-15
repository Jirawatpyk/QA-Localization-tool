# UX Pattern Analysis & Inspiration

## Inspiring Products Analysis

**1. Xbench — Direct Competitor (Replace & Surpass)**

The benchmark tool that คุณแพร has used daily for 5 years. Every UX decision will be compared against Xbench.

| Aspect | Xbench Strength | Xbench Weakness (Our Opportunity) |
|--------|----------------|----------------------------------|
| Detection | Fast rule-based checks, deterministic, reliable | No AI — catches patterns only, not meaning |
| Suggestions | N/A | No suggestions — only flags errors, never proposes fixes |
| Confidence | N/A | No confidence levels — every finding treated equally, must review all |
| Workflow | Integrated in Trados — no app switching | No batch summary, file-by-file only |
| Learning | N/A | No learning — same false positives forever |
| Interactivity | N/A | Static report — no Accept/Reject, no interactive review |

**2. Grammarly — Closest UX Pattern (AI Suggestion Model)**

AI-powered writing assistant that pioneered the inline suggestion + Accept/Dismiss pattern. The most relevant UX reference for our Core Action Loop.

| Grammarly Pattern | What It Does Well | Our Adaptation |
|-------------------|------------------|----------------|
| Inline suggestion card | Error + fix in one view, 1-click accept | Finding card: severity + source/target + suggestion + Accept/Reject |
| Color-coded categories | Correctness (red) / Clarity (blue) / Engagement (green) | Severity badges: Critical (red) / Major (orange) / Minor (yellow) |
| "Why" explanation | Explains grammar rule behind the error | AI explanation + back-translation (Language Bridge) |
| Overall score | Score updates as user fixes issues | MQM score badge that updates live as findings are resolved |
| 1-click accept | Zero-friction suggestion application | Accept (A) hotkey — zero confirmation |

Key insight: Grammarly proved that **"Show the Fix, Not Just the Error"** dramatically accelerates user decisions — this validates our Pillar 5 (Actionable Suggestions).

**3. GitHub Pull Request Review — Review & Decide Pattern**

Code review workflow with Accept/Reject/Comment pattern that maps directly to our Core Action Loop.

| GitHub Pattern | What It Does Well | Our Adaptation |
|---------------|------------------|----------------|
| File tree with status | ✅ Reviewed / ⬜ Not reviewed per file | Batch file list with Review Complete / Pending / AI Processing status |
| Inline diff highlighting | Shows only changed lines, not entire file | Source/Target with error-specific highlighting |
| "Viewed" checkbox | Mark file as reviewed → collapse → focus remaining | Finding states (8 states) with richer semantics |
| Batch approve | "Approve" entire PR after reviewing all files | Batch-level Accept All Filtered |
| Pending review count | "3 files remaining" | "Finding 14/28 (14 remaining)" progress indicator |

Key insight: GitHub's **"mark as viewed then move on"** pattern is the closest existing UX to our Core Loop — we enhance it with confidence + suggestion.

**4. Linear — Keyboard-First Professional UX**

Proves that "professional + fast + beautiful" is achievable — information density without overwhelming users.

| Linear Pattern | What It Does Well | Our Adaptation |
|---------------|------------------|----------------|
| Cmd+K command palette | Search, navigate, action — all from keyboard | Ctrl+K command palette (designed in Safeguard #4) |
| Keyboard-first design | Every action has shortcut, power users never touch mouse | Full keyboard navigation (A/R/F/N/S/Tab/↑↓) |
| Contextual side panel | Click item → detail in right panel, no page change | Sheet component for finding detail — always visible in review mode |
| Speed & optimistic UI | Instant transitions, no loading spinners | Optimistic UI for Accept/Reject — instant visual feedback |
| Batch operations | Multi-select → bulk update | Multi-select + bulk accept with keyboard (Ctrl+B) |

Key insight: Linear proves that **command palette + keyboard-first** = power user adoption accelerator — คุณแพร will feel "this tool understands real workers."

**5. VS Code — Panel System & Power User Ecosystem**

Power user patterns for information-dense, dual-monitor workflows.

| VS Code Pattern | What It Does Well | Our Adaptation |
|----------------|------------------|----------------|
| Problems panel | List errors/warnings with severity, click → jump to location | Finding list: severity + type + location → click to navigate |
| Status bar | Persistent global indicators (branch, error count, language) | Persistent score badge + progress + AI status + mode indicator |
| Breadcrumb navigation | file > class > method → always know location | Batch > File > Finding → always know navigation context |
| Split view | Side-by-side comparison | Source/Target side-by-side within finding card |
| Error count badges | Error/Warning counts in status bar and file tree | Finding count by severity in file and batch headers |

Key insight: VS Code's **Problems Panel** is the closest existing UX to our finding list — severity icons, click-to-navigate, count badges. Primary reference for our finding list component.

## Transferable UX Patterns

**Navigation Patterns:**
- **Command palette** (from Linear) — keyboard-first search/navigate/action for power users
- **File tree with review status** (from GitHub) — batch file list with progress indicators
- **Breadcrumb navigation** (from VS Code) — Batch > File > Finding context always visible
- **Side panel detail** (from Linear) — finding detail without page navigation

**Interaction Patterns:**
- **Inline suggestion Accept/Dismiss** (from Grammarly) — 1-click decision on AI suggestions
- **"Viewed" progressive completion** (from GitHub) — mark as reviewed, collapse, focus remaining
- **Batch operations with keyboard** (from Linear) — multi-select + bulk action
- **Click-to-navigate from list** (from VS Code Problems Panel) — finding list → jump to detail

**Visual Patterns:**
- **Color-coded severity** (from Grammarly) — instant priority recognition without reading
- **Inline diff highlighting** (from GitHub) — show only the problematic part, not entire segment
- **Persistent status bar** (from VS Code) — global indicators always visible
- **Optimistic UI** (from Linear) — instant visual feedback on actions, no loading delay

## Anti-Patterns to Avoid

| Anti-Pattern | Source | Why Avoid | Our Prevention |
|-------------|--------|-----------|---------------|
| **Jira complexity** | Jira | Too many fields, options, clicks — users drown in configuration | Minimal configuration, smart defaults, progressive disclosure |
| **Static QA reports** | Xbench, traditional tools | Non-interactive report → can't Accept/Reject → still need separate step | Interactive review IN the tool, not separate report |
| **Premium upsell interruption** | Grammarly | "Upgrade to see more!" mid-flow breaks concentration | Economy/Thorough is cost transparency, never interrupts review |
| **Notification overload** | Slack | Too many notifications → all ignored → nothing matters | Selective: batch complete, flag resolved, AI learning milestone only |
| **Modal dialog chains** | Enterprise tools | "Are you sure?" → "Really sure?" → rage quit | Zero confirmation for Accept, undo instead of confirm |
| **Dashboard-first landing** | Analytics tools | Empty dashboard before actual work → no immediate value | Landing on batch upload / active review, dashboard is secondary |
| **Forced onboarding tour** | Many SaaS | 15-step tour before you can do anything | Optional 5-step walkthrough, dismissible, value visible immediately |
| **Excel-based QA workflow** | Current fallback | No structure, no automation, copy-paste errors | Structured review flow, automated checks, complete audit trail |

## Design Inspiration Strategy

**Adopt (use directly):**

| Pattern | From | Rationale |
|---------|------|-----------|
| Inline suggestion card | Grammarly | Proven Accept/Dismiss pattern — maps directly to Core Loop |
| Command palette (Ctrl+K) | Linear | Keyboard-first power user essential |
| Problems panel UX | VS Code | Finding list with severity + click-to-navigate — closest existing pattern |
| File tree with review status | GitHub PR | Batch file list with progress — proven at massive scale |

**Adapt (modify for our context):**

| Pattern | From | Adaptation |
|---------|------|-----------|
| Score indicator | Grammarly | Writing score → MQM quality score with interim/final states + layer badges |
| Inline diff | GitHub | Code diff → source/target segment diff with error highlighting |
| Side panel detail | Linear | Issue detail → finding detail with Language Bridge, always visible |
| Severity categories | Grammarly | Grammar categories → QA Cosmetic error types with MQM mapping |
| "Viewed" checkbox | GitHub | File viewed → finding states (8 states) with richer semantics |

**Innovate (our unique differentiators — no existing product does these):**

| Innovation | Why Unique |
|-----------|-----------|
| Language Bridge | No product combines back-translation + AI explanation + confidence for non-native review |
| Cross-file pattern resolve | No QA tool offers "resolve this error pattern across 10 files with 1 action" |
| AI learning visibility | No competitor shows "AI learned 23 patterns from YOUR feedback" — creates emotional ownership |
| Rule-to-AI context injection | Layer 1 results feed Layer 2-3 prompts — zero duplicate findings |
| Progressive streaming review | Start reviewing rule-based while AI still processing — competitors make you wait |
| Confidence-driven bulk accept | Bulk accept filtered by confidence level — not just "select all" |

**Avoid (incompatible with our product):**

| Pattern | Why Avoid |
|---------|-----------|
| Gamification / confetti | Professional QA context — Emotional Design Principle #2 "Celebrate Quietly" |
| Feature gating / upsell | Economy/Thorough is cost transparency, not feature lock |
| Mandatory onboarding | Users want value in < 5 minutes, not a tour |
| Tab-based navigation | Dual monitor = side panel pattern, not tabs — Principle #7 |
| Dark patterns for engagement | QA tool must earn trust, not manipulate usage |
