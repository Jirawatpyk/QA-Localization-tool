# P3: Proactive Guardrails for Epic 4 — Review & Decision Workflow

**Date:** 2026-03-08
**Owner:** Winston (Architect) + Bob (Scrum Master)
**Status:** Draft — Pending approval for merge into CLAUDE.md as Guardrails #25-40
**Scope:** WCAG 2.1 AA, WAI-ARIA APG patterns, keyboard navigation, focus management, undo/redo, severity display
**NFRs addressed:** NFR25 (WCAG 2.1 AA), NFR26 (keyboard-reachable), NFR27 (severity icon+text+color), NFR28 (contrast 4.5:1)

---

## How to Use This Document

These guardrails are **pre-coding rules** — check BEFORE writing every file in Epic 4. Each guardrail prevents a specific class of bug that is expensive to fix after the fact. The format matches existing Guardrails #1-24 in CLAUDE.md for seamless integration.

---

## Proposed Guardrails

### Guardrail #25: Color never sole information carrier

- **Rule:** Every UI element that uses color to convey meaning (severity, status, state, layer) MUST also have a distinct icon shape AND a text label. All three channels — icon, text, color — are required.
- **Why:** Color-blind users (8% of males) cannot distinguish red/green/amber. If severity is communicated by color alone, ~1 in 12 users will misread Critical as Minor. NFR27 explicitly requires `icon + text + color`. Violating SC 1.4.1 is a WCAG Level A failure (blocks AA compliance entirely).
- **Source:** [WCAG 2.1 SC 1.4.1 — Use of Color](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html), [SC 1.3.3 — Sensory Characteristics](https://www.w3.org/WAI/WCAG21/Understanding/sensory-characteristics.html)

### Guardrail #26: Contrast ratio verification mandatory

- **Rule:** Every text color + background color pair in review components MUST be verified against WCAG AA thresholds: **4.5:1** for normal text (< 18pt / < 14pt bold), **3:1** for large text (>= 18pt / >= 14pt bold). Non-text UI components (icons, focus indicators, borders conveying meaning) require **3:1** against adjacent colors. Use `tokens.css` severity/status colors — never hardcode hex values.
- **Why:** The severity tint backgrounds (green for accepted, red for rejected, yellow for flagged) combined with text colors easily fall below 4.5:1 if not checked. SC 1.4.3 failure is the most common WCAG violation in production apps. Review finding state colors (`#dcfce7` green-tinted bg with dark text) need explicit contrast verification.
- **Source:** [WCAG 2.1 SC 1.4.3 — Contrast (Minimum)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html), [SC 1.4.11 — Non-text Contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)

### Guardrail #27: Focus indicator: 2px indigo outline, 4px offset, 3:1 contrast

- **Rule:** Every interactive element (buttons, finding rows, filter chips, links, inputs) MUST show a visible focus indicator when focused via keyboard. Use the project standard: `outline: 2px solid var(--color-primary)` (`#4f46e5` indigo), `outline-offset: 4px`. The focus indicator MUST have >= 3:1 contrast ratio against the adjacent background. NEVER remove `outline` via `outline: none` or `outline: 0` without providing an equivalent visible alternative.
- **Why:** SC 2.4.7 (Focus Visible) is Level A — failure blocks AA entirely. The 4px offset prevents the outline from being obscured by element borders. Using `outline: none` for "cleaner UI" is the single most common a11y regression in React apps. SC 1.4.11 (Non-text Contrast) also applies to focus indicators.
- **Source:** [WCAG 2.1 SC 2.4.7 — Focus Visible](https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html), [SC 1.4.11 — Non-text Contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html), [G195 — Author-supplied focus indicator](https://www.w3.org/WAI/WCAG21/Techniques/general/G195.html)

### Guardrail #28: Single-key hotkeys require disable/remap mechanism

- **Rule:** Single character key shortcuts (A, R, F, N, S, +, -, J, K) MUST be active ONLY when a finding or the review area has focus. When an `<input>`, `<textarea>`, `<select>`, `[contenteditable]`, or modal is focused/open, ALL single-key hotkeys MUST be suppressed. Provide a mechanism to turn off or remap hotkeys (via Ctrl+? cheat sheet or settings).
- **Why:** SC 2.1.4 (Character Key Shortcuts) is Level A in WCAG 2.1 — added specifically because speech recognition users accidentally trigger single-key shortcuts while dictating. Without suppression in text inputs, typing "A note about this" would Accept a finding on the first keystroke. The exception in SC 2.1.4 is: shortcuts only active when the component has focus — which is our design (finding-scoped hotkeys).
- **Source:** [WCAG 2.1 SC 2.1.4 — Character Key Shortcuts](https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts.html), [F99 — Failure due to shortcuts that cannot be turned off](https://www.w3.org/WAI/WCAG21/Techniques/failures/F99)

### Guardrail #29: Grid pattern — roving tabindex, NOT aria-activedescendant

- **Rule:** The finding list (`role="grid"`) MUST use roving tabindex pattern: focused row gets `tabindex="0"`, all other rows get `tabindex="-1"`. Arrow keys (J/K/Up/Down) move `tabindex="0"` between rows. Do NOT use `aria-activedescendant` — it does not trigger browser auto-scroll to the focused element. Each row MUST have `role="row"` and be a direct child of a `role="rowgroup"` within the grid.
- **Why:** `aria-activedescendant` keeps DOM focus on the parent container and uses ARIA to indicate the "active" child — but the browser will NOT scroll the active descendant into view, breaking usability for lists with 300+ findings. Roving tabindex moves actual DOM focus to the row, triggering native scroll-into-view behavior. WAI-ARIA APG explicitly recommends roving tabindex for grid navigation.
- **Source:** [WAI-ARIA APG — Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/), [APG — Developing a Keyboard Interface (roving tabindex)](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)

### Guardrail #30: Modal focus trap — trap on open, restore on close

- **Rule:** Every modal/dialog MUST: (1) move focus to the first focusable element (or the dialog itself) on open, (2) trap Tab/Shift+Tab within the modal boundary, (3) close on Escape key, (4) restore focus to the element that triggered the modal on close. Store trigger element via `useRef(document.activeElement)` BEFORE opening. Use `role="dialog"` + `aria-modal="true"`. Background content MUST get `aria-hidden="true"` or `inert` attribute while modal is open.
- **Why:** Without focus trap, Tab key moves focus behind the modal overlay — users interact with invisible elements. Without focus restore, closing a modal leaves focus at `<body>`, forcing keyboard users to Tab through the entire page to return to their workflow. This is especially critical for the Severity Override dropdown, Add Finding dialog, and Bulk Action confirmation — all frequent modals in the review loop.
- **Source:** [WAI-ARIA APG — Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [H102 — Creating modal dialogs with HTML dialog element](https://www.w3.org/WAI/WCAG22/Techniques/html/H102)

### Guardrail #31: Escape key hierarchy — innermost layer closes first

- **Rule:** Escape key MUST follow a strict hierarchy: expanded finding detail collapses first, then modal/dialog closes, then dropdown/menu closes, then Command Palette closes, then filter panel resets. Only ONE layer closes per Escape press. NEVER bubble Escape through multiple layers in a single keypress. Each layer MUST call `event.stopPropagation()` after handling Escape.
- **Why:** If Escape closes both the severity override dropdown AND collapses the finding card simultaneously, users lose context. The Epic 4 review interface has 4+ escapable layers (dropdown > expanded card > detail panel > page-level). Without explicit hierarchy and `stopPropagation()`, React event bubbling closes all layers at once. This is the #1 reported UX bug in keyboard-driven review interfaces.
- **Source:** [WAI-ARIA APG — Dialog Modal (Escape closes)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [APG — Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)

### Guardrail #32: Auto-advance focus after action — next PENDING, not next row

- **Rule:** After a review action (Accept/Reject/Flag/Note/Source Issue), focus MUST advance to the **next finding with status='Pending'**, skipping already-reviewed findings. If no Pending findings remain, focus moves to the action bar (e.g., "Complete Review" button). Focus advance MUST use `requestAnimationFrame` or a microtask delay to ensure DOM has updated with the new state before moving focus. NEVER advance focus synchronously inside the action handler.
- **Why:** Advancing to the next sequential row (not next Pending) forces reviewers to manually skip reviewed findings — adding 1-2 keystrokes per finding * 300 findings/day = 300-600 wasted keystrokes. Synchronous focus advance during React state updates causes focus to land on a stale DOM node that gets unmounted, sending focus to `<body>`.
- **Source:** Review workflow UX requirement (Story 4.2 AC), React DOM reconciliation timing

### Guardrail #33: aria-live="polite" for score updates, "assertive" only for errors

- **Rule:** Use `aria-live="polite"` for: score changes, review progress updates, filter result counts, new AI findings appearing. Use `aria-live="assertive"` ONLY for: error messages, conflict warnings, budget exhausted alerts. NEVER use `aria-live="assertive"` for routine updates — it interrupts whatever the screen reader is currently reading. Every live region MUST be present in the DOM before content changes (mount the container first, then update its text content).
- **Why:** Screen reader users reviewing 300+ findings/day will hear score updates after every action. If `aria-live="assertive"`, every score change interrupts their current reading — making the app unusable. The "mount container first" rule exists because dynamically injecting a node with `aria-live` + content simultaneously is ignored by most screen readers (they only announce changes to existing live regions).
- **Source:** [MDN — ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions), [ARIA22 — Using role=status for status messages](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22)

### Guardrail #34: Never override browser/OS shortcuts — Ctrl+Z, Ctrl+A scoped to review

- **Rule:** Undo (Ctrl+Z) and Redo (Ctrl+Shift+Z) MUST only be active when the review finding list or action bar has focus — NOT globally. When an `<input>` or `<textarea>` is focused, Ctrl+Z MUST perform the browser's native text undo. Ctrl+A MUST select all findings only when the finding list has focus — in text inputs, it MUST perform native text select-all. NEVER use `preventDefault()` on Ctrl+S, Ctrl+P, Ctrl+W, Ctrl+N, Ctrl+T, F5, or any browser navigation shortcut.
- **Why:** Overriding Ctrl+Z globally causes the most confusing UX bug: user types in the note field, makes a typo, presses Ctrl+Z expecting text undo, but instead the entire previous finding action is undone. Overriding Ctrl+S causes users to lose the reflex of saving their work (our app auto-saves, but blocking the shortcut causes a flash of panic). Browser vendors explicitly warn against overriding native shortcuts.
- **Source:** [WAI-ARIA APG — Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/), [WCAG 2.1 SC 2.1.1 — Keyboard](https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html)

### Guardrail #35: Undo stack — Zustand per-tab, max 20, clear on file switch

- **Rule:** The undo/redo stack MUST be stored in Zustand (not localStorage, not server). Stack is per-tab (not per-session — multiple tabs have independent stacks). Maximum 20 entries (FIFO eviction when 21st action is pushed). Switching files clears the undo stack entirely. Bulk actions count as 1 undo entry (all findings in the bulk revert atomically). Redo stack clears when any new action is performed. On undo, the Server Action MUST verify the finding's current state matches the expected `previous_state` before reverting — if mismatched (concurrent edit), show conflict dialog instead of silently reverting.
- **Why:** Without a depth limit, a 300-finding review session accumulates 300+ undo entries consuming memory. Without clearing on file switch, undoing in File B could accidentally revert actions from File A (confusing). Without server-side state verification, concurrent reviewers can silently overwrite each other's work via undo.
- **Source:** Story 4.4b AC, Command pattern (GoF), Collaborative editing conflict resolution

### Guardrail #36: Severity display — icon shape + text label + color, minimum 16px icon

- **Rule:** Each severity level MUST have a unique, visually distinct icon SHAPE (not just color): Critical = `XCircle` or `AlertOctagon` (octagon/X), Major = `AlertTriangle` (triangle), Minor = `Info` or `AlertCircle` (circle), Enhancement = `Lightbulb` (lightbulb). Icons MUST be minimum 16px (per UX spec) with `aria-hidden="true"` (since the adjacent text label provides the accessible name). The text label ("Critical", "Major", "Minor") MUST always be visible — never hidden behind a tooltip or icon-only display.
- **Why:** Icon shape distinction is the primary accessibility mechanism for color-blind users. If Critical and Major both use a circle icon with different colors, a deuteranopic user (red-green color blind) cannot distinguish them. The 16px minimum ensures icons are perceivable at 200% zoom (NFR29). `aria-hidden="true"` on the icon prevents screen readers from reading "alert triangle Major" (redundant).
- **Source:** [WCAG 2.1 SC 1.4.1 — Use of Color](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html), NFR27 (icon+text+color), [G207 — 3:1 contrast for icons](https://www.w3.org/WAI/WCAG21/Techniques/general/G207)

### Guardrail #37: prefers-reduced-motion — respect for ALL animations

- **Rule:** Every CSS animation and JS-driven transition MUST check `prefers-reduced-motion: reduce`. When reduced motion is preferred: score morph animation → instant swap (no slide), finding expand/collapse → instant show/hide (no 150ms ease-out), toast slide-in → instant appear, new finding highlight → static border (no pulse). Use the existing `useReducedMotion()` hook from `@/hooks/useReducedMotion` for JS animations. For CSS, use `@media (prefers-reduced-motion: reduce) { animation: none; transition: none; }`.
- **Why:** Motion-triggered vestibular disorders affect ~35% of adults over 40. The review interface has 5+ animation points (score morph, card expand, toast, auto-advance, new finding highlight) — each one can trigger nausea/dizziness. WCAG 2.1 SC 2.3.3 (Animation from Interactions) is Level AAA but our NFR25 target (AA) still requires respecting `prefers-reduced-motion` as a best practice. The `useReducedMotion` hook already exists in the codebase.
- **Source:** [WCAG 2.1 SC 2.3.3 — Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html), existing `src/hooks/useReducedMotion.ts`

### Guardrail #38: ARIA landmarks and structural roles on review layout

- **Rule:** The review page layout MUST use ARIA landmark roles: `<nav>` or `role="navigation"` for file navigation panel, `<main>` or `role="main"` for finding list (only ONE per page), `role="complementary"` for detail panel (Sheet). The finding list MUST use `role="grid"` with `aria-label="Finding list"`. Each finding row MUST use `role="row"`. Expandable cards MUST have `aria-expanded="true|false"`. Filter bar MUST use `role="toolbar"` with `aria-label="Finding filters"`.
- **Why:** Screen reader users navigate by landmark roles ("jump to main", "jump to navigation"). Without landmarks, a review page with 300+ findings is a flat list of undifferentiated content — finding the filter bar requires tabbing through every finding. The `role="grid"` enables screen readers to announce "row 5 of 28" — critical spatial awareness for large lists. Missing `aria-expanded` means screen readers cannot tell if a finding card is open or closed.
- **Source:** [WCAG 2.1 SC 1.3.1 — Info and Relationships](https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html), [WAI-ARIA APG — Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/), [WAI-ARIA APG — Toolbar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/)

### Guardrail #39: lang attribute on segment text — mandatory for Thai/CJK rendering

- **Rule:** Every `<span>` or `<div>` that displays segment text (source or target) MUST have a `lang` attribute matching the segment's language (e.g., `lang="th"`, `lang="ja"`, `lang="zh"`, `lang="ko"`, `lang="en"`). If the language code is available from the file metadata (`sourceLang`/`targetLang`), use it. CJK text containers MUST also apply the `text-cjk-scale` class (1.1x font scale per UX spec). Never omit `lang` — browsers choose font fallbacks and line-breaking behavior based on this attribute.
- **Why:** Without `lang="th"`, browsers may use Latin heuristics for Thai text — producing incorrect line breaks (Thai has no spaces between words), wrong font selection, and garbled rendering of tone marks. Japanese text without `lang="ja"` may not trigger proper Ruby annotation rendering. SC 3.1.2 (Language of Parts) requires that each passage in a different language is identified. This is Level AA and directly within our NFR25 target.
- **Source:** [WCAG 2.1 SC 3.1.2 — Language of Parts](https://www.w3.org/WAI/WCAG21/Understanding/language-of-parts.html), Story 4.1c AC (explicit requirement)

### Guardrail #40: No focus stealing on mount — auto-expand is NOT auto-focus

- **Rule:** When Critical findings auto-expand on page load (Story 4.1a AC), they MUST NOT steal focus from the first logical tab stop. Initial focus on review page load goes to the first interactive element in the logical tab order (filter bar or first finding row) — NOT to an auto-expanded finding's content. Auto-advance after an action (Guardrail #32) is the ONLY legitimate programmatic focus move. `useEffect` that calls `.focus()` on mount is FORBIDDEN except for modal open (Guardrail #30) and auto-advance.
- **Why:** Auto-expanding Critical findings is a visual convenience — auto-focusing them breaks the keyboard user's mental model of tab order. If 3 Critical findings auto-expand and auto-focus the last one, keyboard users must Shift+Tab backwards to reach earlier content. Screen reader users hear content from the middle of the page on load — disorienting. React `useEffect` + `.focus()` on mount is the most common a11y regression in SPA apps.
- **Source:** [WCAG 2.1 SC 2.4.3 — Focus Order](https://www.w3.org/WAI/WCAG21/Understanding/focus-order.html), [WAI-ARIA APG — Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)

---

## Summary Table

| # | Title | NFR | WCAG SC | Prevents |
|---|-------|-----|---------|----------|
| 25 | Color never sole carrier | NFR27 | 1.4.1 (A) | Severity invisible to color-blind users |
| 26 | Contrast ratio verified | NFR28 | 1.4.3 (AA), 1.4.11 (AA) | Unreadable text on tinted backgrounds |
| 27 | Focus indicator standard | NFR25 | 2.4.7 (A), 1.4.11 (AA) | Invisible keyboard focus |
| 28 | Single-key hotkey guard | NFR26 | 2.1.4 (A) | Accidental actions from speech input / text typing |
| 29 | Grid roving tabindex | NFR26 | 2.1.1 (A) | No scroll-into-view for 300+ finding lists |
| 30 | Modal focus trap + restore | NFR25 | 2.4.3 (A) | Tab escapes modal, focus lost on close |
| 31 | Escape hierarchy | NFR25 | N/A (UX) | Multiple layers close at once |
| 32 | Auto-advance to Pending | NFR26 | N/A (UX) | 300+ wasted keystrokes per session |
| 33 | aria-live polite vs assertive | NFR25 | 4.1.3 (AA) | Screen reader interrupted every action |
| 34 | No browser shortcut override | NFR26 | 2.1.1 (A) | Ctrl+Z undoes finding instead of text |
| 35 | Undo stack constraints | NFR17 | N/A (UX) | Memory leak, cross-file undo, concurrent overwrite |
| 36 | Severity icon+text+color | NFR27 | 1.4.1 (A), 1.3.3 (A) | Indistinguishable severity for color-blind users |
| 37 | prefers-reduced-motion | NFR25 | 2.3.3 (AAA) | Vestibular disorders triggered by animations |
| 38 | ARIA landmarks + roles | NFR25 | 1.3.1 (A) | Screen reader cannot navigate page structure |
| 39 | lang attribute on segments | NFR25 | 3.1.2 (AA) | Thai/CJK garbled rendering, wrong line breaks |
| 40 | No focus stealing on mount | NFR25 | 2.4.3 (A) | Disorienting initial focus for keyboard/SR users |

---

## CLAUDE.md Integration Format

When approved, these guardrails will be added to CLAUDE.md in the same compressed one-liner style as #1-24. Proposed text:

```
25. **Color never sole information carrier** — severity/status/state MUST use icon (distinct shape per level) + text label + color. Never color alone (SC 1.4.1, NFR27). Test: grayscale screenshot must remain fully readable
26. **Contrast ratio verification** — 4.5:1 normal text, 3:1 large text (SC 1.4.3). 3:1 for non-text UI (icons, focus rings, borders) (SC 1.4.11). Use `tokens.css` colors — never hardcode hex in components. Verify tinted state backgrounds (green/red/yellow) against text color
27. **Focus indicator: 2px indigo, 4px offset** — every interactive element: `outline: 2px solid var(--color-primary)`, `outline-offset: 4px`. NEVER `outline: none` without visible alternative. Focus ring must have >= 3:1 contrast against adjacent background (SC 2.4.7, SC 1.4.11)
28. **Single-key hotkeys: scoped + suppressible** — A/R/F/N/S/+/-/J/K active ONLY when finding or review area focused. Suppress in `<input>`, `<textarea>`, `<select>`, `[contenteditable]`, modals. Must be disable/remap-able (SC 2.1.4). Check `event.target` tag before handling
29. **Grid navigation: roving tabindex** — finding list `role="grid"`: focused row `tabindex="0"`, others `tabindex="-1"`. Arrow/J/K moves tabindex. Do NOT use `aria-activedescendant` (no auto-scroll). Each row `role="row"` inside `role="rowgroup"` (APG Grid Pattern)
30. **Modal focus trap + restore** — on open: `useRef(document.activeElement)` then focus first focusable. Tab/Shift+Tab trapped. Esc closes. On close: `triggerRef.current?.focus()`. `aria-modal="true"` + background `inert` or `aria-hidden="true"` (APG Dialog Modal)
31. **Escape key hierarchy** — innermost layer closes first (dropdown > expanded card > detail panel > page). ONE layer per Esc press. `event.stopPropagation()` after handling. Never bubble through multiple layers
32. **Auto-advance to next Pending** — after action, focus next `status='Pending'` finding (skip reviewed). No Pending left → focus action bar. Use `requestAnimationFrame` delay — never sync focus in action handler (DOM may not be updated yet)
33. **aria-live: polite default, assertive only errors** — score changes, progress, filter counts = `aria-live="polite"`. Errors, conflicts, budget alerts = `aria-live="assertive"`. Live region container MUST exist in DOM before content changes (mount first, update text second)
34. **No browser shortcut override** — Ctrl+Z/Ctrl+A only when finding list focused. In text inputs → native browser behavior. Never `preventDefault()` on Ctrl+S/P/W/N/T/F5. Scope review shortcuts via `event.target` closest check
35. **Undo stack: Zustand, per-tab, max 20, clear on file switch** — bulk = 1 entry. Redo clears on new action. Server Action verifies `previous_state` match before revert — mismatch = conflict dialog. No localStorage, no server persistence
36. **Severity display: icon shape + text + color** — Critical=XCircle/octagon, Major=AlertTriangle, Minor=Info/circle, Enhancement=Lightbulb. Min 16px icon, `aria-hidden="true"` on icon (text label is accessible name). Text label always visible — never icon-only (NFR27)
37. **prefers-reduced-motion: ALL animations** — score morph, card expand, toast slide, auto-advance, new finding highlight — all must respect `prefers-reduced-motion: reduce`. Use existing `useReducedMotion()` hook for JS, `@media (prefers-reduced-motion: reduce)` for CSS. Reduced = instant, no transition
38. **ARIA landmarks on review layout** — `<nav>` for file nav, `<main>` for finding list (one per page), `role="complementary"` for detail panel. Finding list = `role="grid"` + `aria-label`. Expandable cards = `aria-expanded`. Filter bar = `role="toolbar"` + `aria-label`
39. **lang attribute on segment text** — every source/target text element MUST have `lang="{languageCode}"` from file metadata. CJK containers add 1.1x font scale. Without `lang`, Thai line-breaking and CJK font fallback break (SC 3.1.2)
40. **No focus stealing on mount** — auto-expand (Critical findings) is visual only, NOT auto-focus. Initial focus = first logical tab stop (filter bar or first finding row). `useEffect` + `.focus()` on mount FORBIDDEN except modal open (#30) and auto-advance (#32). (SC 2.4.3)
```

---

## Testing Implications

Each guardrail implies specific test categories:

| Guardrail | Test Type | Tool |
|-----------|-----------|------|
| #25, #36 | Visual regression: grayscale screenshot comparison | Playwright `--force-color-gamut` or CSS filter |
| #26 | Automated: axe-core contrast audit on each page | `@axe-core/playwright` in E2E |
| #27 | Unit: every interactive component renders focus ring class | Vitest + Testing Library |
| #28 | Unit: hotkey handler checks `event.target.tagName` | Vitest |
| #29 | Unit: tabindex updates on arrow key navigation | Vitest + Testing Library |
| #30 | E2E: Tab cycle within modal, Esc closes, focus returns | Playwright |
| #31 | E2E: nested Escape sequence (dropdown > card > panel) | Playwright |
| #32 | E2E: after Accept, focus lands on next Pending row | Playwright |
| #33 | Unit: live region role and aria-live attribute presence | Vitest + Testing Library |
| #34 | E2E: Ctrl+Z in text input performs text undo, not finding undo | Playwright |
| #35 | Unit: undo stack evicts at 21st entry, clears on file switch | Vitest |
| #36 | Unit: each severity renders correct icon component + text | Vitest + Testing Library |
| #37 | Unit: `useReducedMotion()` hook disables transition classes | Vitest |
| #38 | E2E: axe-core landmark audit | `@axe-core/playwright` |
| #39 | Unit: segment text elements have `lang` attribute | Vitest + Testing Library |
| #40 | E2E: page load focus is on first interactive element, not auto-expanded card | Playwright |

---

## Sources

- [WCAG 2.1 — Web Content Accessibility Guidelines](https://www.w3.org/TR/WCAG21/)
- [Understanding WCAG 2.1](https://www.w3.org/WAI/WCAG21/Understanding/)
- [SC 1.3.1 — Info and Relationships](https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html)
- [SC 1.3.3 — Sensory Characteristics](https://www.w3.org/WAI/WCAG21/Understanding/sensory-characteristics.html)
- [SC 1.4.1 — Use of Color](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html)
- [SC 1.4.3 — Contrast (Minimum)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [SC 1.4.11 — Non-text Contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)
- [SC 2.1.1 — Keyboard](https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html)
- [SC 2.1.4 — Character Key Shortcuts](https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts.html)
- [SC 2.4.3 — Focus Order](https://www.w3.org/WAI/WCAG21/Understanding/focus-order.html)
- [SC 2.4.7 — Focus Visible](https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html)
- [SC 3.1.2 — Language of Parts](https://www.w3.org/WAI/WCAG21/Understanding/language-of-parts.html)
- [SC 4.1.3 — Status Messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html)
- [WAI-ARIA APG — Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
- [WAI-ARIA APG — Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [WAI-ARIA APG — Toolbar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/)
- [WAI-ARIA APG — Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
- [MDN — ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions)
- [F99 — Failure: shortcuts cannot be turned off](https://www.w3.org/WAI/WCAG21/Techniques/failures/F99)
- [G195 — Author-supplied focus indicator](https://www.w3.org/WAI/WCAG21/Techniques/general/G195.html)
- [G207 — 3:1 contrast for icons](https://www.w3.org/WAI/WCAG21/Techniques/general/G207)
- [ARIA22 — Using role=status](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22)
