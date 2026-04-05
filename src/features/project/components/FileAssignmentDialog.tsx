'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

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
import type { AppRole } from '@/lib/auth/getCurrentUser'
import type { FileAssignmentPriority } from '@/types/assignment'

type FileAssignmentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileId: string
  fileName: string
  projectId: string
  targetLanguage: string
  currentUserRole: AppRole
  onAssigned?: (() => void) | undefined
}

export function FileAssignmentDialog({
  open,
  onOpenChange,
  fileId,
  fileName,
  projectId,
  targetLanguage,
  currentUserRole,
  onAssigned,
}: FileAssignmentDialogProps) {
  const [reviewers, setReviewers] = useState<ReviewerOption[]>([])
  // R2-P7: dedicated flag for the primary fetch so the empty-state flash can
  // be suppressed independently of the shared `useTransition` isPending.
  const [reviewersLoading, setReviewersLoading] = useState(false)
  const [fallbackReviewers, setFallbackReviewers] = useState<ReviewerOption[] | null>(null)
  const [fallbackLoading, setFallbackLoading] = useState(false)
  const [selectedReviewer, setSelectedReviewer] = useState<string | null>(null)
  const [priority, setPriority] = useState<FileAssignmentPriority>('normal')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmUnmatchedOpen, setConfirmUnmatchedOpen] = useState(false)

  // Generation counter for the fallback fetch — bumped whenever we start a new
  // fetch or need to invalidate an in-flight one (dialog close, targetLanguage change).
  // Resolutions from stale generations are ignored to prevent setState-on-unmounted
  // and cross-language data bleeding.
  const fallbackGenRef = useRef(0)

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
      setFallbackReviewers(null)
      setFallbackLoading(false)
      setReviewersLoading(false)
      setConfirmUnmatchedOpen(false)
    } else {
      // Dialog closing — invalidate any in-flight fallback fetch so a late
      // resolution doesn't land on a closed-then-reopened dialog.
      fallbackGenRef.current += 1
    }
  }

  // Clear fallback state whenever the target language changes mid-dialog. Without
  // this, a user switching files inside an open dialog would see reviewers from
  // the PREVIOUS language still shown in the "Show all" list, producing a wrong
  // language in the "Assign anyway?" confirmation.
  //
  // R2-P4: also clear `selectedReviewer` — otherwise a reviewer chosen from the
  // OLD fallback list would still be held in state; when the user clicks Assign,
  // `fallbackReviewers?.find(...)` returns undefined (fallback is now null), the
  // unmatched-confirmation AlertDialog is silently SKIPPED, and `performAssign`
  // runs for a reviewer who was never validated against the new language.
  useEffect(() => {
    fallbackGenRef.current += 1
    setFallbackReviewers(null)
    setFallbackLoading(false)
    setSelectedReviewer(null)
  }, [targetLanguage])

  // Fetch eligible reviewers when dialog opens
  useEffect(() => {
    if (!open) return
    // R2-P5: short-circuit when targetLanguage is missing/too short. The Zod
    // schema enforces `min(2)`, so firing the action with empty string would
    // display a raw Zod error to the user. The File cell passes `targetLanguage
    // ?? ''`, so empty is reachable for files without a language.
    if (!targetLanguage || targetLanguage.length < 2) return
    let aborted = false
    setReviewersLoading(true)

    startTransition(async () => {
      try {
        const result = await getEligibleReviewers({ targetLanguage })
        if (aborted) return
        if (result.success) {
          setReviewers(result.data)
          // Auto-select only when user hasn't manually selected yet
          const suggested = result.data.find((r) => r.isAutoSuggested)
          if (suggested && !selectedReviewer) {
            setSelectedReviewer(suggested.userId)
          }
        } else {
          setError(result.error)
        }
      } finally {
        if (!aborted) setReviewersLoading(false)
      }
    })

    return () => {
      aborted = true
    }
  }, [open, targetLanguage]) // eslint-disable-line react-hooks/exhaustive-deps -- selectedReviewer excluded intentionally

  async function handleLoadFallback() {
    if (fallbackReviewers || fallbackLoading) return
    // R2-P5: empty targetLanguage would Zod-fail on the server; short-circuit.
    if (!targetLanguage || targetLanguage.length < 2) return
    const gen = ++fallbackGenRef.current
    setFallbackLoading(true)
    try {
      const result = await getEligibleReviewers({ targetLanguage, includeAll: true })
      // Drop stale results (dialog closed, targetLanguage changed, or superseded)
      if (gen !== fallbackGenRef.current) return
      if (result.success) {
        setFallbackReviewers(result.data)
      } else {
        setError(result.error)
      }
    } finally {
      // Only the generation that started this fetch may clear the loading flag,
      // otherwise a superseded fetch would prematurely hide a fresh spinner.
      if (gen === fallbackGenRef.current) {
        setFallbackLoading(false)
      }
    }
  }

  function handleAssign() {
    if (!selectedReviewer) return

    // Check if selected reviewer is unmatched (came from fallback list)
    const fromFallback = fallbackReviewers?.find((r) => r.userId === selectedReviewer)
    if (fromFallback && !fromFallback.isLanguageMatch) {
      setConfirmUnmatchedOpen(true)
      return
    }
    performAssign()
  }

  function performAssign() {
    if (!selectedReviewer) return
    setConfirmUnmatchedOpen(false)

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
    <>
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
                fallbackReviewers={fallbackReviewers ?? undefined}
                fallbackLoading={fallbackLoading}
                isLoading={reviewersLoading}
                value={selectedReviewer}
                onValueChange={setSelectedReviewer}
                onLoadFallback={handleLoadFallback}
                disabled={isPending}
                targetLanguage={targetLanguage}
                isAdmin={currentUserRole === 'admin'}
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

      <AlertDialog open={confirmUnmatchedOpen} onOpenChange={setConfirmUnmatchedOpen}>
        <AlertDialogContent data-testid="confirm-unmatched-reviewer-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Assign unmatched reviewer?</AlertDialogTitle>
            <AlertDialogDescription>
              {targetLanguage
                ? `This reviewer is not assigned to ${targetLanguage}. Assign anyway?`
                : 'This reviewer is not a language match for this file. Assign anyway?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performAssign} data-testid="confirm-unmatched-assign">
              Assign anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
