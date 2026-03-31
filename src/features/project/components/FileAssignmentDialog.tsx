'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { assignFile } from '@/features/project/actions/assignFile.action'
import { getEligibleReviewers } from '@/features/project/actions/getEligibleReviewers.action'
import type { ReviewerOption } from '@/features/project/actions/getEligibleReviewers.action'
import { ReviewerSelector } from '@/features/project/components/ReviewerSelector'
import type { FileAssignmentPriority } from '@/types/assignment'

type FileAssignmentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileId: string
  fileName: string
  projectId: string
  targetLanguage: string
  onAssigned?: (() => void) | undefined
}

export function FileAssignmentDialog({
  open,
  onOpenChange,
  fileId,
  fileName,
  projectId,
  targetLanguage,
  onAssigned,
}: FileAssignmentDialogProps) {
  const [reviewers, setReviewers] = useState<ReviewerOption[]>([])
  const [selectedReviewer, setSelectedReviewer] = useState<string | null>(null)
  const [priority, setPriority] = useState<FileAssignmentPriority>('normal')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Reset form state on re-open (Guardrail #21 — render-time adjustment pattern)
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) {
      setSelectedReviewer(null)
      setPriority('normal')
      setNotes('')
      setError(null)
      setReviewers([])
    }
  }

  // Fetch eligible reviewers when dialog opens
  useEffect(() => {
    if (!open) return

    startTransition(async () => {
      const result = await getEligibleReviewers({ projectId, targetLanguage })
      if (result.success) {
        setReviewers(result.data)
        // Auto-select the suggested reviewer
        const suggested = result.data.find((r) => r.isAutoSuggested)
        if (suggested) {
          setSelectedReviewer(suggested.userId)
        }
      } else {
        setError(result.error)
      }
    })
  }, [open, projectId, targetLanguage])

  function handleAssign() {
    if (!selectedReviewer) return

    startTransition(async () => {
      const result = await assignFile({
        fileId,
        projectId,
        assignedTo: selectedReviewer,
        priority,
        notes: notes.trim() || null,
      })

      if (result.success) {
        toast.success(`File assigned successfully`)
        onOpenChange(false)
        onAssigned?.()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-modal="true" data-testid="file-assignment-dialog">
        <DialogHeader>
          <DialogTitle>Assign File</DialogTitle>
          <DialogDescription>
            Assign &quot;{fileName}&quot; to a reviewer with matching language expertise.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reviewer selection */}
          <div className="space-y-2">
            <Label>Reviewer</Label>
            <ReviewerSelector
              reviewers={reviewers}
              value={selectedReviewer}
              onValueChange={setSelectedReviewer}
              disabled={isPending}
            />
          </div>

          {/* Priority selection */}
          <div className="space-y-2">
            <Label>Priority</Label>
            <RadioGroup
              value={priority}
              onValueChange={(v) => setPriority(v as FileAssignmentPriority)}
              className="flex gap-4"
              disabled={isPending}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="normal" id="priority-normal" />
                <Label htmlFor="priority-normal">Normal</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="urgent" id="priority-urgent" />
                <Label htmlFor="priority-urgent" className="text-destructive">
                  Urgent
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="assignment-notes">Notes (optional)</Label>
            <Textarea
              id="assignment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any instructions for the reviewer..."
              maxLength={500}
              disabled={isPending}
            />
          </div>

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={!selectedReviewer || isPending}>
            {isPending ? 'Assigning...' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
