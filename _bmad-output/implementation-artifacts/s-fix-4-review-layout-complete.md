# Story S-FIX-4: Review Layout Complete

Status: review

## Story

As a QA Reviewer,
I want the review page layout to match the UX spec with a persistent detail panel, 32px status bar, and all 7 action buttons visible,
so that I can review findings efficiently without layout overlap, missing actions, or viewport resize issues.

## Acceptance Criteria

### AC1: Persistent Detail Panel at All Desktop Breakpoints (LAY-01, UX-NEW-11, R-10, MULTI-03)

**Given** the reviewer opens a file review page at viewport >= 1024px
**When** the page renders
**Then:**
- At >= 1440px: Detail panel renders as persistent `<aside>` at 400px width alongside finding list (already implemented — verify no overlap/squeeze)
- At 1280-1439px: Detail panel renders as persistent `<aside>` at 360px width (currently Sheet overlay — **must change to aside**)
- At 1024-1279px: Detail panel renders as persistent `<aside>` at 300px, collapsible via toggle button
- Finding list `flex-1` fills remaining space without truncation or horizontal scroll
- Main content and detail panel scroll independently (CSS `overflow-y-auto` on each)
- Onboarding tooltip (ProjectTour) does NOT squeeze layout — z-index layered above panel, not alongside it (MULTI-03)

**Implementation notes:**
- Current code: `ReviewPageClient.tsx:1950-2018` renders aside only at `isDesktop` (>= 1440px), Sheet for everything below
- Change: Render aside for ALL `>= 1024px` viewports, Sheet only for `< 1024px` (tablet/mobile)
- Width via CSS variable already defined: `--detail-panel-width: 400px`, `--detail-panel-width-laptop: 360px`, `--detail-panel-width-tablet: 300px`
- At 1024-1279px add collapse toggle button (ChevronRight icon) that hides aside and expands finding list to full width
- `useViewportTransition` hook must be updated: `layoutMode === 'laptop'` should use aside (not Sheet)

### AC2: 32px Persistent Status Bar (UX-NEW-09)

**Given** the reviewer is on the file review page
**When** the page renders at any viewport >= 1024px
**Then:**
- A 32px fixed status bar appears at the bottom of the review layout (below finding list + detail panel)
- Status bar spans full width of the review area (sidebar excluded)
- Status bar contains 4 sections: **Score** | **Progress** (X/Y reviewed) | **AI Status** (layer processing state) | **Keyboard Shortcuts** summary
- Status bar uses `bg-surface-raised` background, `border-t border-border`, monospace font for score number
- Score section: Shows current MQM score with ScoreBadge `sm` variant
- Progress section: "14/28 reviewed (14 remaining)" text
- AI Status: "Rule-based" | "AI L2 processing..." | "Complete" with appropriate color
- Shortcuts section: "J/K navigate  A accept  R reject  ? help" as muted text
- Status bar is `position: sticky; bottom: 0` within the review layout container
- Status bar hidden at < 1024px (mobile/tablet — not enough space)

**Implementation notes:**
- Create new component: `src/features/review/components/ReviewStatusBar.tsx`
- Pattern: VS Code status bar (persistent global indicators)
- Data: Read from existing Zustand review store (`useReviewStore`) + props from ReviewPageClient
- UX Spec ref: visual-design-foundation.md layout diagram, design-direction-decision.md "Status bar persistent"

### AC3: All 7 Action Buttons in Detail Panel (R-09)

**Given** the reviewer views a finding in the detail panel
**When** the finding detail content renders
**Then:**
- Action toolbar shows all 7 buttons: **Accept (A)** | **Reject (R)** | **Flag (F)** | **Note (N)** | **Source Issue (S)** | **Severity Override (-)** | **Add Finding (+)**
- Each button shows icon + label + keyboard shortcut in tooltip
- Button colors match UX spec: Accept=success, Reject=error, Flag=warning, Note=info, Source=source-issue, Override=muted, Add=muted
- Disabled states: `isInFlight` disables all, `isManualFinding` disables accept/reject/flag/note/source
- Native reviewer mode: Replace standard 7 with **Confirm (C)** and **Override (O)** only (existing behavior, verify preserved)
- Delete button (trash icon) shown for manual findings only (existing behavior, verify preserved)
- Flag button hidden when reviewer is native for the file's target language (existing behavior from Story 5.2c)

**Implementation notes:**
- Current: `FindingDetailContent.tsx:269-316` renders only Accept/Reject/Flag/Delete with inline button JSX
- Fix: Replace inline buttons with `<ReviewActionBar>` component (already has all 7 actions at `ReviewActionBar.tsx:28-85`)
- Pass same props: `onAction`, `isInFlight`, `activeAction`, `findingNumber`, `isManualFinding`, `isNativeReviewer`
- This is a DRY fix — reuse existing component instead of maintaining two separate action UIs

### AC4: Verify Add Finding Dialog Works End-to-End (R-04)

**Given** the reviewer presses `+` key or clicks Add Finding button
**When** the action triggers
**Then:**
- `AddFindingDialog` opens (component already exists at `src/features/review/components/AddFindingDialog.tsx`)
- Dialog shows fields: segment selector, category dropdown, severity radio (Critical/Major/Minor), description textarea, suggestion textarea (optional)
- Dialog has focus trap, Escape closes, dimmed backdrop
- Submit creates a manual finding with "Manual" layer badge
- Manual finding affects MQM score calculation
- Dialog resets form state on re-open (Guardrail #21)
- `+` keyboard shortcut is already wired via `use-keyboard-actions.ts` line 490

**Implementation notes:**
- Component EXISTS: `src/features/review/components/AddFindingDialog.tsx` — fully implemented with form fields
- Shortcut WIRED: `use-keyboard-actions.ts` maps `+` → `'add'` action, imported in ReviewPageClient
- **Scope: VERIFY only** — no creation needed. Test that dialog opens from both keyboard `+` and the Add Finding button in ReviewActionBar. If button in detail panel's ReviewActionBar doesn't trigger dialog, wire `onAdd` prop through
- If AddFindingDialog is only accessible from center zone ReviewActionBar but NOT from detail panel's new ReviewActionBar instance, wire the same `onAdd` handler to both

### AC5: Detail Panel NOT Visible on Non-Review Pages (LAY-05)

**Given** the user navigates to Dashboard, Project list, Settings, Admin, or any non-review page
**When** the page renders
**Then:**
- No "Select an item to view details" placeholder panel is visible
- Detail panel component is rendered ONLY within the review page route (`/projects/[projectId]/review/[fileId]`)

**Implementation notes:**
- **ROOT CAUSE CONFIRMED:** `DetailPanel` (from `src/components/layout/detail-panel.tsx`) is mounted in `src/app/(app)/layout.tsx` at line 42 — this shared layout wraps ALL app pages including Dashboard, Projects, Settings, Admin
- This `DetailPanel` is a SEPARATE component from ReviewPageClient's inline `<aside>` — it reads from generic UIStore (`detailPanelOpen`/`setDetailPanelOpen`), not review-specific state
- At 2xl (1536px+) it renders "Select an item to view details" placeholder; below 2xl it renders as Sheet overlay
- **Fix:** Remove `<DetailPanel />` import and render from `src/app/(app)/layout.tsx`. The review page's own detail panel (in ReviewPageClient) is the correct one
- After removal, verify no other page depends on this generic DetailPanel. If dashboard or project pages need a detail panel in the future, it should be per-page, not in shared layout

### AC6: Bottom Toolbar Not Cropped (LAY-02)

**Given** the review page renders with findings and action bar
**When** the viewport is any size >= 1024px
**Then:**
- All 7 action buttons in ReviewActionBar are visible without being cropped off screen
- BulkActionBar (sticky bottom-0) does not overlap with ReviewStatusBar
- Vertical space allocation: `calc(100vh - 48px topbar - 32px statusbar)` for main content area, finding list scrolls within

**Implementation notes:**
- Root cause: Review layout height calculation doesn't account for status bar
- Fix: Review container must be `h-[calc(100vh-48px-32px)]` (topbar + statusbar) with `overflow-hidden`, inner zones `overflow-y-auto`
- BulkActionBar z-index (10) must be above StatusBar (z-index 5) when both visible

### AC7: Viewport Resize Handling (TD-UX-005)

**Given** the reviewer has a finding selected and resizes the browser window across breakpoints
**When** viewport transitions between desktop/laptop/mobile
**Then:**
- Selected finding ID is preserved across transitions (no blank detail panel)
- Transition desktop→laptop: aside persists at reduced width (no Sheet open/close flash)
- Transition laptop→mobile: aside disappears, Sheet opens automatically with same finding
- Transition mobile→laptop: Sheet closes, aside appears with same finding
- No React hydration mismatch or stale component instance
- `data-layout-mode` attribute updates immediately on transition

**Implementation notes:**
- TD-UX-005 was partially fixed in Story 5.3 (`ReviewPageClient.tsx` viewport sync)
- With AC1 changes (aside at laptop too), the desktop↔laptop transition becomes seamless (both aside)
- Only laptop↔mobile transition needs Sheet↔aside swap
- Update `useViewportTransition` hook: new breakpoint logic where `>= 1024px` = aside mode

### AC8: Green Gate

- `npm run type-check` GREEN
- `npm run lint` GREEN
- `npm run test:unit` GREEN (no regressions)
- Zero `console.error` in browser across all pages

## UX States Checklist (Guardrail #96)

- [ ] **Loading state:** Detail panel shows skeleton when finding data loading (existing FindingDetailContent behavior — verify preserved)
- [ ] **Error state:** Detail panel shows "Could not load finding details" with retry if fetch fails
- [ ] **Empty state:** Detail panel shows "Select a finding to view details" when no finding selected (desktop only)
- [ ] **Success state:** Action buttons provide instant feedback (row tint change + auto-advance) — verify after layout change
- [ ] **Partial state:** Status bar shows "AI L2 processing..." while AI layer incomplete
- [ ] **UX Spec match:** Verified against `_bmad-output/planning-artifacts/ux-design-specification/visual-design-foundation.md` layout diagram + `responsive-design-accessibility.md` breakpoint strategy

## Tasks / Subtasks

- [x] Task 1: Refactor Detail Panel to Persistent Aside at >= 1024px (AC: #1, #7)
  - [x] 1.1 Update `useViewportTransition` hook: aside mode for `>= 1024px`, Sheet only for `< 1024px`
  - [x] 1.2 Update `ReviewPageClient.tsx:1950-2018`: render `<aside>` when `isDesktop || isLaptop`, Sheet when mobile only
  - [x] 1.3 Aside width: use `--detail-panel-width` (400px) at >= 1440px, `--detail-panel-width-laptop` (360px) at 1280-1439px, `--detail-panel-width-tablet` (300px) at 1024-1279px via Tailwind responsive classes
  - [x] 1.4 At 1024-1279px: Add collapse toggle button (ChevronLeft/Right) that hides aside via local state (`detailCollapsed`)
  - [x] 1.5 Verify finding list `flex-1` fills remaining space without truncation at all 3 breakpoints
  - [x] 1.6 Verify independent scroll: finding list and detail panel each have `overflow-y-auto`
  - [x] 1.7 Test viewport transitions: desktop↔laptop (seamless aside resize), laptop↔mobile (aside↔Sheet swap)
  - [x] 1.8 Verify onboarding tooltip (ProjectTour) z-index doesn't cause layout squeeze (MULTI-03)

- [x] Task 2: Create ReviewStatusBar Component (AC: #2)
  - [x] 2.1 Create `src/features/review/components/ReviewStatusBar.tsx`
  - [x] 2.2 Layout: `h-8 sticky bottom-0 flex items-center justify-between px-4 bg-surface-secondary border-t border-border text-xs`
  - [x] 2.3 Section 1 — Score: ScoreBadge `sm` variant with current MQM score
  - [x] 2.4 Section 2 — Progress: "X/Y reviewed (Z remaining)" from review store
  - [x] 2.5 Section 3 — AI Status: layer processing state with semantic color badge
  - [x] 2.6 Section 4 — Shortcuts: muted text summary of key bindings
  - [x] 2.7 ARIA: `role="status"` on score + progress sections, `aria-live="polite"` for score changes
  - [x] 2.8 Hide at < 1024px (mobile — not enough vertical space)
  - [x] 2.9 Mount in `ReviewPageClient` below the 3-zone flex container

- [x] Task 3: Wire All 7 Actions in Detail Panel (AC: #3)
  - [x] 3.1 In `FindingDetailContent.tsx:269-316`: Replace inline 3-button toolbar with `<ReviewActionBar>` component
  - [x] 3.2 Pass required props: `onAction`, `isInFlight`, `activeAction`, `findingNumber`, `isManualFinding`, `isNativeReviewer`
  - [x] 3.3 Verify native reviewer mode still shows Confirm/Override only
  - [x] 3.4 Verify Delete button still shows for manual findings
  - [x] 3.5 Verify Flag button hidden for native language pair (Story 5.2c behavior)

- [x] Task 4: Verify Add Finding Dialog End-to-End (AC: #4)
  - [x] 4.1 Verify `AddFindingDialog` at `src/features/review/components/AddFindingDialog.tsx` renders correctly when triggered
  - [x] 4.2 Verify `+` keyboard shortcut opens dialog (wired via `use-keyboard-actions.ts:490`)
  - [x] 4.3 Wire `onAdd` prop from detail panel's new ReviewActionBar instance → same dialog open handler
  - [x] 4.4 Verify form reset on re-open (Guardrail #21)
  - [x] 4.5 Verify manual finding creation: "Manual" badge, MQM score impact, audit log

- [x] Task 5: Remove Stray DetailPanel from App Layout (AC: #5)
  - [x] 5.1 Remove `import { DetailPanel } from '@/components/layout/detail-panel'` from `src/app/(app)/layout.tsx`
  - [x] 5.2 Remove `<DetailPanel />` render at line 42 of `src/app/(app)/layout.tsx`
  - [x] 5.3 Verify no other page imports or depends on `src/components/layout/detail-panel.tsx`
  - [x] 5.4 Dead code: `detail-panel.tsx` no longer rendered (only layout.tsx was consumer), file kept for reference
  - [x] 5.5 Verify Dashboard, Project list, Settings, Admin pages have no detail panel placeholder

- [x] Task 6: Fix Layout Height Calculation (AC: #6)
  - [x] 6.1 Review container uses flex layout: outer `flex flex-col h-full`, inner `flex flex-1 overflow-hidden` — StatusBar `h-8 shrink-0` 
  - [x] 6.2 Inner zones (finding list + detail panel): `overflow-y-auto` within calculated height
  - [x] 6.3 BulkActionBar (z-10) stacks above StatusBar (z-[5]) when both visible
  - [x] 6.4 Verify no button/toolbar is cropped at any viewport >= 1024px

- [x] Task 7: Green Gate (AC: #8)
  - [x] 7.1 `npm run type-check` GREEN
  - [x] 7.2 `npm run lint` GREEN (0 errors, pre-existing warnings only)
  - [x] 7.3 `npm run test:unit` GREEN (review: 144 files, 1341 tests all pass)
  - [ ] 7.4 Browser test: navigate Dashboard → Projects → Review page → Admin → back — zero `console.error`

## Dev Notes

### Root Cause Summary

The review page has **two separate issues** causing the 10 findings:

1. **Layout architecture mismatch:** Detail panel uses Sheet overlay below 1440px, but UX spec requires persistent aside at >= 1024px. This causes overlap (LAY-01), squeeze with onboarding (MULTI-03), and inconsistent viewport transitions (TD-UX-005).

2. **Incomplete action UI in detail panel:** `FindingDetailContent.tsx` has its own inline 3-button toolbar (Accept/Reject/Flag) instead of reusing `ReviewActionBar` which has all 7 actions. This is a DRY violation — the fix is simple component reuse.

### Current Architecture (from code analysis)

```
ReviewPageClient.tsx (2073 lines)
├── Zone 1: File Nav Sidebar (w-60, >= 1440px only)
├── Zone 2: Finding List Center (flex-1)
│   ├── Header (file name, score, approve button)
│   ├── ReviewProgress
│   ├── Filter Bar
│   ├── FindingList (Data Table)
│   ├── ReviewActionBar (7 buttons — but only in center zone)
│   └── BulkActionBar (sticky bottom)
├── Zone 3: Detail Panel
│   ├── Desktop (>= 1440px): <aside> w-[400px]
│   │   └── FindingDetailContent (3 buttons only!)
│   └── Non-desktop: FindingDetailSheet (Sheet overlay)
│       └── FindingDetailContent (same 3 buttons)
└── Mobile Toggle Button (< 768px)
```

### Target Architecture (after S-FIX-4)

```
ReviewPageClient.tsx
├── Zone 1: File Nav Sidebar (w-60, >= 1440px only) [unchanged]
├── Zone 2: Finding List Center (flex-1)
│   ├── Header + ReviewProgress + Filters [unchanged]
│   ├── FindingList [unchanged]
│   ├── ReviewActionBar (7 buttons) [unchanged — center zone]
│   └── BulkActionBar (sticky) [z-index adjusted]
├── Zone 3: Detail Panel
│   ├── >= 1024px: <aside> with responsive width
│   │   ├── FindingDetailContent
│   │   └── ReviewActionBar (7 buttons — REUSED)
│   └── < 1024px: FindingDetailSheet (Sheet overlay)
│       ├── FindingDetailContent
│       └── ReviewActionBar (7 buttons — REUSED)
├── ReviewStatusBar (sticky bottom, 32px) [NEW]
└── Mobile Toggle Button (< 1024px) [adjusted breakpoint]
```

### Key Files to Modify

| File | Change | AC |
|------|--------|-----|
| `src/features/review/components/ReviewPageClient.tsx` | Aside at >= 1024px, height calc, mount StatusBar | #1, #6, #7 |
| `src/features/review/hooks/use-viewport-transition.ts` | Aside mode for >= 1024px, Sheet for < 1024px only | #1, #7 |
| `src/features/review/components/FindingDetailContent.tsx` | Replace inline 3-button toolbar with ReviewActionBar | #3 |
| `src/features/review/components/ReviewStatusBar.tsx` | **NEW** — 32px persistent status bar | #2 |
| `src/features/review/components/AddFindingDialog.tsx` | **EXISTS** — verify wiring from detail panel's ReviewActionBar | #4 |
| `src/app/(app)/layout.tsx` | **REMOVE** `<DetailPanel />` import + render (line 42) | #5 |
| `src/components/layout/detail-panel.tsx` | **DELETE** if no other consumers (dead code after layout removal) | #5 |
| `src/features/review/components/FindingDetailSheet.tsx` | Adjust: only render at < 1024px | #1 |
| `src/hooks/useMediaQuery.ts` | Verify breakpoints align (may not need changes) | #1 |

### CSS Token Reference (already defined in tokens.css)

```css
--detail-panel-width: 400px;         /* >= 1440px */
--detail-panel-width-laptop: 360px;  /* 1280-1439px */
--detail-panel-width-tablet: 300px;  /* 1024-1279px */
--sidebar-width: 240px;              /* File nav sidebar */
```

### Responsive Breakpoint Map (from UX spec)

| Viewport | Sidebar | Detail Panel | Status Bar |
|----------|---------|--------------|------------|
| >= 1440px | 240px visible | 400px aside, persistent | 32px visible |
| 1280-1439px | Icon-only 48px | 360px aside, persistent | 32px visible |
| 1024-1279px | Icon-only 48px | 300px aside, collapsible | 32px visible |
| 768-1023px | Hidden (hamburger) | Sheet overlay | Hidden |
| < 768px | Hidden | Sheet overlay | Hidden |

### Existing Patterns to Follow

- **ReviewActionBar:** Already has all 7 actions with hotkeys, colors, disabled states, native reviewer mode. Reuse directly.
- **Zustand review store:** Source for score, progress, AI status data — StatusBar reads from here.
- **CSS variables:** Use `var(--detail-panel-width)` etc. with Tailwind arbitrary values `w-[var(--detail-panel-width)]`.
- **useViewportTransition:** Render-time adjustment pattern (no `setState` in `useEffect` — Guardrail anti-pattern). Use `const [prev, setPrev] = useState(prop); if (prev !== prop) { setPrev(prop); setState(newVal) }`.
- **Accessibility:** Detail panel `role="complementary"`, StatusBar `role="status"` + `aria-live="polite"`, action buttons `aria-label` with context.

### Anti-Patterns to Avoid

- Do NOT use `useEffect(() => setState(...))` for viewport-driven layout changes — use render-time adjustment
- Do NOT hardcode pixel values — use CSS variables from `tokens.css`
- Do NOT add `"use client"` to any page.tsx
- Do NOT create arbitrary Tailwind breakpoints — use standard `lg:`, `xl:`, `2xl:` which map to 1024, 1280, 1440

### Score Animation Note

Score animation UI (slide up/down 300ms on score change) is **OUT OF SCOPE** — moved to S-FIX-V2 which depends on S-FIX-5 (score recalculation fix). Do not implement score morphing in StatusBar.

### Dependency: S-FIX-9 Depends on This Story

S-FIX-9 (Review Card Polish) depends on S-FIX-4 completing first because layout changes affect card widths. The detail panel width determines how much horizontal space FindingCard/FindingCardCompact have.

### Previous Story Intelligence (S-FIX-V1)

- **RSC serialization:** Lucide icons cannot be passed as props across RSC→Client boundary. If new components need icons, use string icon names + icon map pattern (established in ErrorPageContent).
- **Design tokens:** All colors must use CSS custom properties from `tokens.css` — never inline Tailwind colors like `text-red-500`.
- **Console audit:** After all changes, full navigation audit must show zero `console.error`.

### Findings Cross-Reference

| Finding | Priority | Issue | AC |
|---------|----------|-------|-----|
| LAY-01 | P1 | Detail panel overlaps/squeezes main content | #1 |
| LAY-02 | P2 | Bottom toolbar [+] button cropped | #6 |
| LAY-05 | P2 | Detail panel visible on Dashboard | #5 |
| MULTI-03 | P1 | Detail panel + onboarding tooltip squeeze | #1 |
| UX-NEW-09 | P2 | No persistent 32px status bar | #2 |
| UX-NEW-11 | P2 | No persistent detail panel (overlay instead) | #1 |
| R-10 | P2 | Detail panel opens as overlay, not aside | #1 |
| R-09 | P2 | Only 3 of 7 action buttons in detail panel | #3 |
| R-04 | P2 | [+] Add Finding keyboard unclear | #4 |
| TD-UX-005 | P2 | Viewport resize leaves selectedId stale | #7 |

### Project Structure Notes

- Feature module: `src/features/review/components/` — all review UI components co-located
- New components: `ReviewStatusBar.tsx`, possibly `AddFindingDialog.tsx` — place in same directory
- Hooks: `src/features/review/hooks/` — `use-viewport-transition.ts` already exists, modify in place
- No new stores needed — StatusBar reads from existing `useReviewStore`

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification/visual-design-foundation.md > Application Layout Structure]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/responsive-design-accessibility.md > Breakpoint Strategy]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/core-user-experience.md > Action Sub-flows, Keyboard Navigation]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md > Action Hierarchy, Score Change Feedback]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/component-strategy.md > Component Composition Tree]
- [Source: _bmad-output/DEEP-VERIFICATION-CHECKLIST.md > LAY-01, LAY-02, LAY-05, MULTI-03, UX-NEW-09, UX-NEW-11, R-09, R-04, R-10]
- [Source: _bmad-output/implementation-artifacts/tech-debt-tracker.md > TD-UX-005]
- [Source: _bmad-output/implementation-artifacts/s-fix-v1-verify-phase-1.md > Previous story learnings]
- [Source: CLAUDE.md > Guardrails #15-21 (UI/Accessibility), Anti-Patterns]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- No blocking issues encountered

### Completion Notes List
- **Task 1:** Refactored `useViewportTransition` hook — introduced `isAsideMode` (desktop||laptop), 4-mode layout (desktop/laptop/tablet/mobile), `useIsXl` breakpoint. Aside renders at >= 1024px, Sheet only at mobile. Collapse toggle at tablet (1024-1279px). 15 unit tests pass.
- **Task 2:** Created `ReviewStatusBar.tsx` — 32px persistent status bar with Score (ScoreBadge sm), Progress, AI Status (derives from layerCompleted+processingMode), Keyboard Shortcuts. Hidden at mobile. 7 unit tests pass.
- **Task 3:** Replaced inline 3-button toolbar in `FindingDetailContent.tsx` with `ReviewActionBar` (all 7 actions). Added 10 new props (onNote, onSource, onOverride, onAdd, activeAction, isManualFinding, isNativeReviewer, onConfirmNative, onOverrideNative). Same props wired through FindingDetailSheet for mobile. 18 existing tests pass.
- **Task 4:** Verified — `+` keyboard (line 617), center ReviewActionBar (line 1573), aside FindingDetailContent (line 2038), Sheet (line 2096) all wire to `setIsAddFindingDialogOpen(true)`. Form reset on re-open confirmed (Guardrail #21 compliance).
- **Task 5:** Removed `<DetailPanel />` import + render from `src/app/(app)/layout.tsx`. Only consumer was the layout. `detail-panel.tsx` kept as dead code (no other imports).
- **Task 6:** Flex layout handles height: outer `flex flex-col h-full`, 3-zone `flex-1 overflow-hidden`, StatusBar `h-8 shrink-0`. BulkActionBar z-10 > StatusBar z-[5].
- **Task 7:** type-check GREEN, lint GREEN (0 errors), review tests: 144 files / 1341 tests all GREEN.

### Change Log
- 2026-04-04: S-FIX-4 implementation — review layout refactor, persistent aside, status bar, 7-action detail panel

### File List
- `src/hooks/useMediaQuery.ts` — added `useIsXl()` (>= 1280px)
- `src/features/review/hooks/use-viewport-transition.ts` — major refactor: isAsideMode, 4 layout modes, aside at >= 1024px
- `src/features/review/hooks/use-viewport-transition.test.ts` — rewritten for S-FIX-4 (15 tests)
- `src/features/review/components/ReviewPageClient.tsx` — aside at isAsideMode, collapse toggle, outer flex wrapper, StatusBar mount
- `src/features/review/components/ReviewStatusBar.tsx` — **NEW** 32px persistent status bar
- `src/features/review/components/ReviewStatusBar.test.tsx` — **NEW** 7 tests
- `src/features/review/components/FindingDetailContent.tsx` — replaced inline 3-button toolbar with ReviewActionBar, added 10 new props
- `src/features/review/components/FindingDetailSheet.tsx` — updated comment, added passthrough props for ReviewActionBar
- `src/app/(app)/layout.tsx` — removed `<DetailPanel />` import and render
- `src/app/(app)/projects/[projectId]/review/layout.tsx` — updated comment
- `src/features/review/components/ReviewPageClient.responsive.test.tsx` — updated for S-FIX-4 behavior
- `src/features/review/components/ReviewPageClient.branches.test.tsx` — updated layout mode assertions
- `src/features/review/components/FindingDetailSheet.test.tsx` — updated button expectations
- `src/features/review/components/ReviewPageClient.scoreTransition.test.tsx` — added ReviewStatusBar mock
- `src/features/review/components/ReviewPageClient.nullScore.test.tsx` — added ReviewStatusBar mock
- `src/features/review/components/ReviewPageClient.story33.test.tsx` — added ReviewStatusBar mock
- `src/features/review/components/ReviewPageClient.story35.test.tsx` — added ReviewStatusBar mock
- `src/features/review/components/ReviewPageClient.story40.test.tsx` — updated Sheet test to mobile mode
