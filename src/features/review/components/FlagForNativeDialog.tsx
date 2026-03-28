'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
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
  onSuccess?: () => void
}

export function FlagForNativeDialog({
  open,
  onOpenChange,
  findingId,
  fileId,
  projectId,
  onSuccess,
}: FlagForNativeDialogProps) {
  const [reviewers, setReviewers] = useState<NativeReviewer[]>([])
  const [selectedReviewer, setSelectedReviewer] = useState('')
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingReviewers, startLoadTransition] = useTransition()
  const mountedRef = useRef(false)

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
    mountedRef.current = true
    if (open) {
      startLoadTransition(async () => {
        const result = await getNativeReviewers()
        if (mountedRef.current && result.success) {
          setReviewers(result.data)
        }
      })
    }
    return () => {
      mountedRef.current = false
    }
  }, [open])

  const isValid =
    selectedReviewer.length > 0 && comment.length >= COMMENT_MIN && comment.length <= COMMENT_MAX

  const handleSubmit = useCallback(async () => {
    if (!isValid || isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    const result = await flagForNative({
      findingId,
      fileId,
      projectId,
      assignedTo: selectedReviewer,
      flaggerComment: comment,
    })

    setIsSubmitting(false)

    if (result.success) {
      toast.success('Finding flagged for native review')
      onOpenChange(false)
      onSuccess?.()
    } else {
      setError(result.error)
    }
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
