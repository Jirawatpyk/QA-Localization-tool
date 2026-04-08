import { createContext, useContext } from 'react'

/**
 * Self-assign result — returned by the lock guard before review actions.
 * - 'proceed': action can execute (no lock or owner)
 * - 'conflict': another user holds the lock → switched to read-only
 * - 'already-assigned': current user already holds the lock (no-op self-assign)
 */
type SelfAssignOutcome = 'proceed' | 'conflict' | 'already-assigned'

type ReadOnlyContextValue = {
  isReadOnly: boolean
  /**
   * S-FIX-7: Call before any review mutation on an unassigned file.
   * Returns 'proceed' if the action should execute, 'conflict' if blocked.
   * Returns null if no self-assign is needed (assignment already exists).
   */
  selfAssignIfNeeded: (fileId: string, projectId: string) => Promise<SelfAssignOutcome>
}

// L8 fix: warn if a consumer uses the default (no SoftLockWrapper ancestor).
// In production this is a silent no-op fallback; in dev it surfaces missing wrappers.
const defaultSelfAssign = async () => {
  // eslint-disable-next-line no-restricted-syntax -- client hook can't import @/lib/env (server-only); NODE_ENV is build-inlined by Next.js
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[useLockGuard] selfAssignIfNeeded called without SoftLockWrapper ancestor — lock guard is bypassed.',
    )
  }
  return 'proceed' as const
}

export const ReadOnlyContext = createContext<ReadOnlyContextValue>({
  isReadOnly: false,
  selfAssignIfNeeded: defaultSelfAssign,
})

export function useReadOnlyMode(): boolean {
  return useContext(ReadOnlyContext).isReadOnly
}

export function useLockGuard(): ReadOnlyContextValue {
  return useContext(ReadOnlyContext)
}
