# Visual Design Foundation

### Color System

#### Brand Color Direction: "Intelligent Professional"

Product must convey: Trust (professional, reliable), Intelligence (AI-powered, innovative), Calm focus (reduces QA anxiety).

#### Primary Palette

**Primary: Indigo** — conveys intelligence + innovation, differentiates from generic blue enterprise tools

| Token | Tailwind | Usage | Hex |
|-------|----------|-------|-----|
| `--primary` | `indigo-600` | Primary buttons, active states, links | #4F46E5 |
| `--primary-hover` | `indigo-700` | Button hover, active links | #4338CA |
| `--primary-foreground` | `white` | Text on primary backgrounds | #FFFFFF |
| `--primary-muted` | `indigo-50` | Primary background tint, selected rows | #EEF2FF |
| `--primary-subtle` | `indigo-100` | AI processing indicators, AI layer badge background | #E0E7FF |

**Why Indigo:** Blue is too generic (every enterprise tool). Purple is too playful. Teal feels medical. Green conflicts with "pass/success" semantic. Indigo = intelligence + trust + modern.

#### Neutral Palette: Slate

| Token | Tailwind | Usage | Hex |
|-------|----------|-------|-----|
| `--background` | `white` | Page background | #FFFFFF |
| `--surface` | `slate-50` | Card/panel backgrounds | #F8FAFC |
| `--surface-raised` | `slate-100` | Sidebar, elevated surfaces | #F1F5F9 |
| `--border` | `slate-200` | Borders, dividers | #E2E8F0 |
| `--border-strong` | `slate-300` | Focus rings, stronger dividers | #CBD5E1 |
| `--text-muted` | `slate-400` | Placeholder text, disabled | #94A3B8 |
| `--text-secondary` | `slate-500` | Secondary labels, timestamps | #64748B |
| `--text-body` | `slate-700` | Body text | #334155 |
| `--text-heading` | `slate-900` | Headings, primary text | #0F172A |

#### Semantic Colors (expanded from design-system-foundation.md)

**Severity:**

| Severity | Background | Badge | Text | Hex (Badge) |
|----------|-----------|-------|------|-------------|
| **Critical** | `red-50` | `red-600` | `red-900` | #DC2626 |
| **Major** | `orange-50` | `orange-500` | `orange-900` | #F97316 |
| **Minor** | `yellow-50` | `yellow-500` | `yellow-900` | #EAB308 |

**Confidence:**

| Level | Background | Indicator | Hex |
|-------|-----------|-----------|-----|
| **High** (>85%) | `emerald-50` | `emerald-500` | #10B981 |
| **Medium** (70-85%) | `amber-50` | `amber-500` | #F59E0B |
| **Low** (<70%) | `red-50` | `red-500` | #EF4444 |

**Layer:**

| Layer | Background | Badge | Rationale |
|-------|-----------|-------|-----------|
| **Rule-based** | `slate-100` | `slate-500` | Neutral — deterministic, reliable |
| **AI** | `indigo-50` | `indigo-500` | Primary — highlights AI as differentiator |
| **Manual** | `amber-50` | `amber-600` | Warm — human-added, personal |

**Status:**

| Status | Color | Usage |
|--------|-------|-------|
| **Pass / Complete** | `emerald-500` | Auto-pass, review complete, success |
| **Pending** | `slate-400` | Awaiting review, queued |
| **AI Processing** | `indigo-500` (animated) | AI analyzing — pulsing animation |
| **Needs Review** | `orange-500` | Files requiring human review |
| **Error / Failed** | `red-500` | Parse failure, AI timeout |

#### Color Accessibility (WCAG 2.1 AA)

- All body text meets 4.5:1 contrast ratio against background
- UI components (badges, buttons) meet 3:1 minimum
- Never rely on color alone — always pair with icon or text label
- Severity = color AND label, Confidence = color AND percentage
- All interactive elements have visible focus ring (2px `slate-300`)

### Typography System

#### Font Stack

| Role | Font | Fallback | Rationale |
|------|------|----------|-----------|
| **UI** | Inter | system-ui, sans-serif | Clean, professional, variable font |
| **Segment text** | JetBrains Mono | Consolas, monospace | Accurate character display, CJK-friendly |
| **Score numbers** | Inter (tabular figures) | — | Monospaced numerals prevent layout shift |
| **Thai text** | Sarabun or system Thai | Tahoma, sans-serif | Thai readability at compact sizes |
| **CJK text** | Noto Sans CJK | system CJK stack | Chinese, Japanese, Korean consistency |

#### Type Scale — Compact Mode (default)

| Level | Size | Weight | Line Height | Usage |
|-------|:---:|:---:|:---:|-------|
| **Display** | 24px | 700 | 1.2 | Page titles ("Batch Summary") |
| **H1** | 20px | 600 | 1.3 | Section headers |
| **H2** | 16px | 600 | 1.4 | File names, sub-sections |
| **H3** | 14px | 600 | 1.4 | Finding card headers, column headers |
| **Body** | 13px | 400 | 1.5 | Default text, finding content |
| **Body Small** | 12px | 400 | 1.5 | Secondary info, metadata |
| **Caption** | 11px | 400 | 1.4 | Labels, badges, tooltips |
| **Mono Body** | 13px | 400 | 1.6 | Source/target segments (JetBrains Mono) |
| **Mono Small** | 12px | 400 | 1.5 | Segment IDs, technical refs |

Comfortable mode: all sizes scale up by 1 step.

**Typography rules:**
- Body text minimum 13px — never smaller (accessibility)
- Segment text always monospace — consistency across all languages
- Score numbers always tabular figures — prevents layout shift
- Error type labels: UPPERCASE + caption size — scannable without dominating
- Suggestion text: italic + body size — visually distinct from error text
- Thai text: line-height 1.6+ for tall characters
- CJK text: line-height 1.7+ and slightly larger base size

### Spacing & Layout Foundation

#### Spacing Scale (Base: 4px)

| Token | Compact | Comfortable | Usage |
|-------|:---:|:---:|-------|
| `space-1` | 2px | 4px | Inline gaps (badge padding) |
| `space-2` | 4px | 8px | Tight gaps (badges, icon+label) |
| `space-3` | 8px | 12px | Component internal padding |
| `space-4` | 12px | 16px | Card padding, list item padding |
| `space-5` | 16px | 24px | Section gaps, card gaps |
| `space-6` | 24px | 32px | Major section divisions |
| `space-8` | 32px | 48px | Page-level spacing |

#### Application Layout Structure

```
┌─────────────────────────────────────────────────────┐
│ Top Bar (48px): Logo │ Breadcrumb │ Project │ User  │
├────────┬────────────────────────────┬───────────────┤
│Sidebar │     Main Content Area      │  Detail Panel │
│(48px)  │     (flexible)             │   (400px)     │
│        │                            │               │
│ 📁     │  [Finding List / Batch     │  [Finding     │
│ 📊     │   Summary / Dashboard]     │   Detail /    │
│ ⚙️     │                            │   Language    │
│        │                            │   Bridge]     │
├────────┴────────────────────────────┴───────────────┤
│ Status Bar (32px): Score │ Progress │ AI │ Shortcuts │
└─────────────────────────────────────────────────────┘
```

| Element | Width | Behavior |
|---------|-------|----------|
| **Sidebar** | 48px collapsed (icons) / 240px expanded | Default collapsed in review mode |
| **Main Content** | Flexible (min 600px) | Fills remaining space |
| **Detail Panel** | 400px (default at ≥1440px, reduces to 360px at ≥1280px, 300px at ≥1024px) | Always visible in review mode, resizable |
| **Top Bar** | Full width, 48px | Fixed — never scrolls |
| **Status Bar** | Full width, 32px | Fixed — persistent indicators |
| **Minimum app width** | 1024px | Must work on single monitor |

**Layout rules:**
- Detail Panel always visible in review mode — no click to open (keyboard-first)
- Sidebar collapsed by default — maximizes main content
- Main content scrolls independently from Detail Panel
- Status bar persists — score, progress, AI status always visible (VS Code pattern)

#### Grid System

- 12-column grid for main content (Tailwind default)
- Gutter: 16px (compact) / 24px (comfortable)
- Content max-width: none — fill available space (information density)
- Dashboard: max-width 1440px centered

#### Component Spacing Patterns

| Component | Padding (compact) | Notes |
|-----------|:---:|-----------|
| Finding card | 8px, 4px gap | Dense but readable — 3-second scan |
| Badge | 2px vert, 6px horiz | Tight — maximize text space |
| Action button | 32px min-w, 28px h | Compact but clickable |
| Data table row | 8px vert | More findings visible without scroll |
| Side panel section | 12px padding, 8px gap | Clear separation |

### Accessibility Considerations

| Requirement | Implementation |
|-------------|---------------|
| **Color contrast** | All text 4.5:1, UI components 3:1 (WCAG 2.1 AA) |
| **Color independence** | Color always paired with icon or text label |
| **Focus indicators** | 2px `slate-300` focus ring on all interactive elements |
| **Keyboard navigation** | Full keyboard access (see core-user-experience.md, Keyboard Navigation section) |
| **Screen reader** | Radix UI provides ARIA attributes automatically |
| **Text scaling** | Layout intact at 200% zoom |
| **Motion** | Respect `prefers-reduced-motion` for animations |
| **Target size** | Min 24×24px (compact) / 44×44px (comfortable) |
| **Thai/CJK** | Adequate line height, proper font fallbacks |
| **RTL** | Not MVP but layout avoids hard-coded LTR assumptions |
