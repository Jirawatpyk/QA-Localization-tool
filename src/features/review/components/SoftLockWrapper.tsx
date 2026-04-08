'use client'

import { useCallback, useMemo, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { getFileAssignment } from '@/features/project/actions/getFileAssignment.action'
import { selfAssignFile } from '@/features/project/actions/selfAssignFile.action'
import { updateAssignmentStatus } from '@/features/project/actions/updateAssignmentStatus.action'
import { SoftLockBanner } from '@/features/review/components/SoftLockBanner'
import { useFilePresence } from '@/features/review/hooks/use-file-presence'
import { useInactivityWarning } from '@/features/review/hooks/use-inactivity-warning'
import { ReadOnlyContext } from '@/features/review/hooks/use-read-only-mode'
import { useSoftLock } from '@/features/review/hooks/use-soft-lock'
import type { FileAssignmentPriority, FileAssignmentStatus } from '@/types/assignment'

/** Polling intervals for lock state detection (AC7) */
const LOCK_POLL_FAST_MS = 5_000 // When read-only (waiting for lock release)
const LOCK_POLL_SLOW_MS = 15_000 // When monitoring for new locks

type FileAssignment = {
  id: string
  fileId: string
  projectId: string
  assignedTo: string
  assignedBy: string
  status: FileAssignmentStatus
  // L2 fix: priority must be in the local type — polling sets it and `as FileAssignment` cast hid the drift
  priority: FileAssignmentPriority
  lastActiveAt: string | null
  assigneeName: string
}

type SoftLockWrapperProps = {
  assignment: FileAssignment | null
  currentUserId: string | null
  projectId: string
  fileId: string
  children: React.ReactNode
}

/**
 * Wraps the review page content with soft lock detection + ReadOnlyContext.
 * Renders SoftLockBanner when another user has the file.
 * Provides ReadOnlyContext so child components (ReviewPageClient) can check read-only state.
 *
 * S-FIX-7: Manages mutable assignment state for self-assignment flow.
 * Exposes `selfAssignIfNeeded` via ReadOnlyContext for review actions to call.
 */
export function SoftLockWrapper({
  assignment: initialAssignment,
  currentUserId,
  projectId,
  fileId,
  children,
}: SoftLockWrapperProps) {
  // S-FIX-7: Mutable assignment state (starts from server prop, updated on self-assign/poll)
  const [assignment, setAssignment] = useState<FileAssignment | null>(initialAssignment)

  // Track prop changes (React render-time adjustment pattern — Guardrail #21 React Compiler)
  const [prevInitial, setPrevInitial] = useState(initialAssignment)
  if (prevInitial !== initialAssignment) {
    setPrevInitial(initialAssignment)
    setAssignment(initialAssignment)
  }

  const {
    lockState,
    isOwnAssignment,
    isReadOnly,
    assigneeName,
    lastActiveAt,
    isStale,
    assignmentId,
    autoTransition,
  } = useSoftLock({ assignment, currentUserId })

  // Heartbeat for own assignment (AC6) — only when in_progress (RLS WITH CHECK requires it)
  const isOwnActive = isOwnAssignment && assignment?.status === 'in_progress'
  useFilePresence({
    assignmentId: isOwnAssignment ? assignmentId : null,
    enabled: isOwnActive,
    // H6: surface lock loss when heartbeat returns permanent failure (cancelled/auth lost)
    onPermanentFailure: () => {
      setAssignment(null)
      toast.warning('Your review lock has expired — click any action to re-acquire')
    },
  })

  // Auto-transition on mount: assigned→in_progress (AC7)
  useEffect(() => {
    void autoTransition()
  }, [autoTransition])

  // S-FIX-7 AC5: 25-minute inactivity warning toast
  useInactivityWarning({
    assignmentId: isOwnAssignment ? assignmentId : null,
    enabled: isOwnActive,
  })

  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [isReleasePending, startReleaseTransition] = useTransition()

  function handleRelease() {
    if (!assignment) return
    // S-FIX-7 C4 fix: self-assigned files (assignedBy === assignedTo) must be CANCELLED
    // on release so other reviewers can self-assign. Admin-assigned files revert to
    // 'assigned' state (Story 6.1 behavior — admin pool re-assign).
    const isSelfAssigned = assignment.assignedBy === assignment.assignedTo
    const releaseStatus: FileAssignmentStatus = isSelfAssigned ? 'cancelled' : 'assigned'
    startReleaseTransition(async () => {
      const result = await updateAssignmentStatus({
        assignmentId: assignment.id,
        projectId,
        status: releaseStatus,
      })
      if (result.success) {
        // Reload to re-fetch assignment state from server
        window.location.reload()
      }
    })
  }

  // S-FIX-7 H7: when tab returns to visible, re-fetch assignment state to detect
  // a stale lock (cron auto-cancelled while tab was background). If we discover
  // our lock was lost, surface a toast so the user knows to re-self-assign.
  useEffect(() => {
    if (!currentUserId) return

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      if (!isOwnAssignment) return // only relevant when we believe we hold the lock

      void getFileAssignment({ fileId, projectId }).then((result) => {
        if (!result.success) return
        const polled = result.data.assignment
        // R2-H3: detect lock loss in 3 cases:
        // (1) no polled row at all (cron deleted),
        // (2) polled row belongs to someone else (takeover),
        // (3) polled row is ours but status transitioned to cancelled/completed
        //     (cron auto-released our own lock — H5 tightened isOwnAssignment to require active status)
        const ownLockLost =
          !polled ||
          polled.assignedTo !== currentUserId ||
          polled.status === 'cancelled' ||
          polled.status === 'completed'
        if (ownLockLost) {
          setAssignment(
            polled
              ? {
                  id: polled.id,
                  fileId: polled.fileId,
                  projectId: polled.projectId,
                  assignedTo: polled.assignedTo,
                  assignedBy: polled.assignedBy,
                  status: polled.status as FileAssignmentStatus,
                  priority: polled.priority as FileAssignmentPriority,
                  lastActiveAt: polled.lastActiveAt,
                  assigneeName: polled.assigneeName,
                }
              : null,
          )
          toast.warning('Your review lock has expired — click any action to re-acquire')
        }
      })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [currentUserId, isOwnAssignment, fileId, projectId])

  // S-FIX-7 AC1: Self-assign on first review action for unassigned files
  const selfAssignIfNeeded = useCallback(
    async (fileId: string, pId: string) => {
      // R2-H4: only early-return when assignment is ACTIVE. If it's stale
      // (cancelled/completed — e.g., cron released it but poll hasn't caught up),
      // fall through to selfAssignFile so the server is the source of truth.
      const isActive =
        assignment && (assignment.status === 'assigned' || assignment.status === 'in_progress')
      if (isActive) {
        if (isOwnAssignment) return 'already-assigned' as const
        return 'conflict' as const // Another user's active lock
      }

      const result = await selfAssignFile({ fileId, projectId: pId })
      if (!result.success) {
        toast.error('Failed to start review — please try again')
        return 'conflict' as const
      }

      // M12: use explicit ownedBySelf discriminator instead of inferring from assignedTo
      const { assignment: newAssignment, created, ownedBySelf } = result.data

      const next = {
        id: newAssignment.id,
        fileId: newAssignment.fileId,
        projectId: newAssignment.projectId,
        assignedTo: newAssignment.assignedTo,
        assignedBy: newAssignment.assignedBy,
        status: newAssignment.status,
        priority: newAssignment.priority,
        lastActiveAt: newAssignment.lastActiveAt,
        assigneeName: newAssignment.assigneeName,
      }
      setAssignment(next)

      if (!ownedBySelf) {
        // Conflict: another reviewer got there first (AC8)
        toast.info(`File is now being reviewed by ${newAssignment.assigneeName}`)
        return 'conflict' as const
      }
      return created ? ('proceed' as const) : ('already-assigned' as const)
    },
    // M12: currentUserId no longer needed — we now rely on server's ownedBySelf flag
    [assignment, isOwnAssignment],
  )

  // S-FIX-7 AC7: Lock state polling for release detection
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Skip polling when own assignment (already have heartbeat)
    if (isOwnAssignment) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    // Determine poll interval based on state
    const pollMs = isReadOnly ? LOCK_POLL_FAST_MS : LOCK_POLL_SLOW_MS
    const needsPoll = isReadOnly || lockState === 'unlocked'

    if (!needsPoll || !currentUserId) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    async function poll() {
      // S-FIX-7 C2 fix: poll uses page-level fileId prop, not assignment.fileId
      // (assignment may be null when monitoring for new locks per AC7)
      const result = await getFileAssignment({ fileId, projectId })
      if (!result.success) return

      const polledAssignment = result.data.assignment

      // S-FIX-7 H1 fix: debounce — skip setAssignment if no meaningful change
      setAssignment((prev) => {
        if (!polledAssignment) {
          return prev === null ? prev : null
        }
        if (
          prev &&
          prev.id === polledAssignment.id &&
          prev.status === polledAssignment.status &&
          prev.assignedTo === polledAssignment.assignedTo &&
          prev.lastActiveAt === polledAssignment.lastActiveAt
        ) {
          return prev
        }
        return {
          id: polledAssignment.id,
          fileId: polledAssignment.fileId,
          projectId: polledAssignment.projectId,
          assignedTo: polledAssignment.assignedTo,
          assignedBy: polledAssignment.assignedBy,
          status: polledAssignment.status as FileAssignmentStatus,
          priority: polledAssignment.priority as FileAssignmentPriority,
          lastActiveAt: polledAssignment.lastActiveAt,
          assigneeName: polledAssignment.assigneeName,
        }
      })
    }

    pollIntervalRef.current = setInterval(() => {
      poll().catch(() => {})
    }, pollMs)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [isOwnAssignment, isReadOnly, lockState, currentUserId, fileId, projectId])

  const contextValue = useMemo(
    () => ({ isReadOnly, selfAssignIfNeeded }),
    [isReadOnly, selfAssignIfNeeded],
  )

  return (
    <ReadOnlyContext value={contextValue}>
      {/* D1: Release bar for own in_progress assignment (AC7) */}
      {isOwnAssignment && assignment?.status === 'in_progress' && (
        <div
          className="bg-muted/50 border-b flex items-center justify-between px-4 py-2 text-sm"
          data-testid="own-assignment-bar"
        >
          <span className="text-muted-foreground">You are reviewing this file</span>
          <Button variant="outline" size="sm" onClick={handleRelease} disabled={isReleasePending}>
            {isReleasePending ? 'Releasing...' : 'Release file'}
          </Button>
        </div>
      )}
      {/* Soft lock banner for other user's assignment (AC4: "View read-only" or "Take over") */}
      {lockState !== 'unlocked' && assigneeName && !bannerDismissed && (
        <SoftLockBanner
          assignmentId={assignment?.id ?? ''}
          projectId={projectId}
          assigneeName={assigneeName}
          lastActiveAt={lastActiveAt}
          isStale={isStale}
          onTakeOver={() => {
            window.location.reload()
          }}
          onViewReadOnly={() => {
            setBannerDismissed(true)
          }}
        />
      )}
      {isReadOnly && (
        <div
          className="bg-muted/50 border-b px-4 py-2 text-center text-sm text-muted-foreground"
          role="status"
          data-testid="read-only-banner"
        >
          Read-only mode — assigned to {assigneeName ?? 'another reviewer'}
        </div>
      )}
      {children}
    </ReadOnlyContext>
  )
}
