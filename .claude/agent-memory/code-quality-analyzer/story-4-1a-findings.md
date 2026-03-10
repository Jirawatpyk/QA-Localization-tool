# Story 4.1a — Finding List Display & Progressive Disclosure CR R1-R2

**Date:** 2026-03-10
**Files reviewed:** 12 target files + context files
**Result:** R2: 0C / 3H / 5M / 5L

## R1 Fix Verification (12 findings: 3H + 5M + 4L)

| R1 ID                                    | Status     | Notes                                                      |
| ---------------------------------------- | ---------- | ---------------------------------------------------------- |
| H1 (DRY 5x duplication)                  | FIXED      | Extracted to `finding-display.ts` utils                    |
| H2 (FindingListItem dead code)           | FIXED      | Deleted, no imports found                                  |
| H3 (SeverityIndicator unused props)      | FIXED      | Cleaned to single `severity` prop                          |
| H4 (Grid roving tabindex no handler)     | STILL OPEN | See H1 below                                               |
| M1 (sortFindings duplication)            | ACCEPTED   | Server sort remains for SSR; client re-sort is intentional |
| M2 (STATUS_BG type)                      | FIXED      | Now `Partial<Record<FindingStatus, string>>`               |
| M3 (use-announce stub)                   | FIXED      | Deleted, direct import                                     |
| M4 (FindingCard hardcoded aria-expanded) | FIXED      | Removed                                                    |
| M5 (O(n log n) key)                      | ACCEPTED   | Pragmatic for expected scale (<1000 findings)              |
| L1 (reducedMotion dead ternary)          | FIXED      | Now applies `[&>div]:transition-none`                      |
| L2 (E2E minor accordion fragile)         | ACCEPTED   | Works with current regex                                   |
| L3 (quick actions group role)            | FIXED      | FindingCardCompact now has `role="group"`                  |
| L4 (FindingCard quick actions)           | STILL OPEN | See L1 below                                               |
| L5 (stale fileStatus)                    | ACCEPTED   | Compensated by layerCompleted prop                         |

## R2 HIGH Findings

### H1: Grid roving tabindex — still no J/K/Arrow keyboard navigation (R1-H4 unresolved)

- `ReviewPageClient.tsx:377` `role="grid"` wraps FindingList
- `FindingList.tsx:104` has `activeIndex` state + `isActive` mapped to `tabIndex={0|-1}`
- But NO `onKeyDown` handler exists for ArrowDown/ArrowUp/J/K to change `activeIndex`
- Without this, keyboard-only users see roving tabindex markup but cannot actually navigate
- **Guardrail #29** (Grid navigation: roving tabindex) requires arrow key movement
- Fix: add `handleGridKeyDown` for ArrowUp/ArrowDown/J/K, wrap grid div with handler

### H2: E2E text mismatch — "Confirmed by L3" vs "L3 Confirmed"

- `e2e/review-l3-findings.spec.ts:276` expects `toContainText(/Confirmed by L3/i)`
- `FindingCard.tsx:87` and `FindingCardCompact.tsx:109` render "L3 Confirmed"
- No component renders "Confirmed by L3" — this E2E assertion will FAIL
- Fix: change E2E to `/L3 Confirmed/i` to match actual component text

### H3: ReviewProgress — `deriveStatusFromLayer` masks 'failed' fileStatus

- `ReviewProgress.tsx:74` `effectiveStatus = layerDerivedStatus ?? fileStatus`
- When `layerCompleted='L1'` AND `fileStatus='failed'`, derived status = `'l1_completed'`
- This overrides the real failed status, hiding the error indicator from the user
- AI progress bar would show 15-25% "pending" instead of 0% error state
- Fix: preserve `fileStatus` when it's `'failed'` or `'ai_partial'`:
  ```ts
  const effectiveStatus =
    fileStatus === 'failed' || fileStatus === 'ai_partial'
      ? fileStatus
      : (layerDerivedStatus ?? fileStatus)
  ```

## R2 MEDIUM Findings

### M1: FindingCardCompact missing CJK font scale on source/target preview

- `FindingCardCompact.tsx:98-103` renders source/target text with `lang` attr (G#39)
- But does NOT import `isCjkLang` or apply `text-cjk-scale` class
- `FindingCard.tsx:124,135` correctly applies CJK scale via `isCjkLang()`
- CJK/Thai text in compact row will render with wrong font size
- Fix: import `isCjkLang` from utils, apply `text-cjk-scale` conditionally

### M2: `aria-live="assertive"` live region conditionally rendered (G#33 violation)

- `ReviewPageClient.tsx:348-354` `{partialWarningText && (<div aria-live="assertive">...)}`
- When `partialWarningText` goes from null to truthy, the live region mounts with content simultaneously
- Per Guardrail #33: "Live region container MUST exist in DOM before content changes"
- Screen readers may not announce the first partial warning appearance
- Fix: always render the container, conditionally render the content

### M3: ReviewPageClient.tsx:93-104 — Finding initialization fills placeholder fields

- `tenantId: ''`, `sessionId: ''`, `createdAt/updatedAt: new Date().toISOString()`
- These placeholder values differ from actual DB values
- If any downstream code reads `finding.tenantId` from store, it gets empty string
- Currently safe (display code only uses fields from FindingForDisplay), but fragile
- Fix: pass `tenantId` from `initialData` or from the component prop

### M4: `scope` field unsafe cast without runtime validation

- `use-findings-subscription.ts:66` casts `as 'per-file' | 'cross-file'` without validating
- Other fields use validator functions (`isValidSeverity`, `isValidStatus`, `isValidLayer`)
- If DB adds a new scope value, invalid data passes silently into store
- Fix: add `isValidScope()` validator like the other fields

### M5: Accordion state reset on findings list change

- `FindingList.tsx:107` `minorAccordionValue` persists even when findings change entirely
- When navigating between files (fileId change), accordion open/close state carries over
- Not currently a problem because FindingList remounts on file change via ReviewPageClient
- But if parent starts using key-based file switching without remount, stale state surfaces
- Fix: reset `minorAccordionValue` when sorted length changes (alongside `activeIndex` reset)

## R2 LOW Findings

### L1: FindingCard quick actions div still missing `role="group"` (R1-L4 unresolved)

- `FindingCard.tsx:154` `<div className="flex items-center gap-1 shrink-0">`
- `FindingCardCompact.tsx:129` was fixed to add `role="group"` + `aria-label`
- Inconsistent — FindingCard should match
- Fix: add `role="group" aria-label="Quick actions"` to FindingCard quick actions div

### L2: `handleKeyDown` in FindingCardCompact should also handle Space key

- `FindingCardCompact.tsx:63-71` handles Enter and Escape only
- Interactive elements with `role="row"` should also respond to Space for activation
- Minor because row click also works, but keyboard convention expects Space = activate
- Fix: add `if (e.key === ' ') { e.preventDefault(); onExpand(finding.id) }`

### L3: `buildFindingForUI` factory has indirect ID generation + weak typing

- `factories.ts:607` `id: (overrides?.['id'] as string) ?? dbFinding.segmentId`
- ID falls back to segmentId from dbFinding, not a dedicated finding UUID
- Parameter type `Record<string, unknown>` is not type-safe (see also M5)
- Fix: use `Partial<FindingForDisplay>` parameter type + `faker.string.uuid()` as default ID

### L4: Finding count summary uses `findingsMap.size` but severity counts use `findingsMap.values()`

- `ReviewPageClient.tsx:372` `findingsMap.size` for total
- `ReviewPageClient.tsx:216-222` iterates `findingsMap.values()` for severity counts
- These are always consistent but computed separately — could use a single memo
- Minor DRY opportunity

### L5: "All Done" in ReviewProgress lacks aria-live

- `ReviewProgress.tsx:137` conditionally renders "All Done" outside of aria-live region
- Guardrail #33 requires progress changes to use `aria-live="polite"`
- Screen reader won't announce completion state
- Fix: wrap in `aria-live="polite"` container or use existing `announce()` utility

## Positive Highlights

- R1 fixes well-executed: 8/12 findings properly addressed (DRY extraction, dead code removal, type safety)
- `finding-display.ts` utility extraction is clean — single responsibility functions, proper types
- Burst batching with `queueMicrotask` + `insertBufferRef` — excellent pattern for Realtime INSERT storms
- All 3 Realtime subscription hooks have consistent architecture (channel + polling fallback)
- Test coverage thorough: boundary value tests for truncation, roving tabindex, new finding detection
- "Adjust state during render" pattern correctly used (no setState-in-effect)
- Guardrail compliance: #25, #27, #31, #33, #36, #37, #39, #40

## New Anti-Patterns Discovered

1. **Shared utility without test file:** When extracting shared utils from components, always create co-located test file
2. **E2E badge text vs component text drift:** When changing badge text in component, grep E2E tests for old text
3. **`Record<string, unknown>` in factory functions:** Always use `Partial<ConcreteType>` for test factories
