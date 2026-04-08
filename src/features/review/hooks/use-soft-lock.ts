import { useCallback, useEffect, useState } from 'react'

import { updateAssignmentStatus } from '@/features/project/actions/updateAssignmentStatus.action'
import type { FileAssignmentStatus } from '@/types/assignment'

const STALE_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes (AC6)
const STALE_CHECK_INTERVAL_MS = 15_000 // Re-check stale every 15s

type LockState = 'unlocked' | 'locked' | 'stale'

type FileAssignment = {
  id: string
  fileId: string
  projectId: string
  assignedTo: string
  assignedBy: string
  status: FileAssignmentStatus
  lastActiveAt: string | null
  assigneeName: string
}

type UseSoftLockOptions = {
  assignment: FileAssignment | null
  currentUserId: string | null
}

type UseSoftLockResult = {
  lockState: LockState
  isOwnAssignment: boolean
  isReadOnly: boolean
  assigneeName: string | null
  lastActiveAt: Date | null
  isStale: boolean
  assignmentId: string | null
  autoTransition: () => Promise<void>
}

function computeState(
  assignment: FileAssignment | null,
  currentUserId: string | null,
): { lockState: LockState; isStale: boolean } {
  if (!assignment) {
    return { lockState: 'unlocked', isStale: false }
  }
  // Deny-by-default: null currentUserId = unauthenticated → locked read-only
  if (!currentUserId) {
    return { lockState: 'locked', isStale: false }
  }
  if (assignment.assignedTo === currentUserId) {
    return { lockState: 'unlocked', isStale: false }
  }

  const isActive = assignment.status === 'assigned' || assignment.status === 'in_progress'
  if (!isActive) {
    return { lockState: 'unlocked', isStale: false }
  }

  const la = assignment.lastActiveAt ? new Date(assignment.lastActiveAt) : null
  // null lastActiveAt on 'assigned' status = nobody started work → treat as stale
  const stale = la
    ? Date.now() - la.getTime() > STALE_THRESHOLD_MS
    : assignment.status === 'assigned'
  return { lockState: stale ? 'stale' : 'locked', isStale: stale }
}

/**
 * Hook for soft lock detection (AC4, AC7).
 * Uses interval-based stale check to avoid impure Date.now() in render.
 * Auto-transitions assigned→in_progress when own assignment (AC7).
 */
export function useSoftLock({ assignment, currentUserId }: UseSoftLockOptions): UseSoftLockResult {
  const [lockState, setLockState] = useState<LockState>('unlocked')
  const [isStale, setIsStale] = useState(false)

  // S-FIX-7 H5: tighten isOwnAssignment to require active status.
  // Without status check, a cancelled/completed self-assignment would still
  // be treated as "own", skipping polling and showing stale "You are reviewing" UI.
  const isOwnAssignment =
    !!currentUserId &&
    assignment?.assignedTo === currentUserId &&
    (assignment?.status === 'assigned' || assignment?.status === 'in_progress')
  const lastActiveAt = assignment?.lastActiveAt ? new Date(assignment.lastActiveAt) : null

  // Stale check via interval — Date.now() only inside effect callback (React Compiler purity)
  useEffect(() => {
    function check() {
      const result = computeState(assignment, currentUserId)
      setLockState(result.lockState)
      setIsStale(result.isStale)
    }

    check()
    const id = setInterval(check, STALE_CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [assignment, currentUserId])

  // Auto-transition: assigned→in_progress when own assignment opens (AC7)
  const autoTransition = useCallback(async () => {
    if (!assignment || !isOwnAssignment || assignment.status !== 'assigned') return

    await updateAssignmentStatus({
      assignmentId: assignment.id,
      projectId: assignment.projectId,
      status: 'in_progress' as FileAssignmentStatus,
    })
  }, [assignment, isOwnAssignment])

  return {
    lockState,
    isOwnAssignment,
    isReadOnly: !isOwnAssignment && lockState !== 'unlocked',
    assigneeName: assignment?.assigneeName ?? null,
    lastActiveAt,
    isStale,
    assignmentId: assignment?.id ?? null,
    autoTransition,
  }
}
