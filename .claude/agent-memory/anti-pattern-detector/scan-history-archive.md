# Scan History Archive — Stories 1.1 through 4.7

Full scan results for all prior stories. Referenced from MEMORY.md index.

## Story 4.7 Add to Glossary from Review (2026-03-18)

0C + 0H + 4M + 3L. 5 files. ALL 14 anti-patterns CLEAN. MEDIUM: (1) `FindingForDisplay.category: string` in types.ts:9 — bare string (Guardrail #3, 23rd occurrence); (2) `notes` field accepted by schema but NOT stored in DB table — comment/TODO needed; (3) UPDATE in updateGlossaryTerm.action.ts:62-66 missing defense-in-depth tenant re-check (exception: global table, comment required); (4) duplicate category string comparison. LOW: (1) `sql\`lower(...)\``Drizzle valid; (2)`notes: z.string().optional()`in schema not Guardrail #17 context but flagged for reviewer; (3)`document.getElementById`instead of`useRef<HTMLFormElement>`. CLEAN: all server actions have `'use server'`+`'server-only'`, withTenant() on all queries, audit log, revalidateTag 2-arg.

## Story 4.6 Suppress False Positive Patterns (2026-03-17)

0C + 0H + 6M + 4L. 18 files. ALL 14 anti-patterns CLEAN. MEDIUM: (1) `SCOPE_LABELS: Record<string, string>` + `DURATION_LABELS: Record<string, string>` should be typed unions; (2) unsafe Drizzle varchar cast `r.scope as SuppressionRule['scope']` in 2 action files; (3) `createdBy: ''` hardcoded empty string (missing userId from auth); (4) stale `sessionId: ''` comment; (5) `reviewActionRows` INSERT no onConflict handler. LOW: (1) duplicate import of @/features/review/types; (2) SuppressPatternDialog triggerRef focus missing in programmatic close path; (3) `role="grid"` on wrapper div instead of `<table>` itself; (4) `createdByName: null` missing TODO ref. NEW PATTERN: `role="grid"` must be on `<table>` NOT wrapper `<div>`.

## Story 4.5 Search/Filter/AI Toggle (2026-03-16)

0C + 0H + 5M + 4L. 9 files. MEDIUM: (1) `bg-yellow-200 dark:bg-yellow-800` in FindingCardCompact.tsx:34 (highlight mark — should use `.highlight-mark` CSS class); (2) `MatchCounts: Record<string, number>` should use typed union keys; (3) `onAction?: (action: string)` should be typed union; (4) barrel re-exports from review.store.ts; (5) `countKey: string` should be `keyof MatchCounts`. LOW: (1) `as never` x2 in FilterBar; (2) unsafe cast `f as Parameters<...>[0]`; (3) `useReviewStore.getState()` inside useCallback lacks comment; (4) FilterBar/SearchInput missing `'use client'` (inherits boundary). TOKEN CONFIRMED: `.highlight-mark` in globals.css:145 uses `--color-highlight` token — `bg-yellow-200` is WRONG.

## Story 4.4b Undo/Redo Stack (2026-03-15)

0C + 0H + 4M + 3L. 16 files. MEDIUM: (1) `UndoRedoResult.previousState: string` should be `FindingStatus`; (2) `UndoSeverityResult.previousSeverity: string` should be `FindingSeverity`; (3) `onConflict` callback param `currentState: string` should be `FindingStatus | 'unknown' | null`; (4) `scope: z.string()` in snapshot schema should be `z.enum(['per-file', 'cross-file'])`. LOW: (1) double-cast `pf.previousState as FindingStatus` without runtime guard; (2) `reviewerIsNative: false` missing TODO ref in bulk variant; (3) use-undo-redo.ts missing `'use client'`. NEW PATTERN: `scope` field in snapshot Zod schema must use `z.enum(['per-file','cross-file'])` not `z.string()`.

## Story 4.4a Bulk Operations & Override History (2026-03-15)

0C + 0H + 5M + 2L. 15 files. MEDIUM: (1) `severity: string` in ProcessedFinding (should be FindingSeverity); (2) `SEVERITY_PRIORITY: Record<string, number>` recurring; (3) `overrideCounts: Record<string, number>` borderline; (4) `bg-amber-100 text-amber-800 border border-amber-300` in OverrideBadge — no amber token exists; (5) `text-amber-700 dark:text-amber-300` in FindingDetailContent. LOW: (1) OverrideHistoryEntry type defined twice with shape drift. AMBER PATTERN: `bg-amber-*` has no design token equivalent — `--color-override` family needs to be created. 3rd story with amber flagged.

## Story 4.3 Extended Actions (2026-03-14)

0C + 0H + 5M + 2L. 24 files. MEDIUM: (1) `text-blue-600` — fix: `text-info`; (2) `text-purple-600` — fix: `text-source-issue`; (3) `bg-amber-100 text-amber-800 border-amber-200` override badge; (4) `severity: string` in AddFindingResult; (5) `originalSeverity/newSeverity: string` should be FindingSeverity; (6) `SEVERITY_PRIORITY: Record<string, number>` recurring; (7) `new Set<string>` for action keys. TOKEN CONFIRMED: `text-info` = `--color-info: #3b82f6` = blue-600 exact match.

## Story 4.2 Core Review Actions (2026-03-14)

0C + 0H + 3M + 1L. ALL 14 anti-patterns CLEAN. MEDIUM: (1) `FindingMeta.severity/category/detectedByLayer: string`; (2) double-cast `finding.status as FindingStatus` without runtime validation; (3) `toast` namespace used where typed union expects only sub-methods. LOW: `'use strict'` in .ts ES module is no-op. NEW PATTERN: `'use strict'` in .ts ES module = LOW, not security issue.

## Story 4.1d/c/b/a, 4.0, stripZeroWidth, TA Run 12, Story 3.x, 2.x, 1.x

See `story-3-1-findings.md` and `story-3-2a-findings.md` for stories 1.1–3.2a detail. Stories 3.2b–3.5, 4.0–4.1d covered inline above (key patterns extracted to recurring violations section of MEMORY.md).
