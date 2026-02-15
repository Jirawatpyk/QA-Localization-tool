# User Journey Flows

## UJ1: First-Time Setup — "The Trust Test" (คุณแพร, Initial Phase)

**Goal:** สร้าง trust ให้ power user ที่มี baseline expectation จาก Xbench

**Entry Points:** Direct URL / email invitation from PM

```mermaid
flowchart TD
    A[Open browser → Landing page] --> B{Authenticated?}
    B -->|No| C[Login via Google OAuth]
    B -->|Yes| D[Dashboard]
    C --> D
    D --> E{First visit?}
    E -->|Yes| F[Onboarding Tour - 5 steps]
    E -->|No| G[Project List]
    F --> F1[Step 1: Welcome + Tool positioning vs Xbench]
    F1 --> F2[Step 2: Create Project — name + language pair]
    F2 --> F3[Step 3: Import Glossary CSV]
    F3 --> F4[Step 4: Set auto-pass threshold 95]
    F4 --> F5[Step 5: Upload first XLIFF — 'Try with a file you already QA'd']
    F5 --> H[First Run — Trust Building Mode]
    G --> G1[Select/Create Project]
    G1 --> H

    H --> I[Rule-based results instant < 3s]
    I --> J[User compares with Xbench report side-by-side]
    J --> K{Parity match?}
    K -->|100% match| L[Breathe easy — trust seed planted]
    K -->|Gap found| M[Report Missing Check button]
    M --> N[Priority fix queue → patch → re-run]
    N --> J
    L --> O[AI findings stream in progressively]
    O --> P[First 'wow' moment — AI catches what Xbench can't]
    P --> Q[Early adoption: Glance at Xbench then close]
    Q --> R[Full adoption: Stop opening Xbench entirely]
```

**Key UX Decisions:**
| Decision | Rationale |
|----------|-----------|
| Onboarding tour = 5 steps max | Respect power user patience — skippable after step 1 |
| "Try with a file you already QA'd" prompt | Enables side-by-side comparison — builds trust through evidence |
| Rule-based first, AI streams later | Match Xbench mental model first, then exceed it |
| Report Missing Check = prominent action | Trust recovery path — user feels heard, not ignored |

**Emotional Arc:** Skepticism → Cautious testing → "It caught everything Xbench catches" → "It catches MORE" → Trust

---

## UJ2: Batch QA Review — "Single-Pass Day" (คุณแพร, Daily, Post-Onboarding) — Critical

**Goal:** ทำ 12 ไฟล์ให้เสร็จใน half day — ไม่มี proofreader loop

**Entry Point:** Dashboard → Project → Batch Upload

```mermaid
flowchart TD
    A[Monday Morning — 12 files waiting] --> B[Batch Upload 12 XLIFF files]
    B --> C[Processing Mode Dialog]
    C -->|Economy L1+L2| C1[Fast + cheap]
    C -->|Thorough L1+L2+L3| C2[Deep + comprehensive]
    C1 --> D[Run Batch]
    C2 --> D

    D --> E[Rule-based results stream instantly per file]
    E --> F{Batch size large?}
    F -->|Yes > 5 files| G[Start reviewing L1 results while AI processes]
    F -->|No| H[Wait 1-2 min for AI completion]
    G --> I[Notification: 'Batch complete' when AI done]
    H --> I

    I --> J[Batch Summary Dashboard]
    J --> K[8 files: Recommended Pass — Score >= 95, 0 Critical]
    J --> L[4 files: Need Review]

    K --> M{Trust Level}
    M -->|Initial: Low| M1[Spot Check Mode — expanded details]
    M -->|Established: High| M2[True Auto-pass — 1-click confirm]
    M1 --> M3[Glance at findings → Confirm per file]
    M2 --> M4[Batch Confirm all passed files]
    M3 --> N[8 files done]
    M4 --> N

    L --> O[Open first review file — Score 82]
    O --> P[Progressive Disclosure View]

    subgraph Review["Per-File Review Loop (Core Action Loop)"]
        P --> P1["Critical 2 — expanded, top"]
        P1 --> P2["Major 3 — expanded below"]
        P2 --> P3["Minor 14 — collapsed by default"]

        P1 --> Q1{Finding Decision}
        Q1 -->|Confidence >= 85%| Q2["Accept — A key"]
        Q1 -->|Confidence < 70%| Q3["Read context → Decide"]
        Q3 -->|Agree| Q2
        Q3 -->|Disagree| Q4["Reject — R key"]
        Q3 -->|Unsure| Q5["Flag — F key"]
        Q3 -->|Need note| Q6["Note — N key"]

        Q2 --> Q7{More findings?}
        Q4 --> Q7
        Q5 --> Q7
        Q6 --> Q7
        Q7 -->|Yes| Q8[Next finding — J key]
        Q7 -->|No| Q9[File Review Complete]

        P2 --> R1[Bulk Select similar findings]
        R1 --> R2{More than 5 items?}
        R2 -->|Yes| R3[Confirmation Dialog]
        R2 -->|No| R4[Bulk Accept]
        R3 --> R4
    end

    Q9 --> S[Score updated — no proofreader needed]
    S --> T{More files?}
    T -->|Yes| O
    T -->|No| U[All 12 files complete by 11 AM]

    U --> V[Export Smart Report for 4 reviewed files]
    V --> W[Send to PM: 'Done — ship it']
```

**Detailed Sub-flows:**

### Batch Summary Interaction
```
┌─────────────────────────────────────────────────────────────┐
│  Batch Summary: Monday batch (12 files)         2m 14s      │
│─────────────────────────────────────────────────────────────│
│                                                             │
│  Recommended Pass (8)             Need Review (4)           │
│  ┌──────────────────────┐         ┌──────────────────────┐  │
│  │ file-01.xlf  Score 98│         │ file-03.xlf  Score 82│  │
│  │ file-02.xlf  Score 97│         │ file-07.xlf  Score 78│  │
│  │ file-04.xlf  Score 99│         │ file-09.xlf  Score 85│  │
│  │ file-05.xlf  Score 96│         │ file-11.xlf  Score 71│  │
│  │ file-06.xlf  Score 97│         └──────────────────────┘  │
│  │ file-08.xlf  Score 98│                                   │
│  │ file-10.xlf  Score 96│         [Review file-11 first]    │
│  │ file-12.xlf  Score 99│          (lowest score)           │
│  └──────────────────────┘                                   │
│                                                             │
│  [Confirm All Passed]   [Export Report]   [Details]          │
└─────────────────────────────────────────────────────────────┘
```

### Progressive Disclosure Detail
| Phase | Visible | Interaction |
|:-----:|---------|-------------|
| **Initial** | Critical findings expanded, Major headers visible, Minor collapsed | Auto-scroll to first Critical |
| **Scan** | Row-based compact view, severity badge + category + preview | Arrow keys navigate, Enter expands |
| **Decide** | Expanded finding card with source/target/suggestion/confidence | A/R/F/N keys for action |
| **Bulk** | Checkbox column visible, bulk action bar appears on selection | Shift+Click range select |
| **Complete** | Score recalculates, next file auto-loads if in batch | Summary toast notification |

### Keyboard-First Flow
| Phase | Keys | Action |
|-------|------|--------|
| Navigate findings | `J / ↓` / `K / ↑` | Next / Previous finding |
| Expand/Collapse | `Enter` / `Esc` | Open detail / Close detail |
| Quick actions | `A` `R` `F` `N` | Accept / Reject / Flag / Note |
| Bulk select | `Shift+J/K` | Extend selection |
| Bulk action | `Ctrl+Shift+A` `Ctrl+Shift+R` | Bulk Accept / Bulk Reject |
| File navigation | `] / Alt+↓` / `[ / Alt+↑` | Next file / Previous file |
| Command palette | `Ctrl+K` | Search actions, files, findings |

---

## UJ3: Non-Native Language Review — "The Language Bridge" (คุณนิด) — Critical

**Goal:** Review ไฟล์ภาษาที่อ่านไม่ออก (EN→ZH, EN→JA) โดยไม่ต้องรอ native reviewer

**Entry Point:** Dashboard → Project → Upload (same as UJ2 but with Language Bridge activated)

```mermaid
flowchart TD
    A[คุณนิด receives 5 EN→ZH files] --> B[Upload 5 XLIFF → Thorough mode]
    B --> C[Rule-based: All clean — same as Xbench]
    C --> D[AI findings stream in]

    D --> E[Finding View with Language Bridge Panel]

    subgraph Bridge["Language Bridge Experience"]
        E --> E1["Source: 'quarterly report'"]
        E1 --> E2["Target: '月度报告' — cannot read"]
        E2 --> E3["Back-translation: 'monthly report'"]
        E3 --> E4["AI Explanation: Source means every 3 months but target says every month — frequency mismatch"]
        E4 --> E5["Confidence: 89%"]
    end

    E5 --> F{Can understand issue without reading target?}
    F -->|Yes, confident| G["Accept — auto-tagged 'Accepted by non-native reviewer'"]
    F -->|Understand but unsure| H["Flag for native review"]
    F -->|Low confidence finding| I{Confidence level?}
    I -->|Over 92% for ZH| G
    I -->|72-92%| H
    I -->|Under 72%| H

    G --> J{More findings?}
    H --> J
    J -->|Yes| E
    J -->|No| K[Export Smart Report]

    K --> L["Section 1: Rule-based Verified"]
    K --> M["Section 2: AI Accepted by Non-native with caveat auto-tag"]
    K --> N["Section 3: Flagged for Native Review — only 3 items"]

    N --> O[Send to native reviewer — Shanghai]
    O --> P[Native reviews only 3 items — 2 hours vs 2 days]
    P --> Q{Native verdict}
    Q -->|AI correct 2 of 3| R[Accept → feedback log]
    Q -->|AI wrong 1 of 3| S[Reject → feedback log → AI learns]
    R --> T[Complete]
    S --> T
```

### Language Bridge Panel Design
```
┌───────────────────────────────────────────┐
│ Language Bridge                            │
│───────────────────────────────────────────│
│                                           │
│ SOURCE (EN):                              │
│ "Please submit the quarterly report"      │
│                                           │
│ TARGET (ZH):                              │
│ "请提交月度报告"                            │
│                                           │
│ BACK-TRANSLATION:                         │
│ "Please submit the monthly report"        │
│                                           │
│ AI EXPLANATION:                            │
│ "The source specifies 'quarterly' (every  │
│  3 months) but the translation says       │
│  'monthly' (every month). This changes    │
│  the reporting frequency requirement."    │
│                                           │
│ CONFIDENCE: 89%                            │
│                                           │
│ ZH threshold: 92% (higher for CJK)        │
│───────────────────────────────────────────│
│ [Accept]  [Flag]  [Reject]                │
└───────────────────────────────────────────┘
```

### Per-Language Confidence Thresholds
| Language Pair | Accept Threshold | Flag Threshold | Rationale |
|:---:|:---:|:---:|---------|
| EN→TH | >= 85% | 70-84% | Reviewer (คุณแพร) reads target |
| EN→ZH | >= 92% | 75-91% | Non-native — higher bar needed |
| EN→JA | >= 92% | 75-91% | Non-native — higher bar needed |
| EN→AR | >= 90% | 72-89% | RTL + non-native |

> **Distinction:** These per-language acceptance thresholds are separate from the universal Confidence Badge levels (High >85%, Medium 70-85%, Low <70%) shown on every finding. The badge indicates AI confidence; the threshold determines when non-native reviewers should Flag rather than Accept.

### Non-Native Safety Net
- Every Accept by non-native auto-tagged: `"Accepted by non-native reviewer — subject to native audit"`
- Smart Report separates native-verified vs non-native-accepted sections
- Periodic audit: random 10% of non-native accepts reviewed by native speaker
- Per-language accuracy tracking drives threshold calibration

---

## UJ4: PM Self-Service — "The Self-Service Shortcut" (PM, Established Phase)

**Goal:** PM ส่งไฟล์ให้ลูกค้าได้วันศุกร์ โดยไม่ต้องรอคิว QA

**Entry Point:** Dashboard → Project → Quick Upload (simplified PM view)

```mermaid
flowchart TD
    A[Friday PM — deadline Monday] --> B[Login → Upload 3 XLIFF]
    B --> C["Economy mode default for PM — Tooltip: Thorough costs ~5x more"]
    C --> D[Mark as Urgent]
    D --> E[Run]

    E --> F[Batch Summary]
    F --> G["2 Auto-pass — Score 97, 0 Critical"]
    F --> H["1 Need Review — Score 78, Critical 2"]

    G --> I[Ship to client immediately]

    H --> J{PM action}
    J -->|Self-review| K[PM views 2 Critical issues only]
    J -->|Route to QA| L["Select reviewer — คุณแพร EN→TH"]

    K --> K1["PM can Accept obvious fixes — high confidence over 95%"]
    K --> K2["PM Flags uncertain issues → routes to QA"]

    L --> M["คุณแพร gets notification: 2 Critical issues from PM — Urgent"]
    M --> N["คุณแพร reviews only 2 issues — 10 min"]
    N --> O[Accept fixes]
    O --> P[File ready — PM ships Friday evening]

    P --> Q["Win-win: PM saves 2 days, QA Reviewer spends 10 min vs 1 hour"]
```

**PM-Specific UX Adaptations:**
| Element | PM View | QA Reviewer View |
|---------|---------|------------------|
| Default mode | Economy | Thorough |
| Batch summary | Prominent pass/fail | Detailed score breakdown |
| Finding detail | Simplified — action buttons only | Full context + Language Bridge |
| Report | 1-click export | Customizable sections |
| Cost indicator | Visible per file (see below) | Hidden (not relevant) |
| Onboarding | Lightweight 3-step PM guide | Skippable 5-step tour |
| Reviewer routing | Reviewer selector with availability | N/A (is the reviewer) |

### PM Cost Estimation Display

```
┌──────────────────────────────────────────────┐
│ 12 files ready                               │
│──────────────────────────────────────────────│
│ file-01.xlf   4,200 seg   ~$0.12            │
│ file-02.xlf   1,800 seg   ~$0.05            │
│ file-03.xlf   3,100 seg   ~$0.09            │
│──────────────────────────────────────────────│
│ Mode: Selected via Processing Mode Dialog    │
│ Est:   Economy ~$0.26    Thorough ~$1.30    │
│                                              │
│ Estimate based on segment count.             │
│ Actual cost may vary by AI complexity.       │
└──────────────────────────────────────────────┘
```

### Reviewer Selection UI (Route to QA)

```
┌──────────────────────────────────────────────┐
│ Route to QA Reviewer                         │
│──────────────────────────────────────────────│
│ Language pair: EN→TH                         │
│                                              │
│ Available Reviewers:                         │
│ ┌────────────────────────────────────────┐   │
│ │ 🟢 คุณแพร  │ EN→TH, EN→JA │ 2 active │   │
│ │ 🟡 คุณนิด  │ EN→TH, EN→ZH │ 5 active │   │
│ │ 🔴 คุณสม   │ EN→TH        │ Offline  │   │
│ └────────────────────────────────────────┘   │
│                                              │
│ Issues to route: 2 Critical                  │
│ Priority: [Urgent 🔴 ▼]                     │
│ Note: [Optional message to reviewer      ]   │
│                                              │
│ [Send to คุณแพร]              [Cancel]       │
└──────────────────────────────────────────────┘
```

Reviewer receives notification: "PM assigned 2 Critical issues — Urgent"

---

## UJ5: Dashboard & Reporting — "The Auto-Pass Audit" (PM)

**Goal:** พิสูจน์คุณภาพให้ลูกค้าด้วย audit trail และ QA certificate

**Entry Point:** Dashboard → Project → File History

```mermaid
flowchart TD
    A["Client asks: What QA was performed?"] --> B[PM opens Dashboard]
    B --> C[Project → File History]
    C --> D["3 files — status: Auto-passed"]

    D --> E[Click file → QA Audit Trail]
    E --> F["Rule-based: 127/127 checks passed"]
    E --> G["AI screening: 342 segments, 0 Critical, 0 Major"]
    E --> H["Score: 97/100 — 2 Minor cosmetic"]

    H --> I["Generate QA Certificate — 1 click"]
    I --> J[PDF Certificate]
    J --> J1["File name, language pair, date"]
    J --> J2["Score: 97/100"]
    J --> J3["All check categories passed"]
    J --> J4["Conclusion: Passed automated QA"]

    J --> K[Send to client]

    K --> L{Client finds issue later?}
    L -->|Yes| M["PM opens audit trail → Issue was Minor, context-dependent"]
    M --> N["Report Missed Issue button"]
    N --> O["System logs → AI learns → Catches next time"]
    L -->|No| P[Trust reinforced]
```

### Dashboard Overview Layout
```
┌──────────────────────────────────────────────────────────┐
│  Project Dashboard: Client-ABC EN→TH                     │
│──────────────────────────────────────────────────────────│
│                                                          │
│  This Week          │  Trends                            │
│  ┌────────────────┐ │  ┌──────────────────────────────┐  │
│  │ Files: 47      │ │  │ Avg Score: 94.2 (+2.1)      │  │
│  │ Auto-pass: 38  │ │  │ Auto-pass rate: 81%          │  │
│  │ Reviewed: 9    │ │  │ False positive: 12%           │  │
│  │ Avg Score: 94  │ │  │ AI accuracy: 91%              │  │
│  └────────────────┘ │  └──────────────────────────────┘  │
│                     │                                    │
│  Recent Files                                            │
│  ┌─────────────┬───────┬────────┬───────────┬─────────┐  │
│  │ File        │ Score │ Status │ Issues    │ Actions │  │
│  │ doc-47.xlf  │ 97    │ Pass   │ 2 Minor  │ Cert    │  │
│  │ doc-46.xlf  │ 82    │ Done   │ 2C 3M    │ View    │  │
│  │ doc-45.xlf  │ 98    │ Pass   │ 0        │ Cert    │  │
│  └─────────────┴───────┴────────┴───────────┴─────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## UJ6: AI Feedback & Learning — "The False Positive Storm" (คุณแพร)

**Goal:** ลด false positive rate ผ่าน feedback loop — user sees AI improving from their input

**Entry Point:** Review flow (within UJ2) when encountering many false positives

```mermaid
flowchart TD
    A["File with Thai idioms — AI flags 15 issues"] --> B{Review findings}

    B --> C["8 are false positives — Thai idioms AI doesn't understand"]
    B --> D["7 are real issues"]

    C --> E["Bulk Select 8 false positives"]
    E --> F["Bulk Reject — 10 seconds vs 5 minutes"]
    F --> G["System logs 8 rejection patterns: Thai idiom EN→TH"]

    D --> H[Accept/Fix 7 real issues]

    G --> I["AI Learning Indicator: Learning from your feedback — 8 patterns improved for EN→TH"]

    I --> J[Later — same type of file]
    J --> K["AI flags only 3 issues — down from 15"]
    K --> L["False positive: 53% → 8%"]

    L --> M["Banner: AI accuracy for EN→TH idioms: 47% → 92% — learned from 23 feedbacks"]

    M --> N{User trust trajectory}
    N --> O["Reject rate decreases over time"]
    N --> P["User enables more AI features"]
    N --> Q["AI-to-Rule promotion: Repeated patterns become rules"]

    subgraph Recovery["If False Positive Too High"]
        R["Option: Disable AI temporarily"] --> S["Use rule-based only"]
        S --> T["Re-enable when AI accuracy reaches threshold"]
    end
```

**AI Learning Visibility:**
| Indicator | Location | Trigger |
|-----------|----------|---------|
| Inline learning badge | After bulk reject | "AI learning from your feedback" |
| Accuracy trend | Side panel → AI tab | Per language pair, per category |
| Improvement banner | Top of review screen | When false positive rate drops > 10% |
| Pattern count | Settings → AI Learning | "23 patterns learned for EN→TH" |
| Suppress action | Finding context menu | After 3+ rejects of same pattern (see below) |

### Suppress Pattern Interaction

**Trigger:** System detects 3+ rejections of the same error pattern (e.g., "Thai idiom misclassified as mistranslation") within a session or across sessions for the same language pair.

**Flow:**
```
3rd rejection of same pattern → Toast appears:
┌──────────────────────────────────────────────┐
│ 🧠 Pattern detected: "Thai idiom" (3 rejects)│
│                                              │
│ [Suppress this pattern]  [Keep checking]      │
└──────────────────────────────────────────────┘

If "Suppress this pattern":
┌──────────────────────────────────────────────┐
│ Suppress "Thai idiom false positive"         │
│──────────────────────────────────────────────│
│ Scope:  ○ This file only                    │
│         ● This language pair (EN→TH)         │
│         ○ All language pairs                 │
│                                              │
│ Duration: ● Until AI accuracy improves       │
│           ○ Permanently                      │
│           ○ This session only                │
│                                              │
│ [Suppress]                    [Cancel]        │
└──────────────────────────────────────────────┘

After suppression:
- Matching findings auto-rejected with "Suppressed" tag
- Suppressed patterns listed in Settings → AI Learning
- Can be re-enabled anytime from Settings
- AI still receives rejection data for training
```

**Undo:** Settings → AI Learning → Suppressed Patterns → [Re-enable] per pattern

---

## Journey Patterns

Cross-journey patterns identified across all 6 user journeys:

### Navigation Patterns
| Pattern | Used In | Implementation |
|---------|---------|----------------|
| **Progressive Loading** | UJ1, UJ2, UJ3 | Rule-based instant → AI streams in → badge updates |
| **Batch → Detail Drill** | UJ2, UJ4, UJ5 | Summary view → click file → finding list → finding detail |
| **Keyboard-First Navigation** | UJ2, UJ3 | J/K navigate, A/R/F/N act, Ctrl+K command palette |
| **Panel Auto-Update** | UJ2, UJ3 | Side panel reflects focused finding — no click needed |

### Decision Patterns
| Pattern | Used In | Implementation |
|---------|---------|----------------|
| **Confidence-Guided Action** | UJ2, UJ3 | High confidence → quick Accept, Low → read context → decide |
| **Trust Escalation** | UJ1, UJ2, UJ4 | Recommended pass → Spot check → Auto-pass (progressive) |
| **Non-Native Safety Net** | UJ3 | Auto-tag + 3-tier report + native audit sample |
| **Bulk with Safeguard** | UJ2, UJ6 | Bulk select → confirmation dialog if > 5 items |

### Feedback Patterns
| Pattern | Used In | Implementation |
|---------|---------|----------------|
| **Visible Learning** | UJ5, UJ6 | AI Learning Indicator + accuracy trend + improvement banner |
| **Recovery Path** | UJ1, UJ5 | Report Missing Check + Report Missed Issue → system learns |
| **Trust Signal** | UJ1, UJ2 | Score prominence, audit trail, QA certificate |
| **Progressive Trust** | UJ1, UJ2 | Skepticism → Evidence → Confidence → Reliance |

## Flow Optimization Principles

| # | Principle | Application | Journeys |
|:-:|-----------|------------|:--------:|
| 1 | **Minimize steps to value** | Rule-based results in < 3s, no waiting for AI to start working | All |
| 2 | **Parallel work enabled** | Review L1 findings while AI processes — never idle | UJ2, UJ3 |
| 3 | **Smart defaults reduce decisions** | Economy mode for PM, Thorough for QA, auto-threshold per language | UJ2, UJ3, UJ4 |
| 4 | **Batch before detail** | Always show summary first — user decides what needs attention | UJ2, UJ4, UJ5 |
| 5 | **Trust through transparency** | Audit trail, QA certificate, accuracy metrics always accessible | UJ1, UJ5, UJ6 |
| 6 | **Recovery over perfection** | Every miss has a recovery path — Report Missing, Report Missed, Flag | UJ1, UJ5, UJ6 |
| 7 | **Keyboard-first, mouse-optional** | Full review possible without touching mouse — 300+ findings/day | UJ2, UJ3 |
| 8 | **Show the learning** | AI improvement visible — builds trust through demonstrated growth | UJ5, UJ6 |
