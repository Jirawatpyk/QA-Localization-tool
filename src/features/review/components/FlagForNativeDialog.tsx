'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { flagForNative } from '@/features/review/actions/flagForNative.action'
import { getNativeReviewers } from '@/features/review/actions/getNativeReviewers.action'
import { useGuardedAction } from '@/features/review/hooks/use-guarded-action'

const COMMENT_MIN = 10
const COMMENT_MAX = 500

type NativeReviewer = {
  id: string
  displayName: string
  nativeLanguages: string[]
}

type FlagForNativeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  findingId: string
  fileId: string
  projectId: string
  onSuccess?: (data: {
    assignmentId: string
    assignedToName: string
    flaggerComment: string
  }) => void
}

export function FlagForNativeDialog({
  open,
  onOpenChange,
  findingId,
  fileId,
  projectId,
  onSuccess,
}: FlagForNativeDialogProps) {
  // R4.5: useGuardedAction encapsulates read-only/inflight/selfAssign/try-catch
  // — replaces the R3-H5 + R4-H2 inline pattern with the unified helper
  const guardedAction = useGuardedAction()
  const [reviewers, setReviewers] = useState<NativeReviewer[]>([])
  const [selectedReviewer, setSelectedReviewer] = useState('')
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingReviewers, startLoadTransition] = useTransition()
  // Guardrail #11: Reset form on re-open
  // Use prev-compare pattern to avoid setState in effect (React Compiler)
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) {
      setSelectedReviewer('')
      setComment('')
      setError(null)
      setIsSubmitting(false)
    }
  }

  // Load reviewers when dialog opens
  useEffect(() => {
    if (!open) return
    let cancelled = false
    startLoadTransition(async () => {
      const result = await getNativeReviewers()
      if (!cancelled && result.success) {
        setReviewers(result.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const isValid =
    selectedReviewer.length > 0 && comment.length >= COMMENT_MIN && comment.length <= COMMENT_MAX

  const handleSubmit = useCallback(async () => {
    if (!isValid || isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    // R5-M2: track whether the inner action already set an inline error so we
    // can distinguish "server validation failed" (specific error shown) from
    // "generic outcome failure" (generic fallback).
    let handledInline = false

    const outcome = await guardedAction('flag for native review', fileId, projectId, async () => {
      const result = await flagForNative({
        findingId,
        fileId,
        projectId,
        assignedTo: selectedReviewer,
        flaggerComment: comment,
      })

      if (result.success) {
        toast.success('Finding flagged for native review')
        onOpenChange(false)
        // CR-M4: pass assignment data back for store merge
        const reviewerName = reviewers.find((r) => r.id === selectedReviewer)?.displayName ?? ''
        onSuccess?.({
          // CR-R2 P0-1: use real assignmentId from server response
          assignmentId:
            ((result.data as Record<string, unknown>).assignmentId as string) ??
            result.data.findingId,
          assignedToName: reviewerName,
          flaggerComment: comment,
        })
      } else {
        // R5-M2: set inline error with the specific message from the server
        // and DO NOT throw — throwing triggered guardedAction's generic toast
        // on top of our inline error, giving the user two conflicting messages.
        setError(result.error)
        handledInline = true
      }
    })

    setIsSubmitting(false)

    // R5-M2: surface dialog-level feedback for EVERY non-success outcome that
    // didn't already set an inline error, not just 'conflict'. Readonly and
    // in-flight should be rare (the dialog's outer `disabled` + isValid guard
    // catches most) but if they slip through, give the user feedback.
    if (handledInline) return
    if (outcome === 'conflict') {
      setError('File is now being reviewed by another user')
    } else if (outcome === 'readonly') {
      setError('Cannot flag while in read-only mode')
    } else if (outcome === 'error') {
      setError('Failed to acquire lock — please try again')
    } else if (outcome === 'threw') {
      setError('Unexpected error — please try again')
    }
    // 'in-flight' and 'ran' need no inline error
  }, [
    isValid,
    isSubmitting,
    findingId,
    fileId,
    projectId,
    selectedReviewer,
    comment,
    onOpenChange,
    onSuccess,
    reviewers,
    guardedAction,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-modal="true">
        <DialogHeader>
          <DialogTitle>Flag for Native Review</DialogTitle>
          <DialogDescription>
            Select a native reviewer and explain why this finding needs native language review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reviewer-select">Native Reviewer</Label>
            <Select value={selectedReviewer} onValueChange={setSelectedReviewer}>
              <SelectTrigger id="reviewer-select">
                <SelectValue placeholder={isLoadingReviewers ? 'Loading...' : 'Select reviewer'} />
              </SelectTrigger>
              <SelectContent>
                {reviewers.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.displayName} ({r.nativeLanguages.join(', ')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="flag-comment">
              Why does this need native review? ({comment.length}/{COMMENT_MAX})
            </Label>
            <Textarea
              id="flag-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Explain why native review is needed (10-500 characters)"
              minLength={COMMENT_MIN}
              maxLength={COMMENT_MAX}
              rows={3}
            />
            {comment.length > 0 && comment.length < COMMENT_MIN && (
              <p className="text-sm text-destructive">
                Minimum {COMMENT_MIN} characters required ({COMMENT_MIN - comment.length} more)
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Flagging...' : 'Flag for Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
