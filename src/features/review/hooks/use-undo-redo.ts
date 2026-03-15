import { useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { addFinding } from '@/features/review/actions/addFinding.action'
import { deleteFinding } from '@/features/review/actions/deleteFinding.action'
import { overrideSeverity } from '@/features/review/actions/overrideSeverity.action'
import { redoAction } from '@/features/review/actions/redoAction.action'
import { redoBulkAction } from '@/features/review/actions/redoBulkAction.action'
import { undoAction } from '@/features/review/actions/undoAction.action'
import { undoAddFinding } from '@/features/review/actions/undoAddFinding.action'
import { undoBulkAction } from '@/features/review/actions/undoBulkAction.action'
import { undoDeleteFinding } from '@/features/review/actions/undoDeleteFinding.action'
import { undoSeverityOverride } from '@/features/review/actions/undoSeverityOverride.action'
import { useReviewStore } from '@/features/review/stores/review.store'
import type { UndoEntry } from '@/features/review/stores/review.store'
import { announce } from '@/features/review/utils/announce'

type UseUndoRedoOptions = {
  fileId: string
  projectId: string
  onConflict: (entry: UndoEntry, findingId: string, currentState: string) => void
}

export function useUndoRedo({ fileId, projectId, onConflict }: UseUndoRedoOptions) {
  const inFlightRef = useRef(false)

  const performUndo = useCallback(async () => {
    if (inFlightRef.current) return
    const store = useReviewStore.getState()
    const entry = store.popUndo()
    if (!entry) return

    inFlightRef.current = true
    try {
      // Branch by action type
      if (entry.action === 'severity_override' && entry.findingId && entry.previousSeverity) {
        const finding = store.findingsMap.get(entry.findingId)
        const currentSeverity = finding?.severity

        const result = await undoSeverityOverride({
          findingId: entry.findingId,
          fileId,
          projectId,
          previousSeverity: entry.previousSeverity.severity,
          previousOriginalSeverity: entry.previousSeverity.originalSeverity,
          expectedCurrentSeverity: currentSeverity ?? entry.previousSeverity.severity,
        })

        if (!result.success) {
          // Restore entry to undo stack on failure
          store.pushUndo(entry)
          if (result.code === 'CONFLICT') {
            onConflict(entry, entry.findingId, currentSeverity ?? 'unknown')
          } else {
            toast.error(`Undo failed: ${result.error}`)
          }
          return
        }

        store.pushRedo(entry)
        toast.success(`Undone: ${entry.description}`)
        announce(`Undone: ${entry.description}`)
        return
      }

      if (entry.action === 'add' && entry.findingId) {
        const result = await undoAddFinding({ findingId: entry.findingId, fileId, projectId })
        if (!result.success) {
          store.pushUndo(entry)
          toast.error(`Undo failed: ${result.error}`)
          return
        }
        // Remove finding from store
        store.removeFinding(entry.findingId)
        store.pushRedo(entry)
        toast.success(`Undone: ${entry.description}`)
        announce(`Undone: ${entry.description}`)
        return
      }

      if (entry.action === 'delete' && entry.findingSnapshot) {
        const result = await undoDeleteFinding({
          snapshot: entry.findingSnapshot,
          fileId,
          projectId,
        })
        if (!result.success) {
          store.pushUndo(entry)
          if (result.code === 'FK_VIOLATION') {
            toast.error(result.error)
          } else {
            toast.error(`Undo failed: ${result.error}`)
          }
          return
        }
        store.pushRedo(entry)
        toast.success(`Undone: ${entry.description}`)
        announce(`Undone: ${entry.description}`)
        return
      }

      if (entry.type === 'bulk') {
        // Check for stale findings in the entry
        const findingInputs = [...entry.previousStates.entries()].map(([fId, prevState]) => ({
          findingId: fId,
          previousState: prevState,
          expectedCurrentState: entry.newStates.get(fId) ?? prevState,
        }))

        const result = await undoBulkAction({
          findings: findingInputs,
          fileId,
          projectId,
          force: false,
        })
        if (!result.success) {
          store.pushUndo(entry)
          toast.error(`Undo failed: ${result.error}`)
          return
        }

        // Optimistic update store for reverted findings
        for (const fId of result.data.reverted) {
          const finding = store.findingsMap.get(fId)
          const prevState = entry.previousStates.get(fId)
          if (finding && prevState) {
            store.setFinding(fId, { ...finding, status: prevState })
          }
        }

        store.pushRedo(entry)
        if (result.data.conflicted.length > 0) {
          toast.warning(
            `Partially undone: ${result.data.reverted.length}/${findingInputs.length} findings (${result.data.conflicted.length} conflicts)`,
          )
        } else {
          toast.success(`Undone: ${entry.description}`)
        }
        announce(`Undone: ${entry.description}`)
        return
      }

      // Default: single status revert
      if (!entry.findingId) {
        store.pushUndo(entry)
        return
      }

      // Check if stale
      if (entry.staleFindings.has(entry.findingId)) {
        const finding = store.findingsMap.get(entry.findingId)
        onConflict(entry, entry.findingId, finding?.status ?? 'unknown')
        // Don't push back to undo — conflict handler decides
        return
      }

      const prevState = entry.previousStates.get(entry.findingId)
      const expectedState = entry.newStates.get(entry.findingId)
      if (!prevState || !expectedState) {
        store.pushUndo(entry)
        return
      }

      // Optimistic revert
      const finding = store.findingsMap.get(entry.findingId)
      if (finding) {
        store.setFinding(entry.findingId, {
          ...finding,
          status: prevState,
          updatedAt: new Date().toISOString(),
        })
      }

      const result = await undoAction({
        findingId: entry.findingId,
        fileId,
        projectId,
        previousState: prevState,
        expectedCurrentState: expectedState,
        force: false,
      })

      if (!result.success) {
        // Rollback optimistic
        if (finding) {
          store.setFinding(entry.findingId, finding)
        }
        if (result.code === 'CONFLICT') {
          onConflict(entry, entry.findingId, finding?.status ?? 'unknown')
        } else {
          toast.error(`Undo failed: ${result.error}`)
          store.pushUndo(entry)
        }
        return
      }

      // Sync server timestamp
      if (result.data.serverUpdatedAt) {
        const currentFinding = store.findingsMap.get(entry.findingId)
        if (currentFinding) {
          store.setFinding(entry.findingId, {
            ...currentFinding,
            updatedAt: result.data.serverUpdatedAt,
          })
        }
      }

      store.pushRedo(entry)
      toast.success(`Undone: ${entry.description}`)
      announce(`Undone: ${entry.description}`)
    } catch {
      toast.error('Undo failed unexpectedly')
      // Re-push entry so user can retry
      useReviewStore.getState().pushUndo(entry)
    } finally {
      inFlightRef.current = false
    }
  }, [fileId, projectId, onConflict])

  const performRedo = useCallback(async () => {
    if (inFlightRef.current) return
    const store = useReviewStore.getState()
    const entry = store.popRedo()
    if (!entry) return

    inFlightRef.current = true
    try {
      // Branch by action type (mirror of undo)
      if (entry.action === 'severity_override' && entry.findingId && entry.newSeverity) {
        const result = await overrideSeverity({
          findingId: entry.findingId,
          fileId,
          projectId,
          newSeverity: entry.newSeverity,
        })
        if (!result.success) {
          store.pushRedo(entry)
          toast.error(`Redo failed: ${result.error}`)
          return
        }
        store.pushUndo(entry)
        toast.success(`Redone: ${entry.description}`)
        announce(`Redone: ${entry.description}`)
        return
      }

      if (entry.action === 'add' && entry.findingSnapshot) {
        // Re-add: use addFinding with snapshot data
        const snap = entry.findingSnapshot
        const result = await addFinding({
          fileId: snap.fileId,
          projectId: snap.projectId,
          segmentId: snap.segmentId ?? '',
          category: snap.category,
          severity: snap.severity,
          description: snap.description,
          suggestion: snap.suggestedFix,
        })
        if (!result.success) {
          store.pushRedo(entry)
          toast.error(`Redo failed: ${result.error}`)
          return
        }
        store.pushUndo(entry)
        toast.success(`Redone: ${entry.description}`)
        announce(`Redone: ${entry.description}`)
        return
      }

      if (entry.action === 'delete' && entry.findingId) {
        const result = await deleteFinding({
          findingId: entry.findingId,
          fileId,
          projectId,
        })
        if (!result.success) {
          store.pushRedo(entry)
          toast.error(`Redo failed: ${result.error}`)
          return
        }
        store.removeFinding(entry.findingId)
        store.pushUndo(entry)
        toast.success(`Redone: ${entry.description}`)
        announce(`Redone: ${entry.description}`)
        return
      }

      if (entry.type === 'bulk') {
        const findingInputs = [...entry.newStates.entries()].map(([fId, targetState]) => ({
          findingId: fId,
          targetState,
          expectedCurrentState: entry.previousStates.get(fId) ?? targetState,
        }))

        const result = await redoBulkAction({ findings: findingInputs, fileId, projectId })
        if (!result.success) {
          store.pushRedo(entry)
          toast.error(`Redo failed: ${result.error}`)
          return
        }

        for (const fId of result.data.reverted) {
          const f = store.findingsMap.get(fId)
          const targetState = entry.newStates.get(fId)
          if (f && targetState) {
            store.setFinding(fId, { ...f, status: targetState })
          }
        }

        store.pushUndo(entry)
        toast.success(`Redone: ${entry.description}`)
        announce(`Redone: ${entry.description}`)
        return
      }

      // Default: single status redo
      if (!entry.findingId) {
        store.pushRedo(entry)
        return
      }

      const targetState = entry.newStates.get(entry.findingId)
      const expectedState = entry.previousStates.get(entry.findingId)
      if (!targetState || !expectedState) {
        store.pushRedo(entry)
        return
      }

      const result = await redoAction({
        findingId: entry.findingId,
        fileId,
        projectId,
        targetState,
        expectedCurrentState: expectedState,
      })

      if (!result.success) {
        store.pushRedo(entry)
        toast.error(`Redo failed: ${result.error}`)
        return
      }

      // Update store
      const finding = store.findingsMap.get(entry.findingId)
      if (finding) {
        store.setFinding(entry.findingId, {
          ...finding,
          status: targetState,
          updatedAt: result.data.serverUpdatedAt,
        })
      }

      store.pushUndo(entry)
      toast.success(`Redone: ${entry.description}`)
      announce(`Redone: ${entry.description}`)
    } catch {
      toast.error('Redo failed unexpectedly')
      useReviewStore.getState().pushRedo(entry)
    } finally {
      inFlightRef.current = false
    }
  }, [fileId, projectId])

  /** Force undo a conflicted entry (from ConflictDialog) */
  const forceUndo = useCallback(
    async (entry: UndoEntry) => {
      if (!entry.findingId) return
      const prevState = entry.previousStates.get(entry.findingId)
      const expectedState = entry.newStates.get(entry.findingId)
      if (!prevState || !expectedState) return

      const result = await undoAction({
        findingId: entry.findingId,
        fileId,
        projectId,
        previousState: prevState,
        expectedCurrentState: expectedState,
        force: true,
      })

      if (result.success) {
        const store = useReviewStore.getState()
        const finding = store.findingsMap.get(entry.findingId)
        if (finding) {
          store.setFinding(entry.findingId, {
            ...finding,
            status: prevState,
            updatedAt: result.data.serverUpdatedAt,
          })
        }
        toast.success(`Undone: ${entry.description} (forced)`)
        announce(`Undone: ${entry.description}`)
      } else {
        toast.error(`Force undo failed: ${result.error}`)
      }
    },
    [fileId, projectId],
  )

  return { performUndo, performRedo, forceUndo }
}
