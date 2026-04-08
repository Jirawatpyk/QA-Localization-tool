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
import type { FileAssignmentStatus } from '@/types/assignment'

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
  lastActiveAt: string | null
  assigneeName: string
}

type SoftLockWrapperProps = {
  assignment: FileAssignment | null
  currentUserId: string | null
  projectId: string
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
    startReleaseTransition(async () => {
      const result = await updateAssignmentStatus({
        assignmentId: assignment.id,
        projectId,
        status: 'assigned' as FileAssignmentStatus,
      })
      if (result.success) {
        setAssignment(null)
      }
    })
  }

  // S-FIX-7 AC1: Self-assign on first review action for unassigned files
  const selfAssignIfNeeded = useCallback(
    async (fileId: string, pId: string) => {
      // Already has assignment — no self-assign needed
      if (assignment) {
        if (isOwnAssignment) return 'already-assigned' as const
        return 'conflict' as const // Another user's lock
      }

      const result = await selfAssignFile({ fileId, projectId: pId })
      if (!result.success) {
        toast.error('Failed to start review — please try again')
        return 'conflict' as const
      }

      const { assignment: newAssignment, created } = result.data

      if (created) {
        // Self-assign succeeded
        setAssignment({
          id: newAssignment.id,
          fileId: newAssignment.fileId,
          projectId: newAssignment.projectId,
          assignedTo: newAssignment.assignedTo,
          assignedBy: newAssignment.assignedBy,
          status: newAssignment.status,
          lastActiveAt: newAssignment.lastActiveAt,
          assigneeName: newAssignment.assigneeName,
        })
        return 'proceed' as const
      }

      // Conflict: another reviewer got there first (AC8)
      if (newAssignment.assignedTo !== currentUserId) {
        setAssignment({
          id: newAssignment.id,
          fileId: newAssignment.fileId,
          projectId: newAssignment.projectId,
          assignedTo: newAssignment.assignedTo,
          assignedBy: newAssignment.assignedBy,
          status: newAssignment.status,
          lastActiveAt: newAssignment.lastActiveAt,
          assigneeName: newAssignment.assigneeName,
        })
        toast.info(`File is now being reviewed by ${newAssignment.assigneeName}`)
        return 'conflict' as const
      }

      // Own existing assignment (idempotent)
      setAssignment({
        id: newAssignment.id,
        fileId: newAssignment.fileId,
        projectId: newAssignment.projectId,
        assignedTo: newAssignment.assignedTo,
        assignedBy: newAssignment.assignedBy,
        status: newAssignment.status,
        lastActiveAt: newAssignment.lastActiveAt,
        assigneeName: newAssignment.assigneeName,
      })
      return 'already-assigned' as const
    },
    [assignment, isOwnAssignment, currentUserId],
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
      // Need a fileId to poll — get from current assignment or from page context
      const fileId = assignment?.fileId
      if (!fileId) return

      const result = await getFileAssignment({ fileId, projectId })
      if (!result.success) return

      const polledAssignment = result.data.assignment
      // Update assignment state on change
      if (polledAssignment) {
        setAssignment({
          id: polledAssignment.id,
          fileId: polledAssignment.fileId,
          projectId: polledAssignment.projectId,
          assignedTo: polledAssignment.assignedTo,
          assignedBy: polledAssignment.assignedBy,
          status: polledAssignment.status as FileAssignmentStatus,
          priority: polledAssignment.priority,
          lastActiveAt: polledAssignment.lastActiveAt,
          assigneeName: polledAssignment.assigneeName,
        } as FileAssignment)
      } else {
        // Lock released
        setAssignment(null)
      }
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
  }, [isOwnAssignment, isReadOnly, lockState, currentUserId, assignment?.fileId, projectId])

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
