# Design System Foundation

## Design System Choice

**Selected: shadcn/ui + Tailwind CSS** (Themeable System)

| Attribute | Detail |
|-----------|--------|
| **Type** | Copy-paste component collection (not npm package) |
| **Base** | Built on Radix UI primitives + Tailwind CSS |
| **Framework** | Next.js App Router (React Server Components compatible) |
| **Styling** | Tailwind CSS utility-first + CSS variables for theming |
| **Accessibility** | Radix UI handles ARIA attributes automatically |
| **CLI** | `npx shadcn@latest init` / `npx shadcn@latest add` |

## Rationale for Selection

| Factor | shadcn/ui | MUI (Material) | Ant Design | Custom |
|--------|:---------:|:--------------:|:----------:|:------:|
| **Full code ownership** | Yes — copy into project, modify freely | No — npm dependency | No — npm dependency | Yes |
| **Information density** | Customizable spacing | Material spacing too generous | Decent but opinionated | Yes |
| **Tailwind CSS native** | Built for it | Emotion/styled | Less/CSS Modules | Yes |
| **Next.js App Router** | RSC compatible | Client-only | Client-only | Yes |
| **Development speed** | Pre-built + customizable | Pre-built | Pre-built | Slow |
| **Visual uniqueness** | Fully themeable | Looks like Google | Looks like Ant | Yes |
| **Dual monitor density** | Compact mode achievable | Too spacious | OK | Yes |
| **Bundle size** | Import only what you use | Large | Large | Yes |

**Alignment with Experience Principles:**

1. **Principle #7 (Dual Monitor QA Reviewer)** — shadcn/ui allows compact, information-dense layouts that MUI's Material spacing cannot achieve
2. **Principle #3 (Decide in 3 Seconds)** — Full control over component internals means we can optimize every finding card element for scan speed
3. **Inspiration: Linear** — Linear uses Radix UI (same base as shadcn/ui) for their keyboard-first, professional UI — proven at scale
4. **Inspiration: VS Code** — shadcn/ui's Data Table + Command component enable Problems Panel and Command Palette patterns
5. **Code ownership** — No dependency lock-in, no breaking changes from upstream — essential for a long-lived product

## Implementation Approach

### shadcn/ui Components to Use

| shadcn/ui Component | Our Usage | Customization Level |
|--------------------|-----------|:---:|
| **Data Table** (TanStack Table) | Finding list, batch file list, dashboard tables | Heavy — custom columns, row actions, keyboard nav |
| **Sheet** (Side Panel) | Finding detail panel, segment context | Medium — always-visible mode in review |
| **Command** | Ctrl+K command palette | Medium — custom actions and search scopes |
| **Badge** | Severity, status, layer, confidence indicators | Light — color variants for each type |
| **Toast** | AI findings notification, score change, flag resolved | Light — custom positioning and timing |
| **Card** | Batch summary cards, dashboard metric cards | Medium — compact variant for density |
| **Progress** | Review progress, file processing progress | Medium — dual progress variant |
| **Accordion** | Expandable finding detail (compact/detailed toggle) | Light |
| **Dialog** | Bulk accept Major confirmation, glossary quick-edit, Processing Mode selection | Light |
| **Select/Combobox** | Language pair, filter dropdowns, severity override | Light |
| **Dropdown Menu** | Action menus, context menus, reason selection | Light |
| **Tooltip** | Confidence details, cost estimation, help text | Light |
| **Alert** | Error states, file parse failure, warnings | Light |
| **Skeleton** | Loading states for AI processing | Light |
| **Tabs** | Score breakdown sections | Light |
| **Charts** | Dashboard quality trends, AI accuracy graphs | Medium — MQM score visualization |

### Custom Components to Build

Components designed from scratch using Radix primitives + Tailwind:

| Custom Component | Purpose | Key Elements | Inspired By |
|-----------------|---------|-------------|------------|
| **FindingCard** | Core Loop: single finding display | Severity + error type + source/target highlight + suggestion + confidence + layer + actions (A/R/F/N/S) | Grammarly suggestion card |
| **FindingCardCompact** | Compact mode: minimal info for fast scanning | Severity + source/target highlight + suggestion only | Grammarly inline underline |
| **LanguageBridge** | Non-native reviewer panel | Back-translation + AI explanation + back-translation confidence + "When in doubt, Flag" | Our innovation |
| **ScoreBadge** | MQM score display | Score number + phase label (Rule-based/Analyzing/Final) + color + change animation | Grammarly score circle |
| **ScoreChangeLog** | Score change history | Timeline of score changes with reasons | Git commit history |
| **BatchSummary** | Batch overview after processing | File tree with status icons + counts by severity + auto-pass/need review split | GitHub PR file tree |
| **ReviewProgress** | Dual progress indicator | "14/28 reviewed (rule-based) + 8 AI pending" | GitHub PR review progress |
| **AILearningIndicator** | AI accuracy trend display | Accuracy % + trend arrow + pattern count + personal attribution | Our innovation |
| **QACertificate** | PDF export preview | Score + checks performed + audit trail + date/reviewer | Professional certificate |
| **FindingPattern** | Cross-file pattern group | Pattern description + instance count + "Resolve all" action | Our innovation |
| **FileStatusCard** | Per-file status in batch | Filename + score + finding count + AI status + review status | GitHub PR file row |
| **SegmentContext** | Surrounding segments view | 1-2 segments before/after with highlight on target segment | GitHub diff context lines |

## Customization Strategy

### Design Tokens — Color System

| Token | Usage | Value Intent |
|-------|-------|-------------|
| `--severity-critical` | Critical findings, urgent states | Red — demands immediate attention |
| `--severity-major` | Major findings, important states | Orange — needs attention |
| `--severity-minor` | Minor findings, informational | Yellow — low priority |
| `--confidence-high` | >85% confidence | Green — trustworthy |
| `--confidence-medium` | 70-85% confidence | Yellow — proceed with caution |
| `--confidence-low` | <70% confidence | Red — verify manually |
| `--layer-rule` | Rule-based finding badge | Neutral/Blue — deterministic, reliable |
| `--layer-ai` | AI finding badge | Purple — intelligent, semantic |
| `--status-pass` | Auto-pass, review complete | Green — safe |
| `--status-pending` | Processing, awaiting review | Gray — waiting |
| `--status-fail` | Needs review, issues found | Red — action needed |

### Typography Strategy

| Context | Font Choice | Rationale |
|---------|------------|-----------|
| UI elements | System sans-serif (Inter via Tailwind) | Clean, professional, readable at small sizes |
| Segment text (source/target) | Monospace (JetBrains Mono or similar) | Accurate character display, CJK alignment |
| Score numbers | Tabular figures (monospaced numerals) | Numbers align properly, score changes don't shift layout |
| Thai/CJK text | System font stack with CJK fallbacks | Proper rendering across all target languages |

### Spacing & Density

| Mode | Use Case | Spacing Scale |
|------|----------|:---:|
| **Compact** (default) | Review mode — information density for power users | 0.75x base |
| **Comfortable** | Onboarding, first-time users, dashboard | 1x base (shadcn/ui default) |

Compact mode is default because Experience Principle #7 demands information density for dual-monitor QA reviewers processing 10-15 files/day.

### Dark Mode

- Not MVP priority — professional QA environment typically uses well-lit offices
- Easy to add later — shadcn/ui CSS variables make dark mode a theme switch, not a rebuild
- Consider for Growth Phase — some reviewers work late shifts, dark mode reduces eye strain
