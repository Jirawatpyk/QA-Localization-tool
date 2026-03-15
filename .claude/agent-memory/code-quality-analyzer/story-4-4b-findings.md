# Story 4.4b Undo/Redo Infrastructure CR R1-R2

## R1 (4C/6H — actually was 0C/5H/4M/3L in pre-CR, escalated to 4C/6H)

- C1: pushUndo missing for severity override (onOverride + onReset)
- C2: findingSnapshot not stored in add entry; redo-add no null guard
- C3: store.setFinding missing after undo-delete success
- C4: store.pushRedo missing in forceUndo success path
- H1: No stale finding check before bulk undo server call
- H2: Bulk redo no partial conflict filtering
- H3: No guard for empty redo entry on all-conflicted bulk undo
- H5: N+1 segment queries in undoBulkAction

## R2 (0C/2H/5M/4L) — 2026-03-15

All R1 fixes verified correct.

### HIGH

- H1: `undoDeleteFindingSchema.snapshot.detectedByLayer` uses `z.string()` not `z.enum(DETECTED_BY_LAYERS)` — arbitrary string inserted to DB
- H2: Inngest events sent sequentially in bulk actions — should use `inngest.send([...events])` batch

### MEDIUM

- M1: Snapshot string fields lack `.min(1)` validation (category, description)
- M2: Redo-add via `addFinding()` creates new ID — undo entry still has old ID → NOT_FOUND on nested undo
- M3: `rebuildIndex` O(n\*m) on every push/pop — acceptable at max 20 entries but suboptimal
- M4: `createdAt`/`updatedAt` in snapshot schema use `z.string()` not `.datetime()` — Invalid Date possible
- M5: feedback_events INSERT in loop instead of batch insert

### LOW

- L1: Inngest event after DELETE finding — handler must handle missing finding
- L2: Redundant `aria-live="assertive"` on AlertDialog (already implicit)
- L3: `relatedFileIds` uses `z.array(z.string())` not `z.string().uuid()`
- L4: `as FindingStatus` unsafe cast on DB query result (server-side, low risk)

## Key Pattern: Redo-Add ID Mismatch

When redo creates a new entity (via addFinding), the undo entry must be updated with the new server-assigned ID. Otherwise nested undo/redo cycles break. This applies to any undo/redo system where "redo" creates rather than restores.

## R1 Findings That Were Fixed

- H1(pre-CR): undoDeleteFindingSchema bare z.string() — scope FIXED to z.enum, detectedByLayer STILL z.string()
- H2(pre-CR): N+1 segments query — FIXED with batch inArray
- H3(pre-CR): Sequential Inngest send — NOT FIXED (still sequential in R2)
- H4(pre-CR): Redo add ID mismatch — NOT FIXED (still present in R2 as M2)
- M2(pre-CR): snapshot.tenantId trust — FIXED (server uses requireRole tenantId, not snapshot)
- M3(pre-CR): forceUndo no inFlightRef — status unclear
- M4(pre-CR): ConflictDialog double-fire — may still exist (onOpenChange + onClick both call onCancel)
