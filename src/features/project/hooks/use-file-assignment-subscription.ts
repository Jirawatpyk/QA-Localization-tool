import { useCallback, useEffect, useRef } from 'react'

import { createBrowserClient } from '@/lib/supabase/client'
import type { FileAssignmentPriority, FileAssignmentStatus } from '@/types/assignment'

type FileAssignmentRow = {
  id: string
  file_id: string
  project_id: string
  tenant_id: string
  assigned_to: string
  assigned_by: string
  status: FileAssignmentStatus
  priority: FileAssignmentPriority
  last_active_at: string | null
  created_at: string
  updated_at: string
}

type UseFileAssignmentSubscriptionOptions = {
  projectId: string
  onInsert?: (assignment: FileAssignmentRow) => void
  onUpdate?: (assignment: FileAssignmentRow) => void
  onDelete?: (oldAssignment: { id: string }) => void
  enabled?: boolean
}

/**
 * Realtime subscription for file_assignments changes within a project.
 * Uses Supabase Realtime postgres_changes filtered by project_id.
 */
export function useFileAssignmentSubscription({
  projectId,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseFileAssignmentSubscriptionOptions) {
  const onInsertRef = useRef(onInsert)
  const onUpdateRef = useRef(onUpdate)
  const onDeleteRef = useRef(onDelete)

  useEffect(() => {
    onInsertRef.current = onInsert
    onUpdateRef.current = onUpdate
    onDeleteRef.current = onDelete
  })

  const subscribe = useCallback(() => {
    if (!enabled || !projectId) return undefined

    const supabase = createBrowserClient()
    const channel = supabase
      .channel(`file-assignments:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'file_assignments',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          onInsertRef.current?.(payload.new as FileAssignmentRow)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'file_assignments',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          onUpdateRef.current?.(payload.new as FileAssignmentRow)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'file_assignments',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          onDeleteRef.current?.({ id: (payload.old as { id: string }).id })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, projectId])

  useEffect(() => {
    const cleanup = subscribe()
    return cleanup
  }, [subscribe])
}
