'use client'

import { useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { useLockGuard, useReadOnlyAnnouncer } from '@/features/review/hooks/use-read-only-mode'

/**
 * S-FIX-7 R4.5: unified guard for every review mutation entry point.
 *
 * Wraps the six layers that must run around a mutation, in the correct order:
 * 1. **Read-only guard** (AC6) — early-return + sr-only a11y announcement
 * 2. **Sync in-flight ref** — synchronous rapid-double-click protection
 *    BEFORE any `await` yields. This is the critical ordering fix from
 *    CR R3-H1/H2 (refs flipped AFTER await created race windows).
 * 3. **Self-assign** (AC1, C3) — on unassigned files, acquire the lock
 *    before the mutation. On conflict, short-circuit.
 * 4. **Action execution** — user-provided async work
 * 5. **Throw handling** (R4-H2/H3) — try/catch with toast on unhandled
 *    rejection. Without this, rejected selfAssign or action promises
 *    silently leave the UI in a stuck state.
 * 6. **Cleanup** — finally block clears the in-flight ref on all paths
 *    including the read-only early-return (handled by the ref being
 *    flipped only AFTER the read-only check).
 *
 * ## Why this exists
 *
 * Across CR R1→R4 the same class of bug appeared 10+ times in different
 * call sites: each handler implemented its own slightly-different version
 * of this pattern. R1 missed selfAssign on 6 handlers. R3 fixed that but
 * put the in-flight ref in the wrong place (after await) in 3 handlers,
 * introducing double-click races. R4 found that R3 also missed try/catch
 * in 3 dialogs. Attacking the root cause (per `feedback-rolling-bug-pattern`)
 * means centralizing the pattern so future call sites use ONE correct
 * implementation by default.
 *
 * ## Usage
 *
 * ```ts
 * const guardedAction = useGuardedAction()
 *
 * const handleApprove = useCallback(() => {
 *   void guardedAction('approve file', fileId, projectId, async () => {
 *     const result = await approveFile({ fileId, projectId })
 *     if (result.success) toast.success('File approved')
 *     else toast.error(result.error ?? 'Approve failed')
 *   })
 * }, [guardedAction, fileId, projectId])
 * ```
 *
 * The `actionLabel` is used for the sr-only aria-live announcement when the
 * user attempts the action while read-only ("approve file ignored — file
 * is read-only").
 *
 * Return value: resolves to the discriminated outcome so callers can react
 * to conflict/readonly paths (e.g., keep a dialog open). The `'ran'` branch
 * means the action was invoked; whether the action itself succeeded is the
 * caller's responsibility (they should toast/setState inside the action).
 */
export type GuardedActionOutcome =
  | 'ran' // action was invoked successfully (side effects completed)
  | 'threw' // action threw; caller may want to re-enable inputs
  | 'readonly' // blocked by read-only guard
  | 'conflict' // blocked by self-assign conflict
  | 'in-flight' // blocked by concurrent invocation
  | 'error' // self-assign itself threw (not action)

type GuardedActionFn = (
  actionLabel: string,
  fileId: string,
  projectId: string,
  action: () => Promise<void>,
) => Promise<GuardedActionOutcome>

export function useGuardedAction(): GuardedActionFn {
  // R5-L2: read isReadOnly + selfAssignIfNeeded from a single useLockGuard()
  // call instead of subscribing to ReadOnlyContext twice via useReadOnlyMode +
  // useLockGuard. Harmless before (same context, single provider subscribe
  // internally) but cleaner and more intentional.
  const { isReadOnly, selfAssignIfNeeded } = useLockGuard()
  const announceReadOnly = useReadOnlyAnnouncer()
  // Per-hook-instance ref — each consumer component gets its own sync guard.
  // Rapid double-click on the SAME handler instance is blocked; rapid click
  // on two DIFFERENT handlers (e.g., bulk accept + approve) correctly runs
  // both because they have independent refs.
  const inFlightRef = useRef(false)

  return useCallback(
    async (actionLabel, fileId, projectId, action) => {
      // Layer 1: read-only guard + a11y announcement
      if (isReadOnly) {
        announceReadOnly(actionLabel)
        return 'readonly'
      }

      // Layer 2: sync in-flight guard — MUST flip BEFORE any await so rapid
      // double-click is rejected before the second click enters selfAssign
      if (inFlightRef.current) return 'in-flight'
      inFlightRef.current = true

      try {
        // Layer 3: self-assign (may throw on network error — Layer 5 catches)
        let lockOutcome: 'proceed' | 'conflict' | 'already-assigned'
        try {
          lockOutcome = await selfAssignIfNeeded(fileId, projectId)
        } catch {
          toast.error(`Failed to acquire lock for ${actionLabel} — please try again`)
          return 'error'
        }
        if (lockOutcome === 'conflict') return 'conflict'

        // Layer 4: run the user's action; wrap in try/catch so rejected
        // promises surface as a toast instead of silently leaving UI stuck
        try {
          await action()
          return 'ran'
        } catch {
          toast.error(`Failed to ${actionLabel} — please try again`)
          return 'threw'
        }
      } finally {
        // Layer 6: cleanup on EVERY path (success/conflict/throw)
        inFlightRef.current = false
      }
    },
    [isReadOnly, announceReadOnly, selfAssignIfNeeded],
  )
}
