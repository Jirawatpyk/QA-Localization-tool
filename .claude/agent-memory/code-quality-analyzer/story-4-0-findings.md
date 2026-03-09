# Story 4.0 — Review Infrastructure & Keyboard Foundation CR R1-R2

**Date:** 2026-03-09
**R1 Result:** 0C / 3H / 5M / 5L
**R2 Result:** 0C / 1H / 3M / 5L

## R1 Findings — Final Status

| ID  | Status    | Notes                                                                      |
| --- | --------- | -------------------------------------------------------------------------- |
| H1  | FIXED     | SEVERITY_ICONS added in FindingListItem.tsx — icon + text + color per G#36 |
| H2  | FIXED     | TD-E2E-013/014/015 entries in tech-debt-tracker.md                         |
| H3  | FIXED     | mountAnnouncer/unmountAnnouncer in ReviewPageClient useEffect cleanup      |
| M1  | FIXED     | text-source-issue token in tokens.css                                      |
| M2  | FIXED     | Separate polite/assertive DOM elements in announce.ts                      |
| M3  | OPEN→R2M1 | Bare string 'pending' in autoAdvance — carried to R2                       |
| M4  | FIXED     | KeyboardCheatSheet registers via useKeyboardActions                        |
| M5  | FIXED     | setFindings(Map) bulk setter                                               |

## R2 Findings

### HIGH (1)

1. **H1: approveFile action is read-only — no DB mutation**
   - Writes audit log but never `db.update()` on scores/files
   - User sees "File approved" toast but nothing changes in DB
   - Needs TODO(story-X.X) if intentional placeholder

### MEDIUM (3)

1. **M1: autoAdvance bare string 'pending' (from R1 M3)**
   - `statusMap: Map<string, string>` should be `Map<string, FindingStatus>`
2. **M2: use-findings-subscription.ts + use-score-subscription.ts missing 'use client'**
   - Uses React hooks but no directive; works because imported from client component
3. **M3: getFileReviewData missing Zod input validation**
   - Destructures input directly without safeParse — unlike sibling actions

### LOW (5)

1. L1: `as` casts on Drizzle results in getFileReviewData
2. L2: useThresholdSubscription creates new Supabase client per poll
3. L3: FindingListItem expand state per-position (mitigated by key={id})
4. L4: `as 'per-file' | 'cross-file'` in use-findings-subscription
5. L5: `tenantId: ''` placeholder in ReviewPageClient initial findings

## Patterns Confirmed (Good)

- withTenant() on ALL DB queries — 100% compliance
- Zustand bulk setter pattern (setFindings(Map))
- Realtime payload validation (isValidScoreStatus, isValidSeverity, etc.)
- Dual announcer containers (polite + assertive) per G#33
- Burst batching via queueMicrotask for INSERT events
- Global reduced-motion CSS in animations.css
- Keyboard registry: singleton with \_resetRegistry for tests
- Focus trap + escape hierarchy per G#30/G#31
- Named exports throughout (no export default except pages)
- No any, no console.log, no process.env in app code
