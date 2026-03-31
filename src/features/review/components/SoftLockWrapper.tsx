'use client'

import { useMemo, useEffect } from 'react'

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
  currentUserId: string
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

  // Heartbeat for own active assignment (AC6)
  useFilePresence({
    assignmentId: isOwnAssignment ? assignmentId : null,
    enabled: isOwnAssignment && assignment?.status === 'in_progress',
  })

  // Auto-transition on mount: assigned→in_progress (AC7)
  useEffect(() => {
    void autoTransition()
  }, [autoTransition])

  const contextValue = useMemo(() => ({ isReadOnly }), [isReadOnly])

  return (
    <ReadOnlyContext value={contextValue}>
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
          onViewReadOnly={() => {
            // Already in read-only — banner stays visible
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
