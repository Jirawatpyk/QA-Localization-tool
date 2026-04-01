'use client'

import { useMemo, useEffect, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { updateAssignmentStatus } from '@/features/project/actions/updateAssignmentStatus.action'
import { SoftLockBanner } from '@/features/review/components/SoftLockBanner'
import { useFilePresence } from '@/features/review/hooks/use-file-presence'
import { ReadOnlyContext } from '@/features/review/hooks/use-read-only-mode'
import { useSoftLock } from '@/features/review/hooks/use-soft-lock'
import type { FileAssignmentStatus } from '@/types/assignment'

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
 */
export function SoftLockWrapper({
  assignment,
  currentUserId,
  projectId,
  children,
}: SoftLockWrapperProps) {
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

  const [isReleasePending, startReleaseTransition] = useTransition()

  function handleRelease() {
    if (!assignment) return
    startReleaseTransition(async () => {
      await updateAssignmentStatus({
        assignmentId: assignment.id,
        projectId,
        status: 'assigned' as FileAssignmentStatus,
      })
      window.location.reload()
    })
  }

  const contextValue = useMemo(() => ({ isReadOnly }), [isReadOnly])

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
      {/* Soft lock banner for other user's assignment */}
      {lockState !== 'unlocked' && assigneeName && (
        <SoftLockBanner
          assignmentId={assignment?.id ?? ''}
          projectId={projectId}
          assigneeName={assigneeName}
          lastActiveAt={lastActiveAt}
          isStale={isStale}
          onTakeOver={() => {
            window.location.reload()
          }}
        />
      )}
      {isReadOnly && (
        <div
          className="bg-muted/50 border-b px-4 py-2 text-center text-sm text-muted-foreground"
          role="status"
          data-testid="read-only-banner"
        >
          Read-only mode — assigned to {assigneeName}
        </div>
      )}
      {children}
    </ReadOnlyContext>
  )
}
