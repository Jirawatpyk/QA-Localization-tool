# P1: Keyboard & Focus Management Spike Guide

**Date:** 2026-03-08
**Owner:** Charlie (Dev)
**Status:** Complete
**Epic:** Epic 4 — Review & Decision Workflow
**Target Stories:** Story 4.0 (infrastructure), 4.1b (keyboard nav), 4.2–4.4 (review actions)

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Keyboard Hook Patterns](#2-keyboard-hook-patterns)
3. [Focus Management Patterns](#3-focus-management-patterns)
4. [ARIA Roles for Review Grid](#4-aria-roles-for-review-grid)
5. [Library Evaluation & Recommendation](#5-library-evaluation--recommendation)
6. [Playwright E2E Keyboard Testing](#6-playwright-e2e-keyboard-testing)
7. [Hook Skeleton Types](#7-hook-skeleton-types)
8. [Design Token Integration](#8-design-token-integration)
9. [Migration Plan from Existing Store](#9-migration-plan-from-existing-store)
10. [Guardrails & Anti-Patterns](#10-guardrails--anti-patterns)

---

## 1. Current State Analysis

### Existing `useKeyboardStore` (`src/stores/keyboard.store.ts`)

The project has a minimal Zustand store for keyboard shortcuts:

```typescript
type KeyboardState = {
  activeShortcuts: Map<string, () => void>
  registerShortcut: (key: string, handler: () => void) => void
  unregisterShortcut: (key: string) => void
  clearAll: () => void
}
```

**Limitations identified:**
- No scope isolation (global vs component-level)
- No conflict detection (silently overwrites duplicate key bindings)
- No modifier key parsing (`ctrl+s` is treated as a raw string, not parsed)
- No input/textarea/modal guard (fires even when typing in forms)
- No priority system (no way to override at modal level)
- Handler signature `() => void` lacks context (no event, no preventDefault)
- `Map<string, () => void>` — single handler per key, no scope stacking

**Existing review hooks** (no keyboard logic yet):
- `use-finding-changed-emitter.ts` — debounced finding change events
- `use-findings-subscription.ts` — Supabase Realtime subscription
- `use-score-subscription.ts` — score change subscription
- `use-threshold-subscription.ts` — confidence threshold subscription

**Existing review store** (`src/features/review/stores/review.store.ts`):
- `selectedId: string | null` — currently selected finding (keyboard navigation target)
- `findingsMap: Map<string, Finding>` — all findings for current file
- `filterState` — active filters
- `selectionMode: 'single' | 'bulk'` — for Shift+Click multi-select

**Radix UI focus primitives** (already in `node_modules` via shadcn/ui):
- `@radix-ui/react-focus-scope@1.1.7` — focus trapping
- `@radix-ui/react-focus-guards@1.1.3` — focus guard sentinels
- Used internally by `Dialog`, `Popover`, `DropdownMenu`

### Conclusion

The existing `useKeyboardStore` is a thin registration map. Story 4.0 needs a complete replacement with scope-aware, conflict-detecting, modifier-parsing keyboard management. The new hooks should live in `src/features/review/hooks/` per feature co-location convention, while the global store can be deprecated or reduced to a thin delegation layer.

---

## 2. Keyboard Hook Patterns

### 2.1 Key Normalization

All key bindings should be normalized to a canonical format for reliable comparison:

```
Format: [modifier+]...[key]
Examples: "a", "ctrl+s", "ctrl+shift+z", "escape"
```

**Normalization rules:**
1. Lowercase all parts: `Ctrl+S` -> `ctrl+s`
2. Sort modifiers alphabetically: `shift+ctrl+z` -> `ctrl+shift+z`
3. Map aliases: `Esc` -> `escape`, `Delete` -> `delete`, `ArrowUp` -> `arrowup`
4. Platform-aware: `Meta` on macOS = `Ctrl` on Windows (optional, defer to Epic 6)

**Why canonical format matters:** Conflict detection relies on string comparison. Without normalization, `Ctrl+S` and `ctrl+s` would register as different bindings.

### 2.2 Scope Isolation

Scopes define the context in which hotkeys are active. This prevents review hotkeys from firing inside a modal form.

**Scope hierarchy (highest priority wins):**

| Priority | Scope | Example | Active When |
|----------|-------|---------|-------------|
| 0 | `global` | `ctrl+?` (cheat sheet) | Always (unless input focused) |
| 1 | `page` | `ctrl+k` (command palette) | Page-level, overrides global |
| 2 | `review` | `a`, `r`, `f`, `j`, `k` | Review panel focused |
| 3 | `modal` | `escape`, `enter` | Modal open |
| 4 | `dropdown` | `arrowup`, `arrowdown` | Dropdown open |

**Activation rules:**
- Only the highest-priority active scope receives key events
- When a modal opens, `modal` scope activates and blocks `review`/`page`
- When modal closes, previous scope restores automatically
- `global` scope is special: always active unless `suppressGlobal: true`

**Implementation pattern — scope stack:**

```typescript
// Conceptual: scopes form a stack
const scopeStack: KeyboardScope[] = ['global', 'page', 'review']

// Modal opens:
scopeStack.push('modal')
// Now only 'modal' + 'global' hotkeys fire

// Modal closes:
scopeStack.pop()
// 'review' scope active again
```

### 2.3 Input Guard

Hotkeys MUST NOT fire when the user is typing in an input, textarea, or contenteditable element. This is a common source of bugs (pressing 'A' to type in a note field triggers "Accept").

**Guard implementation:**

```typescript
function shouldSuppressHotkey(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement
  const tagName = target.tagName

  // Always allow modifier combos (Ctrl+S, Ctrl+Z) in inputs
  if (event.ctrlKey || event.metaKey || event.altKey) return false

  // Suppress single-character hotkeys in editable elements
  if (tagName === 'INPUT' || tagName === 'TEXTAREA') return true
  if (target.isContentEditable) return true
  if (target.getAttribute('role') === 'textbox') return true

  return false
}
```

**Edge cases:**
- `Escape` should work everywhere (close modal from inside input)
- `Ctrl+Z` should pass through to input (undo text), NOT trigger review undo
- `Ctrl+A` in input = select all text, NOT select all findings
  - Resolution: check `activeElement` — if it's an input/textarea, let browser handle `Ctrl+A`

### 2.4 Conflict Detection

When two handlers register the same key in the same scope, this is a conflict. It should log a warning (dev mode) rather than silently overwrite.

**Detection strategy:**

```typescript
function detectConflict(
  key: string,
  scope: KeyboardScope,
  existingBindings: Map<string, KeyBinding>,
): ConflictResult {
  const normalized = normalizeKey(key)
  const existing = existingBindings.get(`${scope}:${normalized}`)

  if (existing) {
    return {
      hasConflict: true,
      conflictWith: existing.description,
      scope,
      key: normalized,
    }
  }
  return { hasConflict: false }
}
```

**Conflict resolution policy:**
- Same scope, same key: **WARN** in dev, last-registered wins
- Different scope, same key: **OK** — higher priority scope takes precedence
- Same component re-render: **IGNORE** — same identity, update handler ref

### 2.5 J/K Navigation Pattern

J/K (or arrow keys) navigate between findings in the list. This requires coordination with the review store's `selectedId`.

**Navigation state machine:**

```
[No selection] --J/K--> [First/Last item selected]
[Item N selected] --J/Down--> [Item N+1 selected] (or wrap to first)
[Item N selected] --K/Up--> [Item N-1 selected] (or wrap to last)
[Item selected] --Enter--> [Item expanded]
[Item expanded] --Escape--> [Item collapsed]
[Item expanded] --J--> [Next item selected, current collapses]
```

**Implementation considerations:**
- Navigation operates on **filtered** findings list (respect active filters)
- Sort order: severity (Critical > Major > Minor), then creation time
- `selectedId` in `useReviewStore` is the source of truth
- Visual focus indicator follows `selectedId`
- When item is expanded and user presses `J`, collapse current then move
- Wrap behavior should be configurable (Story 4.1b: "optional via user preference")

**Performance note for 300+ findings:**
- Navigation lookup must be O(1) — maintain an ordered array index
- Do NOT iterate `findingsMap` on every keypress
- Cache sorted/filtered list as derived state (Zustand selector or `useMemo`)

### 2.6 Enter/Escape Hierarchy

Escape has a layered behavior — it closes the most specific open thing first:

```
Esc priority (highest first):
1. Close dropdown/popover (if open)
2. Close modal/dialog (if open)
3. Collapse expanded finding card (if expanded)
4. Clear search/filter (if active)
5. Deselect finding (if selected)
6. No-op (nothing to close)
```

Enter has simpler behavior:
1. In modal: submit form / confirm action
2. On collapsed finding: expand it
3. On button: activate it

**Implementation:** Each layer registers an Escape handler. The scope system naturally handles priority — modal scope's Escape fires before review scope's Escape.

---

## 3. Focus Management Patterns

### 3.1 Focus Trap in Modals

Radix UI Dialog already provides focus trapping via `@radix-ui/react-focus-scope`. For custom modals (e.g., keyboard cheat sheet, severity override dropdown), we should reuse the same primitive.

**How Radix FocusScope works:**
- Renders sentinel `<span>` elements at boundaries
- Tab from last focusable -> wraps to first focusable
- Shift+Tab from first focusable -> wraps to last focusable
- Focus is moved to first focusable element on mount
- Focus restores to previously focused element on unmount

**For custom focus traps** (non-Dialog contexts):

```tsx
import { FocusScope } from 'radix-ui'

function CustomPanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  if (!open) return null
  return (
    <FocusScope trapped restoreFocus>
      <div role="dialog" aria-modal="true">
        {children}
      </div>
    </FocusScope>
  )
}
```

**Recommendation:** Do NOT build custom focus trapping. Use Radix `FocusScope` (already installed) for any focus trap scenario. It handles edge cases (iframe focus, shadow DOM, dynamically added elements) that are hard to get right.

### 3.2 Auto-Advance After Action

When a reviewer accepts/rejects/flags a finding, focus should automatically move to the next **pending** finding. This is the "auto-advance" pattern critical for 300+ finding workflows.

**Auto-advance algorithm:**

```
1. User performs action on Finding N (state changes to non-pending)
2. Search forward from N+1 for next finding where status === 'pending'
3. If found: set selectedId = next pending, scroll into view
4. If not found (all remaining reviewed):
   a. Search from beginning for any pending finding
   b. If none: focus moves to "Complete Review" button
5. Auto-advance delay: 200ms after action (per Story 4.2 AC)
```

**Implementation considerations:**
- Auto-advance should be **synchronous with state update** — use Zustand's `set` callback to compute next ID in same tick, then apply focus after 200ms delay
- `requestAnimationFrame` for scroll-into-view (avoid forced reflow)
- Skip non-visible findings (filtered out by current filter state)
- Do NOT auto-advance during bulk operations (advance once after batch completes)

### 3.3 Focus Restore on Modal Close

When a modal opens, we must remember what had focus, then restore it when the modal closes.

**Radix Dialog handles this automatically** (via `FocusScope restoreFocus`). For custom modals/panels:

```typescript
function useFocusRestore() {
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const saveFocus = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement
  }, [])

  const restoreFocus = useCallback(() => {
    const el = previousFocusRef.current
    if (el && document.contains(el)) {
      // Delay to allow DOM updates to settle
      requestAnimationFrame(() => {
        el.focus({ preventScroll: true })
      })
    }
    previousFocusRef.current = null
  }, [])

  return { saveFocus, restoreFocus }
}
```

**Edge cases:**
- Element was removed from DOM while modal was open -> focus review list container
- Element is now disabled -> find nearest focusable sibling
- Multiple nested modals -> stack of saved focus targets (push/pop)

### 3.4 `focus-visible` vs `focus` Styling

**Rule:** Use `:focus-visible` for keyboard focus indicators, `:focus` only for programmatic focus that needs visibility.

| Scenario | Pseudo-class | Reason |
|----------|-------------|--------|
| Tab navigation | `:focus-visible` | Browser shows ring only for keyboard users |
| Mouse click on button | `:focus` (no ring) | `:focus-visible` naturally hides ring on click |
| Programmatic `el.focus()` after action | `:focus-visible` | Chromium shows ring when focus is programmatic |
| J/K navigation (custom) | Manual class | We control this, not the browser |

**For J/K virtual focus** (where DOM focus stays on the list container and `aria-activedescendant` points to the active row), we need a CSS class rather than `:focus-visible`:

```css
/* Custom focus indicator for J/K navigation */
[data-keyboard-focused="true"] {
  outline: 2px solid var(--color-primary);
  outline-offset: 4px;
}
```

### 3.5 Focus Indicator Design Tokens

Per Story 4.0 AC, all focus indicators use:
- `outline: 2px solid #4f46e5` (indigo) = `var(--color-primary)`
- `outline-offset: 4px`

New tokens to add to `src/styles/tokens.css`:

```css
@theme {
  /* Focus */
  --focus-ring-color: #4f46e5;     /* = --color-primary */
  --focus-ring-width: 2px;
  --focus-ring-offset: 4px;

  /* Finding states (Story 4.2) */
  --color-state-accepted: #dcfce7;
  --color-state-rejected: #fee2e2;
  --color-state-flagged: #fef9c3;
  --color-state-noted: #dbeafe;
  --color-state-source-issue: #f3e8ff;
  --color-state-manual: #f1f5f9;
}
```

**Tailwind v4 utility class:**

```css
/* In a global stylesheet or component */
.focus-ring {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
```

---

## 4. ARIA Roles for Review Grid

### 4.1 Grid Pattern

The finding list uses WAI-ARIA grid pattern (not simple `list`/`listitem`) because it supports 2D navigation and interactive cells (action buttons).

```html
<!-- Finding list container -->
<div role="grid" aria-label="Findings review list" aria-rowcount={totalFindings}>

  <!-- Group header (optional, for severity groups) -->
  <div role="rowgroup" aria-label="Critical findings">

    <!-- Individual finding row -->
    <div
      role="row"
      id={`finding-${finding.id}`}
      aria-rowindex={rowIndex}
      aria-selected={isSelected}
      aria-expanded={isExpanded}
      tabindex={isFocused ? 0 : -1}
    >
      <!-- Severity cell -->
      <div role="gridcell" aria-label={`Severity: ${finding.severity}`}>
        <SeverityIcon severity={finding.severity} />
        <span>{finding.severity}</span>
      </div>

      <!-- Category cell -->
      <div role="gridcell">{finding.category}</div>

      <!-- Actions cell -->
      <div role="gridcell">
        <button aria-label="Accept finding" aria-keyshortcuts="a">
          [A] Accept
        </button>
      </div>
    </div>

    <!-- Expanded detail (conditional) -->
    {isExpanded && (
      <div role="row" aria-label="Finding details">
        <div role="gridcell" aria-colspan={3}>
          <FindingDetail finding={finding} />
        </div>
      </div>
    )}
  </div>
</div>
```

### 4.2 `aria-activedescendant` for Virtual Focus

For J/K navigation, we use **roving tabindex** OR **`aria-activedescendant`**. Recommendation: **`aria-activedescendant`** because:

1. DOM focus stays on the grid container (single focus target)
2. No need to call `.focus()` on individual rows (avoids scroll jumps)
3. Screen readers announce the referenced element
4. Works well with 300+ items (no performance impact from moving DOM focus)

```html
<div
  role="grid"
  tabindex="0"
  aria-activedescendant={selectedId ? `finding-${selectedId}` : undefined}
  onKeyDown={handleGridKeyDown}
>
  {findings.map(f => (
    <div
      role="row"
      id={`finding-${f.id}`}
      aria-selected={f.id === selectedId}
      data-keyboard-focused={f.id === selectedId ? "true" : undefined}
    >
      ...
    </div>
  ))}
</div>
```

**How it works:**
1. User presses `J` -> `handleGridKeyDown` updates `selectedId` in store
2. `aria-activedescendant` updates to `finding-{nextId}`
3. Screen reader announces the new row
4. CSS `[data-keyboard-focused="true"]` shows focus indicator
5. `scrollIntoView({ block: 'nearest' })` ensures visibility

### 4.3 `aria-expanded` for Collapsible Cards

```html
<div
  role="row"
  aria-expanded={isExpanded}
  aria-label={`${finding.severity} finding: ${finding.category}. ${isExpanded ? 'Expanded' : 'Collapsed'}`}
>
```

**Rules:**
- `aria-expanded="true"` when FindingCard is showing full detail
- `aria-expanded="false"` when showing FindingCardCompact
- Do NOT use `aria-expanded` if the row is not expandable

### 4.4 `aria-live` for Dynamic Updates

```html
<!-- Score display — announces score changes -->
<div aria-live="polite" aria-atomic="true">
  MQM Score: {score}
</div>

<!-- Review progress — announces progress changes -->
<div aria-live="polite" aria-atomic="true">
  Reviewed: {reviewed} of {total} findings
</div>

<!-- Action feedback — announces action results -->
<div aria-live="assertive" className="sr-only" role="status">
  {lastActionMessage}
</div>
```

**`polite` vs `assertive`:**
- `polite`: score changes, progress updates (wait until user is idle)
- `assertive`: action confirmation "Finding #14 accepted" (announce immediately)
- Use a **single** live region for action feedback — update its text content, do not create new elements

### 4.5 `aria-keyshortcuts` for Hotkey Discovery

Each action button should declare its keyboard shortcut:

```html
<button aria-keyshortcuts="a" aria-label="Accept finding">
  [A] Accept
</button>
<button aria-keyshortcuts="r" aria-label="Reject finding">
  [R] Reject
</button>
<button aria-keyshortcuts="Control+?" aria-label="Show keyboard shortcuts">
  Shortcuts
</button>
```

**Format:** Use `aria-keyshortcuts` standard format: `Control+Shift+Z`, `Alt+F`, etc.

### 4.6 Screen Reader Announcements

Create a centralized announcement helper:

```typescript
function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const el = document.getElementById('sr-announcer')
  if (!el) return
  el.setAttribute('aria-live', priority)
  // Clear then set to trigger re-announcement of same message
  el.textContent = ''
  requestAnimationFrame(() => {
    el.textContent = message
  })
}
```

**Usage in review actions:**
- Accept: `announce('Finding 14 accepted. 3 findings remaining.', 'assertive')`
- Navigate: `announce('Finding 15: Critical terminology issue in segment 42', 'polite')`
- Score change: `announce('MQM Score updated to 87.5', 'polite')`

---

## 5. Library Evaluation & Recommendation

### 5.1 Option A: `react-hotkeys-hook` (v5)

**Pros:**
- Mature library, well-tested
- Built-in input/textarea guard (`enableOnFormTags`)
- Scope support
- Modifier key parsing
- ~4KB gzipped

**Cons:**
- Additional dependency (project prefers minimal deps)
- Scope system is string-based, not type-safe
- No conflict detection
- React 19 compatibility: uses `useEffect` + `addEventListener` — should work but untested with React Compiler
- Would need wrapper to integrate with Zustand store

### 5.2 Option B: Radix UI Focus Primitives (already installed)

**Pros:**
- Already in `node_modules` (zero new deps)
- `FocusScope` for focus trapping — production-tested in Dialog/Sheet
- `FocusGuards` for sentinel elements

**Cons:**
- Focus primitives only — no hotkey management
- No key binding registry, conflict detection, or scope isolation
- Would need to build hotkey system from scratch alongside

### 5.3 Option C: Custom Hooks (Native `KeyboardEvent` + `useEffect`)

**Pros:**
- Zero new dependencies
- Full control over scope system, conflict detection, integration with Zustand
- Type-safe from the start (our types, our unions)
- Easy to test (pure functions + Zustand store)
- Matches project pattern (other hooks are custom, not library-wrapped)

**Cons:**
- More code to write and maintain
- Must handle edge cases (IME composition, modifier key state, browser differences)
- No community battle-testing

### 5.4 Recommendation: **Option C (Custom Hooks) + Radix FocusScope**

**Justification:**

1. **Hotkey requirements are domain-specific.** We need scope stacking (global -> page -> review -> modal), conflict detection with dev warnings, integration with `useReviewStore.selectedId`, auto-advance logic, and Esc hierarchy. No library provides this out of the box — we'd need a wrapper regardless.

2. **Radix FocusScope covers focus trapping.** The hardest part of focus management (trap + restore) is already solved by Radix. We should reuse it for modals/panels rather than reimplementing.

3. **Zero new dependencies.** The project guidelines prefer minimal deps. Custom hooks with native `KeyboardEvent` + Zustand are sufficient.

4. **Testing alignment.** Custom hooks are pure-function testable with Vitest. Library hooks often need more complex mocking.

5. **React 19 + React Compiler safety.** Custom hooks using `useEffect` + `useRef` + `useCallback` are React Compiler friendly. Third-party hooks may have hidden mutable closures that break compiler optimization.

**Implementation plan:**
- `useKeyboardActions` — custom hook (native `keydown` listener + scope Zustand store)
- `useFocusManagement` — custom hook (tracks focus history + auto-advance logic)
- Focus trapping — delegate to Radix `FocusScope` (already in Dialog/Sheet components)
- Screen reader announcements — thin utility function (no hook needed)

---

## 6. Playwright E2E Keyboard Testing

### 6.1 Basic Hotkey Testing

```typescript
// Press single key
await page.keyboard.press('a')
// Press modifier combo
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+Shift+z')
// Press Escape
await page.keyboard.press('Escape')
```

**Important:** `page.keyboard.press()` dispatches to the currently focused element. Ensure the grid container has focus first:

```typescript
// Focus the finding list first
await page.getByRole('grid', { name: 'Findings review list' }).focus()
// Then press J to navigate
await page.keyboard.press('j')
```

### 6.2 Focus Assertions

```typescript
// Assert specific element is focused
await expect(page.getByRole('row', { name: /Critical.*terminology/i }))
  .toBeFocused()

// Assert aria-activedescendant points to correct row
const grid = page.getByRole('grid')
await expect(grid).toHaveAttribute(
  'aria-activedescendant',
  `finding-${expectedFindingId}`
)
```

### 6.3 Tab Order Verification

```typescript
// Verify logical tab order: filter -> list -> detail -> actions
await page.keyboard.press('Tab')
await expect(page.getByRole('combobox', { name: /severity filter/i }))
  .toBeFocused()

await page.keyboard.press('Tab')
// ... more tab presses to traverse filter bar

await page.keyboard.press('Tab')
await expect(page.getByRole('grid')).toBeFocused()

await page.keyboard.press('Tab')
await expect(page.getByRole('region', { name: /detail panel/i }))
  .toBeFocused()
```

### 6.4 `aria-activedescendant` Verification

```typescript
// Navigate with J/K and verify virtual focus
const grid = page.getByRole('grid')
await grid.focus()

// Press J to move to first finding
await page.keyboard.press('j')
const firstRowId = await page.getByRole('row').first().getAttribute('id')
await expect(grid).toHaveAttribute('aria-activedescendant', firstRowId)

// Press J again to move to second
await page.keyboard.press('j')
const secondRowId = await page.getByRole('row').nth(1).getAttribute('id')
await expect(grid).toHaveAttribute('aria-activedescendant', secondRowId)

// Press K to move back
await page.keyboard.press('k')
await expect(grid).toHaveAttribute('aria-activedescendant', firstRowId)
```

### 6.5 Expand/Collapse with Enter/Escape

```typescript
// Navigate to finding and expand
await page.keyboard.press('j')
await page.keyboard.press('Enter')

// Verify expanded state
const row = page.getByRole('row').first()
await expect(row).toHaveAttribute('aria-expanded', 'true')

// Verify detail panel shows content
await expect(page.getByText(/source text/i)).toBeVisible()

// Collapse with Escape
await page.keyboard.press('Escape')
await expect(row).toHaveAttribute('aria-expanded', 'false')
```

### 6.6 Auto-Advance After Action

```typescript
// Focus finding #1 (pending)
await grid.focus()
await page.keyboard.press('j')

// Accept it
await page.keyboard.press('a')

// Wait for auto-advance (200ms delay per AC)
await page.waitForTimeout(300)

// Verify focus moved to next pending finding (not #2 if #2 was already accepted)
const activeId = await grid.getAttribute('aria-activedescendant')
// activeId should be the next pending finding's ID
await expect(page.locator(`#${activeId}`))
  .toHaveAttribute('aria-selected', 'true')
```

### 6.7 Input Guard Verification

```typescript
// Focus the search input
await page.getByRole('searchbox').focus()

// Type 'a' — should NOT trigger Accept
await page.keyboard.press('a')
await expect(page.getByRole('searchbox')).toHaveValue('a')

// No toast should appear (Accept was not triggered)
await expect(page.getByText(/accepted/i)).not.toBeVisible()
```

### 6.8 Modal Focus Trap

```typescript
// Open keyboard shortcuts modal
await page.keyboard.press('Control+?')

// Verify focus is inside modal
await expect(page.getByRole('dialog')).toBeVisible()

// Tab should cycle within modal
const firstFocusable = page.getByRole('dialog').getByRole('button').first()
const lastFocusable = page.getByRole('dialog').getByRole('button').last()

await lastFocusable.focus()
await page.keyboard.press('Tab')
await expect(firstFocusable).toBeFocused()

// Escape closes and restores focus
await page.keyboard.press('Escape')
await expect(page.getByRole('dialog')).not.toBeVisible()
await expect(grid).toBeFocused()
```

### 6.9 Testing Gotchas (Project-Specific)

| Gotcha | Mitigation |
|--------|-----------|
| `driver.js` tour overlay blocks clicks | Set `setup_tour_completed` in E2E setup (existing pattern) |
| Radix UI Select not native `<select>` | Use `.click()` on trigger then `.click()` on option (existing pattern) |
| Focus assertion flaky in CI | Add 50ms delay before `toBeFocused()` assertion |
| `aria-activedescendant` not set on first render | Focus grid first, THEN press navigation key |
| Toast auto-dismiss (3s) | Assert within 2s of action, or use `page.waitForSelector` |
| `prefers-reduced-motion` | Do NOT assert animation timing in E2E (varies by environment) |

---

## 7. Hook Skeleton Types

### 7.1 `useKeyboardActions` Types

```typescript
// ── File: src/features/review/hooks/use-keyboard-actions.ts ──

// Supported scopes (ordered by priority, highest last)
type KeyboardScope = 'global' | 'page' | 'review' | 'modal' | 'dropdown'

// Modifier keys (sorted alphabetically for normalization)
type ModifierKey = 'alt' | 'ctrl' | 'meta' | 'shift'

// Parsed key binding
type ParsedKey = {
  key: string                // e.g., 'a', 'escape', 'arrowdown'
  modifiers: ModifierKey[]   // e.g., ['ctrl', 'shift']
  raw: string                // original normalized string: 'ctrl+shift+z'
}

// Single hotkey registration
type KeyBinding = {
  key: ParsedKey
  scope: KeyboardScope
  handler: (event: KeyboardEvent) => void
  description: string        // for cheat sheet: "Accept finding"
  category: string           // for cheat sheet grouping: "Review Actions"
  enabled: boolean           // dynamic enable/disable
}

// Registration options
type RegisterOptions = {
  scope?: KeyboardScope       // default: 'review'
  description: string
  category?: string           // default: 'General'
  enabled?: boolean           // default: true
  preventDefault?: boolean    // default: true
  allowInInput?: boolean      // default: false (Escape is an exception)
}

// Conflict detection result
type ConflictResult = {
  hasConflict: boolean
  conflictWith: string | null   // description of conflicting binding
  scope: KeyboardScope | null
  key: string | null
}

// Hook return type
type UseKeyboardActionsReturn = {
  /** Register a hotkey binding. Returns cleanup function. */
  register: (key: string, handler: (event: KeyboardEvent) => void, options: RegisterOptions) => () => void

  /** Unregister a specific key in a scope */
  unregister: (key: string, scope?: KeyboardScope) => void

  /** Push a new scope onto the stack (e.g., when modal opens) */
  pushScope: (scope: KeyboardScope) => void

  /** Pop the top scope from the stack (e.g., when modal closes) */
  popScope: (scope: KeyboardScope) => void

  /** Get current active scope */
  activeScope: KeyboardScope

  /** Get all registered bindings (for cheat sheet rendering) */
  getAllBindings: () => KeyBinding[]

  /** Check if a key would conflict in a given scope */
  checkConflict: (key: string, scope?: KeyboardScope) => ConflictResult

  /** Temporarily disable all hotkeys (e.g., during drag operation) */
  suspend: () => void

  /** Re-enable hotkeys after suspend */
  resume: () => void
}

// Hook signature
function useKeyboardActions(): UseKeyboardActionsReturn
```

### 7.2 `useFocusManagement` Types

```typescript
// ── File: src/features/review/hooks/use-focus-management.ts ──

// Focus zones in the review layout (tab order)
type FocusZone = 'filter-bar' | 'finding-list' | 'detail-panel' | 'action-bar'

// Auto-advance configuration
type AutoAdvanceConfig = {
  enabled: boolean            // default: true
  delayMs: number             // default: 200 (per Story 4.2 AC)
  skipStatuses: string[]      // statuses to skip: ['accepted', 'rejected', ...]
  wrapAround: boolean         // default: false (user preference, Story 4.1b)
}

// Escape hierarchy level
type EscapeLevel =
  | 'dropdown'    // close dropdown/popover
  | 'modal'       // close modal/dialog
  | 'expanded'    // collapse expanded finding card
  | 'filter'      // clear search/filter
  | 'selection'   // deselect finding

// Focus history entry (for restore)
type FocusHistoryEntry = {
  element: HTMLElement
  zone: FocusZone
  findingId: string | null
  timestamp: number
}

// Hook return type
type UseFocusManagementReturn = {
  /** Navigate to next finding (J/Down) */
  navigateNext: () => void

  /** Navigate to previous finding (K/Up) */
  navigatePrevious: () => void

  /** Expand currently focused finding (Enter) */
  expandFocused: () => void

  /** Collapse currently focused finding (Escape) */
  collapseFocused: () => void

  /** Handle Escape with hierarchy logic */
  handleEscape: () => EscapeLevel | null

  /** Auto-advance to next pending finding after action */
  autoAdvance: (currentFindingId: string) => string | null

  /** Move focus to specific zone */
  focusZone: (zone: FocusZone) => void

  /** Save current focus for later restore */
  saveFocus: () => void

  /** Restore previously saved focus */
  restoreFocus: () => void

  /** Scroll a finding into view (nearest, no jump) */
  scrollToFinding: (findingId: string) => void

  /** Ref to attach to the grid container */
  gridRef: React.RefObject<HTMLDivElement>

  /** Currently focused finding ID (derived from store) */
  focusedFindingId: string | null

  /** Whether any finding is expanded */
  hasExpandedFinding: boolean

  /** Update auto-advance configuration */
  setAutoAdvanceConfig: (config: Partial<AutoAdvanceConfig>) => void
}

// Hook signature
function useFocusManagement(config?: Partial<AutoAdvanceConfig>): UseFocusManagementReturn
```

### 7.3 Keyboard Cheat Sheet Data Structure

```typescript
// ── For the Ctrl+? cheat sheet modal (Story 4.0 AC) ──

type HotkeyCategory = {
  name: string
  bindings: {
    key: string            // display format: "J / ↓"
    description: string    // "Next finding"
  }[]
}

// Static data (does not need to be in store)
const HOTKEY_CATEGORIES: HotkeyCategory[] = [
  {
    name: 'Navigation',
    bindings: [
      { key: 'J / ↓', description: 'Next finding' },
      { key: 'K / ↑', description: 'Previous finding' },
      { key: 'Enter', description: 'Expand finding' },
      { key: 'Escape', description: 'Collapse / Close' },
    ],
  },
  {
    name: 'Review Actions',
    bindings: [
      { key: 'A', description: 'Accept finding' },
      { key: 'R', description: 'Reject finding' },
      { key: 'F', description: 'Flag finding' },
      { key: 'N', description: 'Note finding' },
      { key: 'S', description: 'Source issue' },
      { key: '-', description: 'Severity override' },
      { key: '+', description: 'Add finding' },
    ],
  },
  {
    name: 'Bulk Operations',
    bindings: [
      { key: 'Shift + Click', description: 'Select range' },
      { key: 'Ctrl + A', description: 'Select all (filtered)' },
      { key: 'Ctrl + Z', description: 'Undo' },
      { key: 'Ctrl + Shift + Z', description: 'Redo' },
    ],
  },
  {
    name: 'Search & Panels',
    bindings: [
      { key: 'Ctrl + K', description: 'Command palette' },
      { key: 'Ctrl + F', description: 'Search findings' },
      { key: 'Ctrl + ?', description: 'Keyboard shortcuts' },
    ],
  },
]
```

### 7.4 Integration with `useReviewStore`

The hooks integrate with the existing review store — they do NOT duplicate state:

```
useReviewStore (source of truth)
├── selectedId          ← set by useFocusManagement.navigateNext/Previous
├── findingsMap         ← read by useFocusManagement for ordered navigation
├── filterState         ← read by useFocusManagement (skip filtered findings)
├── selectionMode       ← read by useKeyboardActions (Shift behavior changes)
└── selectedIds         ← set by useKeyboardActions (Shift+J/K multi-select)

useKeyboardActions (event listener)
├── Listens to 'keydown' on document (or grid ref)
├── Checks scope, guard, conflict
├── Calls handler (which calls store actions or useFocusManagement methods)
└── No own state beyond scope stack + binding registry

useFocusManagement (focus orchestrator)
├── Reads selectedId from store
├── Computes ordered finding list (memoized)
├── Manages auto-advance timing
├── Manages Esc hierarchy
└── Manages focus history stack
```

---

## 8. Design Token Integration

### New Tokens Required

Add to `src/styles/tokens.css`:

```css
@theme {
  /* ... existing tokens ... */

  /* Focus indicators (Story 4.0) */
  --focus-ring-color: #4f46e5;
  --focus-ring-width: 2px;
  --focus-ring-offset: 4px;

  /* Finding review states (Story 4.2) */
  --color-state-accepted: #dcfce7;
  --color-state-rejected: #fee2e2;
  --color-state-flagged: #fef9c3;
  --color-state-noted: #dbeafe;
  --color-state-source-issue: #f3e8ff;
  --color-state-manual: #f1f5f9;

  /* Review layout (Story 4.0/4.1d) */
  --review-file-nav-width: 240px;
  --review-detail-panel-width: 400px;
  --review-detail-panel-width-md: 360px;
  --review-detail-panel-width-sm: 300px;
}
```

### Global Focus Ring Utility

```css
/* Global utility for keyboard focus ring */
.focus-ring-keyboard:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

/* Virtual focus for J/K navigation (data attribute driven) */
[data-keyboard-focused="true"] {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

/* Finding border focus (Story 4.1b: "border: 2px solid #4f46e5") */
.finding-focused {
  border: var(--focus-ring-width) solid var(--focus-ring-color);
}
```

---

## 9. Migration Plan from Existing Store

### Phase 1: Story 4.0 (Infrastructure)

1. Create `useKeyboardActions` hook at `src/features/review/hooks/use-keyboard-actions.ts`
2. Create `useFocusManagement` hook at `src/features/review/hooks/use-focus-management.ts`
3. Keep `src/stores/keyboard.store.ts` unchanged (no consumers will break)
4. New hooks are independent — they manage their own scope stack via internal Zustand slice or `useRef`

### Phase 2: Story 4.1b (Keyboard Navigation)

1. Wire `useKeyboardActions` to register J/K/Enter/Escape
2. Wire `useFocusManagement` to `useReviewStore.selectedId`
3. Add ARIA attributes to finding list components

### Phase 3: Story 4.2 (Review Actions)

1. Register A/R/F/N/S/-/+ hotkeys via `useKeyboardActions`
2. Wire auto-advance via `useFocusManagement`
3. Add live region announcements

### Phase 4: Deprecation (Epic 4 cleanup)

1. If no other features use `useKeyboardStore`, deprecate it
2. If sidebar or other features use it, add scope bridge: `useKeyboardStore.registerShortcut` -> delegates to `useKeyboardActions.register` with `scope: 'global'`

**No breaking changes during migration.** The old store and new hooks coexist until all consumers migrate.

---

## 10. Guardrails & Anti-Patterns

### Anti-Patterns (Review Code Specific)

| Anti-Pattern | Why It's Bad | Correct Approach |
|-------------|-------------|-----------------|
| `document.addEventListener('keydown', handler)` in component without cleanup | Memory leak, duplicate listeners on re-render | `useEffect` with cleanup, or register via `useKeyboardActions` |
| `event.key === 'a'` without input guard | Types 'a' in search field triggers Accept | Always check `shouldSuppressHotkey(event)` |
| Storing focus element as state (`useState<HTMLElement>`) | Causes re-render on every focus change | Use `useRef<HTMLElement>` |
| `element.focus()` without `preventScroll` | Page jumps when focusing off-screen finding | `element.focus({ preventScroll: true })` + `scrollIntoView({ block: 'nearest' })` |
| `setTimeout` for auto-advance without cleanup | Orphaned timer fires after unmount | `useRef` for timer ID, clear in `useEffect` cleanup |
| `aria-live` region with frequent updates | Screen reader overwhelmed | Debounce announcements (500ms for score, immediate for actions) |
| Inline `onKeyDown` on every row | 300+ event listeners, performance hit | Single `onKeyDown` on grid container + `event.target` delegation |
| `tabIndex={0}` on every finding row | Tab traverses 300+ items | `tabIndex={0}` only on grid container, use `aria-activedescendant` for virtual focus |
| Prop sync for `selectedId` (`if (prop !== prev) setState`) | React 19 anti-pattern (Guardrail #24) | Read from Zustand store directly, no prop drilling |

### Guardrails Checklist (Pre-Implementation)

- [ ] Every `addEventListener` in `useEffect` has matching `removeEventListener` in cleanup
- [ ] Single-key hotkeys (A/R/F/J/K) check `shouldSuppressHotkey` before firing
- [ ] `Ctrl+` combos do NOT check input guard (Ctrl+Z should work everywhere — but we handle it ourselves, not pass to browser, in review context)
- [ ] Scope stack is managed in Zustand (not component state) for cross-component access
- [ ] Auto-advance timer ref is cleared on unmount and on file change
- [ ] `aria-activedescendant` value matches an existing DOM element `id`
- [ ] Live region `textContent` is cleared before setting new value (triggers re-announcement)
- [ ] Focus restore uses `requestAnimationFrame` to avoid race with DOM updates
- [ ] Grid container has `role="grid"` and `aria-label`
- [ ] Every finding row has `role="row"` and unique `id`
- [ ] No `console.log` in keyboard handlers (use structured logger if needed)
- [ ] Tests cover: registration, deregistration, scope isolation, input guard, conflict detection, auto-advance, Esc hierarchy, focus restore

---

## Appendix A: Event Lifecycle Diagram

```
User presses 'A'
│
├─ 1. Browser dispatches KeyboardEvent on focused element
│     (grid container, via aria-activedescendant)
│
├─ 2. useKeyboardActions global listener fires
│     ├─ Parse key: { key: 'a', modifiers: [], raw: 'a' }
│     ├─ Check input guard: target is <div role="grid"> → NOT suppressed
│     ├─ Check scope: activeScope = 'review'
│     ├─ Lookup binding: 'review:a' → found (Accept handler)
│     ├─ Call event.preventDefault()
│     └─ Call handler(event)
│
├─ 3. Accept handler executes
│     ├─ Get selectedId from useReviewStore
│     ├─ Call Server Action: updateFindingStatus(selectedId, 'accepted')
│     ├─ Optimistic update: store.setFinding(id, { ...finding, status: 'accepted' })
│     └─ Trigger auto-advance
│
├─ 4. useFocusManagement.autoAdvance(selectedId)
│     ├─ Search forward for next finding where status === 'pending'
│     ├─ Set store.setSelectedFinding(nextPendingId)
│     ├─ Schedule focus update after 200ms
│     └─ scrollToFinding(nextPendingId)
│
├─ 5. announce('Finding 14 accepted. 3 findings remaining.', 'assertive')
│     └─ Screen reader announces
│
└─ 6. Toast: "Finding #14 accepted" (auto-dismiss 3s)
```

---

## Appendix B: Browser Compatibility Notes

| Feature | Chrome 120+ | Firefox 120+ | Safari 17+ | Notes |
|---------|------------|-------------|-----------|-------|
| `KeyboardEvent.key` | Yes | Yes | Yes | Standard, no polyfill needed |
| `:focus-visible` | Yes | Yes | Yes | Supported since 2022 |
| `aria-activedescendant` | Yes | Yes | Yes | Screen reader support varies slightly |
| `scrollIntoView({ block: 'nearest' })` | Yes | Yes | Yes | Standard |
| `event.composedPath()` | Yes | Yes | Yes | Needed for Shadow DOM edge case (unlikely) |
| IME composition events | Varies | Varies | Varies | Must check `event.isComposing` for CJK/Thai input |

**CJK/Thai IME Note:** When typing Thai/CJK text in search fields, IME fires `keydown` events with `event.isComposing = true`. The input guard should check this:

```typescript
if (event.isComposing) return // Let IME handle it
```

This prevents hotkeys from firing mid-composition (e.g., user types Thai character that starts with 'n' key, which would otherwise trigger the Note hotkey).

---

## Appendix C: File Locations Summary

| File | Purpose | Story |
|------|---------|-------|
| `src/features/review/hooks/use-keyboard-actions.ts` | Hotkey registration, scope, conflict detection | 4.0 |
| `src/features/review/hooks/use-keyboard-actions.test.ts` | Unit tests | 4.0 |
| `src/features/review/hooks/use-focus-management.ts` | Focus trap, auto-advance, Esc hierarchy | 4.0 |
| `src/features/review/hooks/use-focus-management.test.ts` | Unit tests | 4.0 |
| `src/features/review/utils/key-normalizer.ts` | Pure function: key string normalization | 4.0 |
| `src/features/review/utils/key-normalizer.test.ts` | Unit tests for normalization edge cases | 4.0 |
| `src/features/review/utils/screen-reader-announce.ts` | `announce()` utility + live region element | 4.0 |
| `src/features/review/components/KeyboardShortcutsDialog.tsx` | Ctrl+? cheat sheet modal | 4.0 |
| `src/features/review/data/hotkey-categories.ts` | Static hotkey data for cheat sheet | 4.0 |
| `src/styles/tokens.css` | New focus/state tokens | 4.0 |
| `src/stores/keyboard.store.ts` | Existing (keep, deprecate in Phase 4) | 1.x |
| `e2e/review-keyboard.spec.ts` | E2E keyboard/focus tests | 4.1b |
