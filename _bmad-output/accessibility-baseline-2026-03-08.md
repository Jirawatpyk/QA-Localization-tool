# Accessibility Baseline Audit -- 2026-03-08

## Summary

- **Pages audited:** 8 (Dashboard, Admin, Taxonomy, AI Usage, Upload, Batches, Batch Detail, Review)
- **Components audited:** 28
- **Critical issues:** 5
- **Major issues:** 14
- **Minor issues:** 11

---

## Findings by WCAG Criterion

### SC 1.4.1 Use of Color

Color is used as the **sole** distinguishing characteristic in several components -- no text label, icon shape, or pattern supplements the color.

| # | Component | File | Issue | Severity | Epic 4 Story |
|---|-----------|------|-------|----------|--------------|
| 1 | AiSpendByProjectTable | `src/features/dashboard/components/AiSpendByProjectTable.tsx` L126 | Budget status indicator is a colored dot (`h-2 w-2 rounded-full`) with color only (green/yellow/red). No text label for the status, no icon shape difference. Screen reader gets no status info. | Critical | E4-Keyboard or standalone a11y fix |
| 2 | BatchSummaryHeader | `src/features/batch/components/BatchSummaryHeader.tsx` L31-37 | "Passed" count uses `text-success`, "Needs Review" uses `text-warning` -- color is the sole differentiator between pass/review metrics. Text labels exist but they share the same structural styling. | Minor | N/A (text labels partially mitigate) |
| 3 | FileStatusCard | `src/features/batch/components/FileStatusCard.tsx` L48-55 | Severity counts use `text-destructive` for Critical, `text-warning` for Major, `text-muted-foreground` for Minor. Color is the only distinction since severity labels are present but the visual hierarchy relies on color. | Minor | N/A (text labels partially mitigate) |
| 4 | ReviewPageClient | `src/features/review/components/ReviewPageClient.tsx` L269-274 | Finding count summary uses `text-severity-critical`, `text-severity-major`, `text-severity-minor` -- color as primary differentiator. Text labels ("Critical:", "Major:", "Minor:") do provide redundant info. | Minor | N/A (text labels partially mitigate) |
| 5 | NotificationDropdown | `src/features/dashboard/components/NotificationDropdown.tsx` L80 | Unread notification indicator is only a colored dot (`bg-primary`, `h-2 w-2 rounded-full`). No `sr-only` text announces "unread". | Major | E4-Notifications |
| 6 | TaxonomyMappingTable | `src/features/taxonomy/components/TaxonomyMappingTable.tsx` L91-95 | Severity badges use only background colors (`bg-severity-critical`, `bg-severity-major`, `bg-severity-minor`) with white text. The severity word is displayed so text is redundant -- acceptable. | Minor | N/A |

### SC 1.4.3 Contrast (Minimum)

| # | Component | File | Issue | Severity | Epic 4 Story |
|---|-----------|------|-------|----------|--------------|
| 7 | tokens.css | `src/styles/tokens.css` L32-33 | `--color-severity-major: #f59e0b` (amber) and `--color-severity-minor: #3b82f6` (blue) are used as text colors on white backgrounds in ReviewPageClient and FindingListItem. Amber `#f59e0b` on white has contrast ratio ~2.9:1 (fails AA 4.5:1 for normal text). | Critical | E4-Design Tokens |
| 8 | tokens.css | `src/styles/tokens.css` L19 | `--color-success: #10b981` used as text color in BatchSummaryHeader (`text-success`). Green `#10b981` on white has contrast ratio ~3.4:1 (fails AA 4.5:1). | Major | E4-Design Tokens |
| 9 | tokens.css | `src/styles/tokens.css` L37-38 | `--color-status-pass: #10b981` and `--color-status-pending: #f59e0b` used in ScoreBadge as text colors on light tinted backgrounds. Both likely fail AA. | Major | E4-Design Tokens |
| 10 | ConfidenceBadge | `src/features/review/components/ConfidenceBadge.tsx` L23 | `text-warning` (amber #f59e0b) on `bg-warning/10` (very light amber) -- contrast may be borderline. Needs verification with actual computed values. | Major | E4-Design Tokens |

### SC 1.4.11 Non-text Contrast

| # | Component | File | Issue | Severity | Epic 4 Story |
|---|-----------|------|-------|----------|--------------|
| 11 | ReviewProgress | `src/features/review/components/ReviewProgress.tsx` L82 | Pending step indicator is a hollow circle (`border-2 border-muted-foreground/30`). At 30% opacity, this may fail the 3:1 non-text contrast requirement. | Major | E4-Review Panel |
| 12 | Custom buttons (ReviewPageClient) | `src/features/review/components/ReviewPageClient.tsx` L223-242 | Approve and Retry buttons are raw `<button>` elements without explicit focus ring styling -- they inherit browser defaults only via `outline-none` from parent styles (no `focus-visible` ring). | Major | E4-Review Panel |

### SC 2.1.1 Keyboard

| # | Component | File | Issue | Severity | Epic 4 Story |
|---|-----------|------|-------|----------|--------------|
| 13 | FindingListItem | `src/features/review/components/FindingListItem.tsx` L91-96 | The outer `<div>` is not focusable. No `tabIndex`, no `role`. The expand/collapse button (L153-161) is keyboard accessible, but the finding item itself cannot be navigated to via Tab. **Critical for Epic 4 keyboard-driven review.** | Critical | E4-Keyboard Nav |
| 14 | FindingListItem | `src/features/review/components/FindingListItem.tsx` L91 | No keyboard shortcut to select/accept/reject a finding from the list. Store has `selectedId` and `selectionMode` but no keyboard handler wires them. | Critical | E4-Keyboard Nav |
| 15 | ReviewPageClient | `src/features/review/components/ReviewPageClient.tsx` L278 | Finding list (`<div data-testid="finding-list">`) has no `role="list"` or `role="listbox"`. No keyboard navigation (arrow keys) between findings. | Critical | E4-Keyboard Nav |
| 16 | AiSpendByProjectTable | `src/features/dashboard/components/AiSpendByProjectTable.tsx` L87-100 | Sortable column headers use `<th>` with `onClick` but no `tabIndex`, `role="button"`, or `onKeyDown`. Cannot sort via keyboard. | Major | E4 or standalone fix |
| 17 | ModelPinningSettings | `src/features/pipeline/components/ModelPinningSettings.tsx` L96-108 | Custom listbox options (`role="option"`) use `onClick` only -- no `onKeyDown` handler. Cannot navigate or select options via keyboard (Arrow keys, Enter). | Major | E4-Admin settings |
| 18 | FileHistoryTable | `src/features/batch/components/FileHistoryTable.tsx` L141-149 | Pagination buttons are keyboard-accessible (native `<button>`) but have no `aria-current="page"` on the active page or `aria-label` describing page numbers. | Minor | Standalone fix |

### SC 2.4.3 Focus Order

| # | Component | File | Issue | Severity | Epic 4 Story |
|---|-----------|------|-------|----------|--------------|
| 19 | ReviewPageClient | `src/features/review/components/ReviewPageClient.tsx` | Focus order flows: header buttons -> findings list. But findings list items are not focusable (see #13), so tab skips to expand/collapse buttons deep inside items, breaking logical order. | Major | E4-Keyboard Nav |
| 20 | ProcessingModeDialog | `src/features/pipeline/components/ProcessingModeDialog.tsx` | Dialog uses Radix Dialog which handles focus trap correctly. ModeCard inside has `tabIndex={0}` which is correct. Focus order within dialog is logical. | N/A (OK) | -- |

### SC 2.4.7 Focus Visible

| # | Component | File | Issue | Severity | Epic 4 Story |
|---|-----------|------|-------|----------|--------------|
| 21 | Button (shadcn) | `src/components/ui/button.tsx` L8 | Has `outline-none` **but** also has `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`. This is **correct** -- removes default outline and replaces with custom ring. | N/A (OK) | -- |
| 22 | Input (shadcn) | `src/components/ui/input.tsx` L11-12 | Has `outline-none` but compensates with `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`. **Correct.** | N/A (OK) | -- |
| 23 | ReviewPageClient approve/retry buttons | `src/features/review/components/ReviewPageClient.tsx` L223-242 | Raw `<button>` elements with no focus indicator styling at all. No `focus-visible` classes. Will show only browser default focus, which may be insufficient. | Major | E4-Review Panel |
| 24 | FileHistoryTable filter buttons | `src/features/batch/components/FileHistoryTable.tsx` L63-78 | Raw `<button>` with no explicit focus styling. Browser defaults only. | Minor | Standalone fix |
| 25 | AiUsageDashboard period buttons | `src/features/dashboard/components/AiUsageDashboard.tsx` L83-95 | Raw `<button>` with `rounded px-3 py-1 text-sm` but no focus-visible styling. | Minor | Standalone fix |
| 26 | AiSpendTrendChart toggle button | `src/features/dashboard/components/AiSpendTrendChart.tsx` L27-35 | Raw `<button>` with no focus-visible styling. | Minor | Standalone fix |

### SC 3.1.2 Language of Parts

| # | Component | File | Issue | Severity | Epic 4 Story |
|---|-----------|------|-------|----------|--------------|
| 27 | FindingListItem | `src/features/review/components/FindingListItem.tsx` L170-177 | Source and target text excerpts are displayed without `lang` attribute. These contain multilingual content (Thai, CJK, etc.) that screen readers would mispronounce without proper `lang` tagging. | Major | E4-Review Panel |
| 28 | ReviewPageClient | `src/features/review/components/ReviewPageClient.tsx` | No `lang` attribute on any text container. The page displays localization content (source/target) in various languages. | Major | E4-Review Panel |
| 29 | Root layout | `src/app/layout.tsx` L33 | Root `<html lang="en">` is set. **Correct** for the app chrome, but individual source/target segments need `lang` overrides for their specific languages. | N/A (partial) | -- |

### SC 4.1.2 Name, Role, Value

| # | Component | File | Issue | Severity | Epic 4 Story |
|---|-----------|------|-------|----------|--------------|
| 30 | ReviewPageClient finding list | `src/features/review/components/ReviewPageClient.tsx` L278 | `<div data-testid="finding-list">` has no semantic role. Should be `role="list"` or use `<ul>`. Individual items should be `role="listitem"` or `<li>`. | Major | E4-Keyboard Nav |
| 31 | FindingListItem severity badge | `src/features/review/components/FindingListItem.tsx` L99-103 | Severity badge is a `<span>` with no `role` or `aria-label`. The text "critical"/"major"/"minor" is visible so it's partially accessible, but lacks semantic role for screen readers. | Minor | E4-Review Panel |
| 32 | ScoreBadge | `src/features/batch/components/ScoreBadge.tsx` L102-113 | At `sm` size, uses `title` + `aria-label` for state label (L106). At `md`/`lg`, renders label visually. `aria-label` on sm size is **good**. But the overall badge has no `role` attribute. | Minor | E4-Review Panel |
| 33 | LayerBadge | `src/features/review/components/LayerBadge.tsx` L17-23 | Purely informational `<span>` with text "Rule"/"AI". No `role` needed since text is visible. **Acceptable.** | N/A (OK) | -- |
| 34 | ReviewProgress | `src/features/review/components/ReviewProgress.tsx` L96-118 | Progress indicator uses `data-testid` and `data-completed` but no ARIA attributes to convey which steps are complete. The visual-only icons (checkmark, spinner, empty circle) have `aria-hidden="true"` with `sr-only` text -- **this is correct**. | N/A (OK) | -- |
| 35 | AiBudgetCard | `src/features/pipeline/components/AiBudgetCard.tsx` L117-123 | Progress bar has `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`. **Correct.** | N/A (OK) | -- |
| 36 | AiBudgetCard | `src/features/pipeline/components/AiBudgetCard.tsx` L145 | Threshold input has `aria-label="Alert threshold percentage"`. **Correct.** | N/A (OK) | -- |
| 37 | ModeCard | `src/features/pipeline/components/ModeCard.tsx` L26-29 | Has `role="radio"`, `aria-checked`, `tabIndex={0}`, keyboard handler for Enter/Space. **Correct.** But missing `aria-label` -- relies on inner text content which is acceptable. | N/A (OK) | -- |
| 38 | FileUploadZone | `src/features/upload/components/FileUploadZone.tsx` L88-93 | Has `role="button"`, `tabIndex={0}`, `aria-label`, keyboard Enter/Space handler. **Correct.** | N/A (OK) | -- |
| 39 | ModelPinningSettings | `src/features/pipeline/components/ModelPinningSettings.tsx` L80-93 | Button has `aria-label` and `aria-expanded`. Listbox has `role="listbox"`. Options have `role="option"` and `aria-selected`. **Correct structure** but missing keyboard navigation (see #17). | Minor | E4-Admin settings |
| 40 | FileHistoryTable filter group | `src/features/batch/components/FileHistoryTable.tsx` L61 | Filter buttons use `role="group"` on the container. **Correct.** But no `aria-label` on the group. | Minor | Standalone fix |
| 41 | Pagination | `src/features/batch/components/FileHistoryTable.tsx` L134 | `<nav aria-label="pagination">` -- **Correct.** | N/A (OK) | -- |

### aria-live Regions

| # | Component | File | Issue | Severity | Epic 4 Story |
|---|-----------|------|-------|----------|--------------|
| 42 | ReviewPageClient | `src/features/review/components/ReviewPageClient.tsx` | **No `aria-live` region** for score updates, finding count changes, or status transitions. When score recalculates, partial warnings appear, or new findings arrive via Realtime, screen readers receive no announcement. | Major | E4-Review Panel |
| 43 | UploadProgressList | `src/features/upload/components/UploadProgressList.tsx` L63,100,111,121 | Uses `aria-live="polite"` on progress status text. **Correct.** | N/A (OK) | -- |
| 44 | BatchSummaryView | `src/features/batch/components/BatchSummaryView.tsx` | No `aria-live` for dynamically loaded content. | Minor | Standalone fix |

---

## Existing Accessibility Infrastructure

### What is already in place

1. **Keyboard store** (`src/stores/keyboard.store.ts`): Basic Zustand store with `registerShortcut` / `unregisterShortcut` / `clearAll`. Stores a `Map<string, () => void>` of active shortcuts. **No global keyboard listener is wired** -- the store exists but nothing dispatches key events to it.

2. **UI store** (`src/stores/ui.store.ts`): Manages `sidebarOpen` and `detailPanelOpen` state. No keyboard shortcuts registered.

3. **Review store** (`src/features/review/stores/review.store.ts`): Has `selectedId`, `selectionMode` (single/bulk), `setSelectedFinding()`, `toggleSelection()`, `filterState`. **All the data-side infrastructure for keyboard selection exists** but no keyboard event handlers connect to it.

4. **Reduced motion support** (`src/hooks/useReducedMotion.ts`): Respects `prefers-reduced-motion: reduce`. Used by `ScoreBadge` and `FindingListItem` to disable animations. **Correct.**

5. **shadcn/ui base components**: Button, Input, Textarea, Checkbox, RadioGroup, Select, Dialog, AlertDialog, Tooltip all use `focus-visible` ring patterns correctly. Radix primitives handle focus trap in dialogs.

6. **Existing ARIA on components**:
   - `ModeCard`: `role="radio"`, `aria-checked`, keyboard handler
   - `FileUploadZone`: `role="button"`, `aria-label`, keyboard handler
   - `AiBudgetCard`: `role="progressbar"`, proper `aria-value*`
   - `ModelPinningSettings`: `aria-label`, `aria-expanded`, `role="listbox"`, `role="option"`
   - `ConfidenceBadge`: `sr-only` text for warning icon
   - `ReviewProgress`: `aria-hidden` on decorative icons, `sr-only` for status text
   - `NotificationDropdown`: `aria-label="Notifications"`
   - `AiSpendByProjectTable`: `aria-sort` on sortable columns
   - `FindingListItem`: `aria-expanded`, `aria-label` on expand/collapse button and fallback badge

7. **Color tokens** (`src/styles/tokens.css`): Severity tokens (`severity-critical`, `severity-major`, `severity-minor`), status tokens (`status-pass`, `status-pending`, `status-fail`, `status-analyzing`, etc.) are defined. **Missing**: focus ring tokens, skip-link tokens, a11y-specific high-contrast alternatives.

### What is missing for Epic 4

1. **Global keyboard event dispatcher** -- keyboard store exists but is not connected to any `useEffect` with `document.addEventListener('keydown', ...)`.

2. **Finding list keyboard navigation** -- no arrow key navigation between findings, no `role="listbox"`, no `tabIndex` on items, no `aria-activedescendant`.

3. **Keyboard shortcuts for review actions** -- accept (a), reject (r), next (j/down), previous (k/up), expand (e/enter) -- none exist.

4. **Focus management on finding selection** -- `setSelectedFinding(id)` in the store does not trigger `element.focus()` or `scrollIntoView()`.

5. **`aria-live` regions** -- no live region for score updates, finding changes, or status transitions on the review page.

6. **`lang` attribute on source/target text** -- localized content displayed without language tagging.

7. **Skip navigation link** -- no skip link to jump past sidebar/header to main content.

8. **Keyboard shortcut help dialog** -- no `?` key to show available shortcuts.

9. **Focus ring on custom buttons** -- approve/retry/filter/period buttons lack `focus-visible` styling.

10. **Contrast-safe severity tokens** -- several color tokens fail WCAG AA contrast on white backgrounds.

---

## Recommendations for Epic 4

### Priority 1: Critical (Block keyboard-driven review workflow)

| Issue | Action | Suggested Story |
|-------|--------|----------------|
| #13, #14, #15: Finding list not keyboard navigable | Add `role="listbox"` to list container, `role="option"` + `tabIndex` to items, implement arrow key navigation, wire to `selectedId` in review store | E4-S1: Keyboard Navigation Core |
| #42: No `aria-live` for dynamic updates | Add `aria-live="polite"` region for score changes, finding count updates, status transitions | E4-S1 or E4-S2 |
| #7: Amber/green text contrast failures | Replace `#f59e0b` (severity-major) and `#10b981` (success/pass) with WCAG AA-compliant alternatives. Recommended: `#b45309` for amber, `#047857` for green. | E4-S0: Design Token Contrast Fix (pre-req) |

### Priority 2: Major (Significant a11y gaps)

| Issue | Action | Suggested Story |
|-------|--------|----------------|
| #12, #23: Approve/Retry buttons no focus indicator | Add `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` to raw buttons, or use `<Button>` component | E4 Review Panel story |
| #5: Notification unread dot no sr-only text | Add `<span className="sr-only">unread</span>` inside the dot | Standalone fix (quick) |
| #17: ModelPinning listbox no keyboard nav | Add `onKeyDown` with ArrowUp/ArrowDown/Enter/Escape on options | E4 Admin settings or standalone |
| #16: Sortable table headers not keyboard accessible | Add `tabIndex={0}`, `role="button"`, `onKeyDown` for Enter/Space | Standalone fix |
| #27, #28: No `lang` on source/target text | Pass `sourceLang`/`targetLang` to FindingListItem, apply `lang` attribute to excerpt containers | E4 Review Panel story |
| #1: Budget indicator dot is color-only | Add text label or `aria-label` with status ("OK", "Warning", "Exceeded") | Standalone fix |

### Priority 3: Minor (Polish, best practices)

| Issue | Action | Suggested Story |
|-------|--------|----------------|
| #24, #25, #26: Various buttons missing focus-visible | Standardize all interactive elements to use `<Button>` or add focus-visible classes | Sweep in any Epic 4 story |
| #18: Pagination missing aria-current | Add `aria-current="page"` to active page button, `aria-label="Page N"` to all | Standalone fix |
| #40: Filter button group missing aria-label | Add `aria-label="Filter file history"` to the `role="group"` container | Standalone fix |
| Skip navigation link | Add `<a href="#main-content" className="sr-only focus:not-sr-only">Skip to main content</a>` | E4 layout story |
| Keyboard shortcut help | Implement `?` key to open shortcut cheat sheet dialog | E4-Keyboard Nav advanced story |

### Suggested Epic 4 Story Sequence

1. **E4-S0: Design Token Contrast Fix** -- Fix color tokens to meet AA contrast. This is a prerequisite that unblocks all visual a11y work.
2. **E4-S1: Keyboard Navigation Core** -- Global keyboard dispatcher, finding list navigation (j/k/arrows), `aria-live` regions, focus management.
3. **E4-S2: Review Actions via Keyboard** -- Accept (a), reject (r), expand (e), bulk select (x), shortcut help (?).
4. **E4-S3: Focus Indicators & ARIA Sweep** -- Standardize all buttons to use `<Button>`, add missing `aria-label`, `lang` attributes, skip link.
5. **E4-S4: Screen Reader Testing & Polish** -- Verify with NVDA/VoiceOver, fix any discovered issues.

---

## Appendix: Components Confirmed Accessible

These components were audited and found to meet baseline a11y requirements:

- `Button` (shadcn) -- focus-visible ring
- `Input` (shadcn) -- focus-visible ring, aria-invalid support
- `Dialog` (shadcn/Radix) -- focus trap, close button with sr-only label
- `AlertDialog` (shadcn/Radix) -- focus trap, proper title/description
- `Select` (shadcn/Radix) -- keyboard nav built in
- `ModeCard` -- role, aria-checked, keyboard handler
- `FileUploadZone` -- role, aria-label, keyboard handler
- `AiBudgetCard` -- progressbar role, proper aria attributes
- `ReviewProgress` -- sr-only text for icon-only states
- `ConfidenceBadge` -- sr-only for warning icon
- `AddMappingDialog` -- proper label-input associations, DialogDescription
- `UserManagement form` -- Label/htmlFor associations
- `Pagination nav` -- aria-label on nav element
- `useReducedMotion` hook -- respects prefers-reduced-motion
