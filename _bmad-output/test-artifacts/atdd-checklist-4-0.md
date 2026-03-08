---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode']
lastStep: 'step-02-generation-mode'
lastSaved: '2026-03-09'
---

# ATDD Checklist - Epic 4, Story 4.0: Review Infrastructure Setup

**Date:** 2026-03-09
**Author:** Mona
**Primary Test Level:** Unit (Vitest/jsdom) + E2E (Playwright) for real browser keyboard tests

---

## Story Summary

Infrastructure story establishing the keyboard hotkey framework, accessibility foundation (ARIA, focus management), review UI shell (3-zone layout with shadcn Sheet), action bar, and contrast token fixes — enabling Stories 4.1-4.7 to build review features on a consistent, accessible, keyboard-driven foundation.

**As a** Developer
**I want** the hotkey framework, accessibility foundation, and review UI shell established
**So that** Stories 4.1-4.7 can build review features on a consistent, accessible, keyboard-driven foundation

---

## Preflight Results

### Prerequisites
- Story approved: `4-0-review-infrastructure-setup.md` — 7 ACs, status `ready-for-dev`
- Playwright configured: `playwright.config.ts` — testDir `./e2e`, Chromium, baseURL localhost:3000
- Vitest configured: `vitest.config.ts` — unit (jsdom) + rls (node) + integration (node)

### Framework & Existing Patterns
- 22 E2E specs, 21 review unit tests
- E2E helpers: `signupOrLogin`, `createTestProject`, `pollFileStatus`, `pollScoreLayer`, `queryScore`
- Factories: `buildFinding`, `buildFile`, `buildSegment`, `buildReviewSession`, `createDrizzleMock`
- Pattern: hoisted mocks → `vi.mock()` → `beforeEach` store reset → render/renderHook → assert

### TEA Config
- `tea_use_playwright_utils`: true
- `tea_browser_automation`: auto

### Knowledge Base (9 fragments loaded)
- data-factories, component-tdd, test-quality, test-healing-patterns, selector-resilience
- timing-debugging, test-levels-framework, test-priorities-matrix, playwright-cli

---

## Advanced Elicitation Findings

### Pre-mortem Analysis (6 prevention actions)
1. jsdom != real browser for keyboard → add E2E keyboard tests (not just unit)
2. aria-live mount timing → test 2-step: mount empty container then inject content
3. Focus trap not real in jsdom → E2E `page.keyboard.press('Tab')` + `toBeFocused()`
4. Token change visual regression → contrast ratio boundary test + render existing components
5. E2E flaky from pipeline dependency → PostgREST seed + Inngest gate + poll helper
6. TD fixes break siblings → dedicated regression tests per TD item

### Red Team vs Blue Team (+4 test cases)
1. Modal transition race → test `isClosing` state + suppress hotkey (P1)
2. Nested Esc across zones → dropdown-in-Sheet Esc test (P1)
3. Hotkey vs disabled button → handler checks enabled state stub (P2, real in 4.2)
4. reduced-motion incomplete → extend to Sheet + tooltip (P1)
- DEFERRED to 4.1b: roving tabindex DOM reorder (P0 for 4.1b)

### FMEA (27 failure modes → 28 test cases)
- useKeyboardActions: K1-K6 (6 modes, 3 P0 + 3 P1)
- useFocusManagement: F1-F6 (6 modes, 4 P0 + 3 P1)
- ARIA Foundation: A1-A5 (5 modes, 2 P0 + 2 P1 + 1 P2)
- Layout + Sheet: L1-L5 (5 modes, 3 P0 + 2 P1)
- Action Bar + Cheat Sheet + Tokens: B1-B2, C1, T1-T2 (5 modes, 1 P0 + 4 P1)

### War Room Consensus (Final Test Budget)

| Category | Unit | E2E | Boundary | Total |
|----------|:---:|:---:|:---:|:---:|
| useKeyboardActions (K1-K6) | 6 | — | — | 6 |
| useFocusManagement (F1-F6+rerender) | 5 | 2 | — | 7 |
| ARIA Foundation (A1-A5) | 5 | — | — | 5 |
| Layout + Sheet (L1-L5) | 5 | — | — | 5 |
| Action Bar (B1-B2+order) | 2 | — | 1 | 3 |
| Cheat Sheet (C1+categories) | 2 | 1 | — | 3 |
| Tokens (T1-T2) | — | — | 2 | 2 |
| reduced-motion (Sheet+modal) | 1 | — | — | 1 |
| E2E keyboard composite | — | 1 | — | 1 |
| TD fixes (7 items) | 7 | — | — | 7 |
| **Grand Total** | **33** | **4** | **3** | **40** |

Priority breakdown: P0=13, P1=18, P2=2, TD regression=7

Test file structure: task-aligned (1 test file per task)
E2E: 4 tests in `e2e/review-keyboard.spec.ts` (serial)

---

## Generation Mode

**Mode:** AI Generation
**Rationale:** ACs are clear, scenarios are standard UI infrastructure (hooks, components, ARIA, tokens). No complex multi-step UI recording needed. 40 test cases defined from FMEA + War Room — AI generates stubs from existing project patterns.
