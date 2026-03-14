# Story 4.1d: Responsive Layout — CR R1-R2

**Date:** 2026-03-13
**R1 Result:** 0C / 3H / 5M / 4L
**R2 Result:** 0C / 3H / 5M / 5L (post-implementation scan)

## R1 Fixed Items (confirmed in R2)

- H1 (SSR hydration): FIXED — useState(false) + sync in useEffect
- H2 (FileNavigationDropdown status type): FIXED — uses DbFileStatus
- M5 (useReducedMotion DRY): FIXED — delegates to useMediaQuery

## R2 Remaining HIGH

### H1-R2. contextRange prop still not synced (FindingDetailContent.tsx:47)

- Same as R1 H3 — useState(contextRangeProp ?? 2) only reads on mount
- Fix: add useEffect to sync when contextRangeProp changes

### H2-R2. Missing `lang` attribute on segment text (FindingDetailContent.tsx)

- sourceLang/targetLang prefixed with \_ (unused), violates Guardrail #39
- Fix: use lang props on text elements, remove \_ prefix

### H3-R2. E2E test.skip() without TD entry (e2e/review-responsive.spec.ts)

- 24 E2E tests all test.skip() — no TD entry in tech-debt-tracker.md

## R2 MEDIUM

- M1: Unused props files+onFileSelect in FileNavigationDropdown
- M2: noop fallback no user feedback
- M3: FindingDetailContent.test.tsx hardcodes mockFinding (not factory)
- M4: fileId ?? '' empty string fallback (Guardrail #8)
- M5: Story40 test L3 nav assertion may fail under laptop mock

## Key Patterns

- Dual-rendering (aside vs Sheet) via shared FindingDetailContent = excellent
- Design tokens for panel widths in tokens.css = correct pattern
- `data-layout-mode` attribute for testability = clever approach
- useMediaQuery as reusable base hook = good DRY pattern
