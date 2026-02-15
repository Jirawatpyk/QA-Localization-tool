# Responsive Design & Accessibility

## Responsive Strategy

### Design Philosophy: Desktop-First Professional Tool

qa-localization-tool is a **desktop-first professional workspace** — not a consumer app. Users work at desks with dual monitors (CAT tool left, QA tool right). Responsive design serves graceful degradation, not mobile-first.

| Device | Priority | Use Case | User |
|--------|:--------:|----------|------|
| **Desktop 1440px+** | Primary | Daily QA review — dual monitor setup | คุณแพร, คุณนิด |
| **Desktop 1024-1439px** | Primary | Single monitor, laptop docked | All users |
| **Laptop 1024px** | High | On-the-go review, meetings | PM |
| **Tablet 768-1023px** | Low | Quick status check, batch confirm | PM only |
| **Mobile < 768px** | Minimal | Dashboard glance, notifications only | PM only |

### Layout Adaptation Strategy

```
DESKTOP 1440px+ (Primary — Dual Monitor Right Panel)
┌──────┬──────────────────────────────┬───────────────┐
│ Side │ Finding List (Data Table)     │ Detail Panel  │
│ bar  │ Compact rows, full columns   │ Always visible│
│ (48px│ 8-12 rows visible            │ (400px fixed) │
│ coll)│                              │               │
└──────┴──────────────────────────────┴───────────────┘

DESKTOP 1024-1439px (Laptop)
┌──────┬──────────────────────────────┬───────────────┐
│ Side │ Finding List                  │ Detail Panel  │
│ bar  │ Some columns hidden          │ Collapsible   │
│(icon │ 6-8 rows visible             │ (360px)       │
│ only)│                              │               │
└──────┴──────────────────────────────┴───────────────┘

TABLET 768-1023px (Status Check)
┌──────────────────────────────────────────────────────┐
│ Top Nav (hamburger menu)                              │
│──────────────────────────────────────────────────────│
│ Finding List OR Detail Panel (toggle)                │
│ Simplified columns: severity + preview + action      │
│ Detail Panel = bottom sheet on tap                   │
└──────────────────────────────────────────────────────┘

MOBILE < 768px (Dashboard Only)
┌──────────────────────────┐
│ Top Nav                  │
│──────────────────────────│
│ Dashboard Summary Cards  │
│ Batch Status List        │
│ [Open on Desktop] CTA    │
│                          │
│ No review functionality  │
│ — notification + status  │
└──────────────────────────┘
```

## Breakpoint Strategy

| Breakpoint | Tailwind Class | Layout Change |
|:----------:|:--------------:|---------------|
| **>= 1440px** | `2xl:` | Full layout — sidebar + finding list + detail panel (400px) side-by-side |
| **>= 1280px** | `xl:` | Detail panel width reduces to 360px |
| **>= 1024px** | `lg:` | Sidebar collapses to icon-only (48px), detail panel 300px collapsible |
| **>= 768px** | `md:` | Single column — finding list OR detail (toggle), bottom sheet for detail |
| **< 768px** | default | Dashboard-only mode — no review functionality |

**Breakpoint Rules:**

| Rule | Implementation |
|------|----------------|
| **Desktop is the design target** | All wireframes and specs are for >= 1024px |
| **No feature parity on mobile** | Mobile shows dashboard/status only — review requires desktop |
| **Tablet is read-mostly** | Tablet can view findings but review actions are desktop-optimized |
| **Banner on small screens** | "For the best review experience, use a desktop browser" |
| **User preference persists** | Sidebar collapsed/expanded state saved per user |

## Accessibility Strategy

### Compliance Target: WCAG 2.1 AA

| Criterion | Requirement | Our Implementation |
|-----------|-------------|-------------------|
| **1.1.1 Non-text Content** | Alt text for all images | Severity icons have aria-labels, charts have data tables |
| **1.3.1 Info and Relationships** | Semantic structure | Data Table with proper `<thead>`, `<tbody>`, `role="row"` |
| **1.4.1 Use of Color** | Color not sole indicator | Severity uses icon + color + text label |
| **1.4.3 Contrast (Minimum)** | 4.5:1 text, 3:1 UI | All colors verified (see Visual Foundation) |
| **1.4.11 Non-text Contrast** | 3:1 for UI components | Buttons, badges, progress bars meet minimum |
| **2.1.1 Keyboard** | All functionality via keyboard | Full keyboard nav defined (see UX Patterns) |
| **2.1.2 No Keyboard Trap** | Esc always exits | Esc hierarchy: finding → file → batch → dashboard |
| **2.4.3 Focus Order** | Logical tab order | Finding list → detail panel → action bar |
| **2.4.7 Focus Visible** | Clear focus indicator | Indigo 2px ring, never hidden |
| **2.4.11 Focus Not Obscured** | Focus target visible | Sticky headers don't cover focused elements |
| **3.2.1 On Focus** | No context change on focus | Focus updates detail panel (same page, predictable) |
| **4.1.2 Name, Role, Value** | ARIA labels on all controls | Every action button, badge, and status labeled |
| **4.1.3 Status Messages** | Live regions for updates | Score changes via `aria-live="polite"` |

### Screen Reader Implementation

| Component | ARIA Pattern | Announcement |
|-----------|-------------|--------------|
| **Finding List** | `role="grid"` with `aria-rowcount` | "Finding list, 28 findings, 14 pending" |
| **FindingCard** | `role="row"` with `aria-selected` | "Finding 14 of 28. Critical. Terminology. AI confidence 94%." |
| **Action Buttons** | `aria-label` with context | "Accept finding 14. Critical terminology error in segment 47." |
| **ScoreBadge** | `role="status"` + `aria-live="polite"` | "Quality score: 82 out of 100. Analyzing." |
| **ReviewProgress** | `role="progressbar"` + `aria-valuenow` | "Review progress: 14 of 28 findings reviewed. 50 percent." |
| **BatchSummary** | `role="region"` + `aria-label` | "Batch summary: 8 files passed, 4 need review." |
| **LanguageBridge** | `role="complementary"` + `aria-label` | "Language Bridge. Back-translation: Please submit the monthly report." |
| **Toast** | `role="alert"` (error) / `role="status"` (info) | Auto-announced based on type |
| **Filter Bar** | `aria-controls` pointing to finding list | "Severity filter: All. Layer filter: All. Showing 28 of 28 findings." |
| **Command Palette** | `role="combobox"` + `aria-expanded` | "Command palette. Type to search actions, files, or findings." |

### Focus Management Strategy

| Scenario | Focus Behavior | ARIA |
|----------|----------------|------|
| Page load → Finding List | First pending finding receives focus | `aria-activedescendant` |
| Action (Accept/Reject) | Auto-advance to next pending | `aria-live` announces new finding |
| Expand finding | Focus moves to expanded card content | `aria-expanded="true"` |
| Close detail panel | Focus returns to finding that opened it | Focus trap released |
| Open command palette | Focus moves to search input | `aria-modal="true"` |
| Close command palette | Focus returns to previous element | Restore focus |
| Batch confirm dialog | Focus moves to primary action button | Focus trap inside dialog |
| Error toast | Announced but focus stays | `role="alert"` auto-announces |

### Color Accessibility

| Consideration | Implementation |
|---------------|----------------|
| **Color blindness: Protanopia/Deuteranopia** | Red/green severity uses icons (circle/triangle/diamond) in addition to color |
| **Color blindness: Tritanopia** | Blue/yellow severity distinguished by icon shape, not color alone |
| **High contrast mode** | `@media (forced-colors: active)` — borders replace color fills |
| **Severity system** | Critical = filled circle + red, Major = triangle + orange, Minor = diamond + yellow — shape + color |

### Multilingual Accessibility

| Language Challenge | Solution |
|-------------------|----------|
| **Thai text** | `lang="th"` attribute on Thai content segments — screen readers switch pronunciation |
| **Chinese/Japanese** | `lang="zh"` / `lang="ja"` on target segments |
| **Mixed content** | Each segment wrapper has appropriate `lang` attribute |
| **RTL (Arabic)** | `dir="rtl"` on Arabic segments, layout uses logical CSS properties (not left/right) |
| **Font sizing** | CJK characters at same font-size appear smaller — use 1.1x scale for CJK |

## Testing Strategy

### Automated Testing

| Tool | What It Tests | When |
|------|--------------|:----:|
| **axe-core** (via @axe-core/react) | ARIA violations, contrast, structure | Every component in Storybook |
| **eslint-plugin-jsx-a11y** | JSX accessibility issues | Every build (CI) |
| **Lighthouse CI** | Performance + accessibility score | Every PR (target: a11y >= 95) |
| **Playwright** | Keyboard navigation flows | E2E test suite |

### Manual Testing Checklist

| Test | Frequency | Owner |
|------|:---------:|-------|
| Keyboard-only navigation through entire review flow | Every sprint | Dev |
| Screen reader (VoiceOver) — complete UJ2 flow | Every 2 sprints | QA |
| Screen reader (NVDA on Windows) — complete UJ2 flow | Every 2 sprints | QA |
| Color contrast verification on new components | Before merge | Dev (via Storybook) |
| Tablet layout verification (iPad) | Every 2 sprints | QA |
| Thai/CJK text rendering across browsers | Every sprint | QA |

### Browser Support Matrix

| Browser | Version | Priority | Notes |
|---------|:-------:|:--------:|-------|
| **Chrome** | Latest 2 | Primary | Primary dev/test target |
| **Edge** | Latest 2 | Primary | Same engine as Chrome |
| **Firefox** | Latest 2 | Secondary | Test keyboard nav differences |
| **Safari** | Latest 2 | Secondary | macOS users, VoiceOver testing |

## Implementation Guidelines

### CSS Architecture for Responsive

```css
/* Approach: Desktop-first with min-width degradation */

/* Base styles = Desktop (>= 1440px) */
.finding-list { display: grid; grid-template-columns: 1fr 400px; }

/* xl adaptation (1280-1439px) */
@media (max-width: 1439px) {
  .detail-panel { width: 360px; }
}

/* lg adaptation (1024-1279px) */
@media (max-width: 1279px) {
  .detail-panel { width: 300px; }
}

/* Tablet — single column */
@media (max-width: 1023px) {
  .finding-list { grid-template-columns: 1fr; }
  .detail-panel { position: fixed; bottom: 0; /* bottom sheet */ }
}

/* Mobile — dashboard only */
@media (max-width: 767px) {
  .review-view { display: none; }
  .mobile-banner { display: block; }
}
```

### Accessibility Development Rules

| # | Rule | Enforcement |
|:-:|------|-------------|
| 1 | Every interactive element has `aria-label` or visible text | eslint-plugin-jsx-a11y |
| 2 | Every icon-only button has `aria-label` | Code review checklist |
| 3 | Color is never the sole indicator | Design review checklist |
| 4 | Focus ring is never removed (`outline: none` banned) | ESLint rule |
| 5 | All images/icons have `alt` or `aria-hidden="true"` | eslint-plugin-jsx-a11y |
| 6 | Dynamic content uses `aria-live` regions | Component pattern library |
| 7 | Modals implement focus trap | Radix UI handles this |
| 8 | `lang` attribute set on all multilingual content | Component implementation |
| 9 | Touch targets >= 44x44px on tablet | Design review |
| 10 | `prefers-reduced-motion` respected for all animations | CSS/Framer Motion config |
