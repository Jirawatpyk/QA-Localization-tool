# Story 3.0 Score & Review Infrastructure CR

## R1 Pre-CR (2026-02-26)

- **Findings:** 2C / 5H / 5M / 4L = 16 total
- C1: Unsafe `as ScoreStatus` cast — **FIXED** (isValidScoreStatus guard added)
- C2: Polling fallback has no fetch logic — **FIXED** (supabase.from().select() added)
- H1: Unhandled promise rejection in emitter — **FIXED** (.catch added)
- H2: Map O(n) missing batch setter — **FIXED** (setFindings added)
- H3: resetForFile ignores fileId — **FIXED** (currentFileId stored)
- H5: useFindingChangedEmitter unstable ref — **PARTIALLY FIXED** (comment added, ref pattern TBD)

## R2 Full CR (2026-02-27)

- **Files:** 9 new + 10 modified = 19 files
- **Findings:** 2C / 5H / 6M / 3S = 16 total

### R2 Critical Issues

- C1: `findingChangedSchema` uses `z.string()` for previousState/newState (should be `z.enum()` matching FindingStatus)
- C2: `SCORE_STATUS_VALUES` duplicates ScoreStatus type — drift risk (should derive from shared const)

### R2 High Issues

- H1: Realtime `handleScoreUpdate` payload typed but not Zod-validated (Anti-Pattern #19)
- H2: `as any` in recalculateScore onFailure — missing explanatory comment
- H3: `findingRows as unknown as ContributingFinding[]` — unsafe double cast in scoreFile.ts
- H4: `void poll()` swallows promise rejection (Guardrail #13)
- H5: `timestamp: z.string()` — no ISO 8601 validation

### R2 Medium Issues

- M1: Backoff tests only assert "no crash" — need call count assertions
- M2: "retries set to 3" / "triggered by finding.changed" tests assert nothing relevant
- M3: useFindingChangedEmitter triggerFn instability — needs useRef stabilization
- M4: setFinding O(n) Map copy per single update (perf at scale)
- M5: Finding type missing `fileId` field
- M6: onFailureFn doesn't guard event.data.event.data structure

### What Was Fixed Since R1

- R1-C1 (unsafe cast) -> R2 uses isValidScoreStatus guard (good but H1 remains: no Zod on full payload)
- R1-C2 (dead polling) -> R2 has actual supabase fetch in poll loop (good)
- R1-H1 (emitter catch) -> R2 has .catch on triggerFn (good)
- R1-H2 (batch setter) -> R2 has setFindings + setSelections (good)
- R1-H3 (fileId param) -> R2 stores currentFileId (good)
- R1-M1 (no event validation) -> R2 has findingChangedSchema.safeParse (good but C1: z.string too loose)
- R1-M2 (bare string layer) -> R2 uses DetectedByLayer union type (good)

### What Was Fixed Since R2 (R1 fix commit)

- R2-C1 (z.string for status): FIXED — `z.enum(FINDING_STATUSES)` in findingChangedSchema
- R2-C2 (SCORE_STATUS_VALUES drift): FIXED — derived from `SCORE_STATUSES` const array
- R2-H4 (void poll()): FIXED — `.catch()` on poll()
- R2-H5 (timestamp validation): FIXED — `z.string().datetime()`
- R2-M1 (backoff tests): FIXED — mockFrom call count assertions added
- R2-M2 (config tests): FIXED — real fnConfig/triggerEvent assertions via Object.assign

### R3 Review (2026-02-27) — R1 Fix Verification

- **Findings:** 0C / 2H / 3M / 4S = 9 total (down from 16)
- All R2 Critical issues VERIFIED FIXED
- No regressions introduced by R1 fixes
- H1: unsafe double cast `as unknown as ContributingFinding[]` in scoreFile.ts (existing tech debt, not R1 scope)
- H2: `as any` on onFailureFn missing explanatory comment (cosmetic, pattern exists in processFile.ts)
- M1: `retries: 3 as const` unnecessary (processFile.ts uses plain `3`)
- M3: `as [{ key: string; limit: number }]` on concurrency array unnecessary
- S4: Missing `clearSelection()` direct test in review.store.test.ts

### Key Patterns Confirmed

- withTenant() on all queries: PASS (5 queries in scoreFile.ts)
- Object.assign Inngest testability: PASS (enhanced — now exposes fnConfig + triggerEvent)
- Inngest registered in route.ts: PASS
- Audit log non-fatal pattern: PASS (both scoreFile + onFailure)
- Factory functions: PASS (buildFindingChangedEvent added)
- DELETE+INSERT in transaction: PASS
- Event type canonical at @/types/pipeline: PASS
- Slice-based Zustand store: PASS (good modular pattern)
- Batch setters for Map/Set: PASS (Anti-Pattern #21 addressed)
- SSOT const array -> type derivation: PASS (Anti-Pattern #22/#23 resolved)
