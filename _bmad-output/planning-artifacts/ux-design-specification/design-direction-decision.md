# Design Direction Decision

## Design Direction: "Intelligent Professional Workspace"

A keyboard-first, information-dense review workspace with Linear's speed, VS Code's panel system, and Grammarly's suggestion UX — powered by an indigo-toned professional aesthetic.

## Design Directions Explored

| Direction | Finding Card | Detail Panel | Density | Best For |
|:-:|-------------|-------------|:---:|---------|
| **A: Row-based** | Compact table rows (VS Code Problems Panel) | Side panel, always visible | Ultra-dense | Power users processing 300+ findings/day |
| **B: Card-based** | Individual cards with full info (Grammarly) | Inline expand within card | Medium | Non-native users needing Language Bridge space |
| **C: Hybrid** | Compact rows default + expand to card on focus | Side panel, always visible | Adaptive | All personas — compact scan, detailed when needed |

## Chosen Direction: Hybrid (C)

Combines density of row-based for scanning with richness of card-based for decision-making.

**How it works:**

```
DEFAULT STATE (Compact Row — for scanning):
┌──────────────────────────────────────────────────────┐
│ 🔴 Critical │ Terminology │ AI │ "bank → ริม..." │ ✓ ✗ │
│ 🟠 Major    │ Consistency │ Rule│ "app → แอ..."  │ ✓ ✗ │
│ 🟡 Minor    │ Number      │ Rule│ "500 → ..."    │ ✓ ✗ │
└──────────────────────────────────────────────────────┘

FOCUSED STATE (Expanded — for deciding):
┌──────────────────────────────────────────────────────┐
│ 🔴 Critical │ Terminology │ AI ▪▪                    │
│──────────────────────────────────────────────────────│
│ SRC: "Please transfer to your bank account"          │
│ TGT: "กรุณาโอนไปยัง ริมฝั่งแม่น้ำ ของคุณ"            │
│ 💡 "บัญชีธนาคาร"                         🟢 94%      │
│──────────────────────────────────────────────────────│
│  [✓ Accept]   [✗ Reject]   [📝 Note]   [+ More ▼]   │
└──────────────────────────────────────────────────────┘

DETAIL PANEL (Side — for deep context):
┌─────────────────────┐
│ Finding #3 of 17    │
│─────────────────────│
│ Segment Context     │
│ ...preceding seg... │
│ ▶ TARGET SEGMENT ◀  │
│ ...following seg... │
│─────────────────────│
│ 🌐 Language Bridge  │
│ Back-translation:   │
│ "bank riverside"    │
│ AI Explanation:...  │
│─────────────────────│
│ Score Impact: -25   │
│ Layer: AI (L2)      │
│ Similar: 3 files    │
└─────────────────────┘
```

## Design Rationale

| Decision | Rationale | Principle |
|----------|-----------|:-:|
| **Hybrid rows** | Compact for scanning (3s target), expandable for deciding | #3 Decide in 3 Seconds |
| **Side panel always visible** | No click to open = keyboard-first flow | #7 Dual Monitor QA Reviewer |
| **Row → focus expand** | Progressive disclosure within finding list | #2 Instant Value, Progressive Depth |
| **Indigo accent on AI** | AI findings visually distinct — builds trust literacy | #1 Trust Before Features |
| **Status bar persistent** | Score, progress, AI status always visible | #5 Show the Learning |
| **Sidebar collapsed** | Maximize main content for information density | #7 Dual Monitor QA Reviewer |

**Why Hybrid over alternatives:**
- **Not Row-only (A):** Too dense for คุณนิด who needs Language Bridge space, no room for suggestion text
- **Not Card-only (B):** Too spacious — only 3-4 visible without scroll, คุณแพร needs density for 300+ findings/day
- **Hybrid:** 8-12 rows visible in compact → expand selected row for rich context → side panel for deep detail. Adapts to persona: คุณแพร stays compact, คุณนิด expands for Language Bridge

## Implementation Approach

| View | Component | Trigger |
|------|----------|---------|
| Compact row | `<FindingRow>` via Data Table | Default for all findings |
| Expanded finding | `<FindingCard>` replaces row inline | Arrow key focus / click / Enter |
| Detail panel | `<Sheet>` (always open) | Auto-updates on focused finding change |
| Compact/Detailed toggle | Global setting | User preference, persisted |

**Transitions:** Row expand 150ms ease-out, panel swap 100ms crossfade, score update 300ms morph. Respect `prefers-reduced-motion`.
