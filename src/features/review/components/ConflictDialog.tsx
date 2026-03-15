'use client'

import { useEffect, useRef } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { UndoEntry } from '@/features/review/stores/review.store'

type ConflictDialogProps = {
  open: boolean
  entry: UndoEntry | null
  findingId: string | null
  currentState: string | null
  onForceUndo: () => void
  onCancel: () => void
}

export function ConflictDialog({
  open,
  entry,
  findingId,
  currentState,
  onForceUndo,
  onCancel,
}: ConflictDialogProps) {
  // Guardrail #30: Store trigger element ref for focus restore on close
  const triggerRef = useRef<Element | null>(null)

  // Guardrail #11: Reset state on re-open
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement
    }
  }, [open])

  // Focus restore on close (Guardrail #30)
  const handleClose = (handler: () => void) => {
    handler()
    // Restore focus after dialog closes
    requestAnimationFrame(() => {
      if (triggerRef.current && 'focus' in triggerRef.current) {
        ;(triggerRef.current as HTMLElement).focus()
      }
    })
  }

  const undoTargetState = entry?.findingId
    ? (entry.previousStates.get(entry.findingId) ?? 'unknown')
    : 'unknown'

  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose(onCancel)
      }}
    >
      <AlertDialogContent aria-live="assertive">
        <AlertDialogHeader>
          <AlertDialogTitle>Conflict Detected</AlertDialogTitle>
          <AlertDialogDescription>
            Finding {findingId ? `#${findingId.slice(0, 8)}` : ''} was modified by another user.
            Current state: <strong>{currentState}</strong>. Your undo would revert to:{' '}
            <strong>{undoTargetState}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => handleClose(onCancel)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handleClose(onForceUndo)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Undo Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
