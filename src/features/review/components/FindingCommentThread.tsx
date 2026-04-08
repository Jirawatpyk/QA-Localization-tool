'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { addFindingComment } from '@/features/review/actions/addFindingComment.action'
import { getFindingComments } from '@/features/review/actions/getFindingComments.action'
import { useReadOnlyMode } from '@/features/review/hooks/use-read-only-mode'

const BODY_MIN = 1
const BODY_MAX = 1000

type Comment = {
  id: string
  authorId: string
  authorName: string
  authorRole: string
  body: string
  createdAt: string
}

type FindingCommentThreadProps = {
  findingId: string
  findingAssignmentId: string
  flaggerComment?: string | null | undefined
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  qa_reviewer: 'QA',
  native_reviewer: 'Native',
}

export function FindingCommentThread({
  findingId,
  findingAssignmentId,
  flaggerComment,
}: FindingCommentThreadProps) {
  // R3-M6: AC6 gap — FindingCommentThread was never wired to read-only context.
  // Server-side assertLockOwnership catches the mutation, but UX spec requires
  // the UI to silently disable input in read-only mode.
  const isReadOnly = useReadOnlyMode()
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingComments, startLoadTransition] = useTransition()

  // Load comments on mount + when assignmentId changes
  useEffect(() => {
    let cancelled = false
    startLoadTransition(async () => {
      const result = await getFindingComments(findingAssignmentId)
      if (!cancelled && result.success) {
        setComments(result.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [findingAssignmentId])

  const handleSubmit = useCallback(async () => {
    if (isReadOnly) return // R3-M6: read-only guard
    if (newComment.length < BODY_MIN || newComment.length > BODY_MAX || isSubmitting) return

    setIsSubmitting(true)

    const result = await addFindingComment({
      findingId,
      findingAssignmentId,
      body: newComment,
    })

    setIsSubmitting(false)

    if (result.success) {
      // Append to list + clear input
      setComments((prev) => [
        ...prev,
        {
          id: result.data.commentId,
          authorId: '',
          authorName: 'You',
          authorRole: '',
          body: newComment,
          createdAt: result.data.createdAt,
        },
      ])
      setNewComment('')
      toast.success('Comment added')
    } else {
      toast.error(result.error)
    }
  }, [findingId, findingAssignmentId, newComment, isSubmitting, isReadOnly])

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Comments</h4>

      {/* Flagger's original comment */}
      {flaggerComment && (
        <div className="rounded-md border bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground">Flagging reason:</p>
          <p className="text-sm" lang="en">
            {flaggerComment}
          </p>
        </div>
      )}

      {/* Comment list — aria-live for new comments */}
      <div className="space-y-2" aria-live="polite">
        {isLoadingComments && <p className="text-sm text-muted-foreground">Loading comments...</p>}
        {!isLoadingComments && comments.length === 0 && (
          <p className="text-sm text-muted-foreground">No comments yet</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="rounded-md border p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{c.authorName}</span>
              {c.authorRole && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {ROLE_LABELS[c.authorRole] ?? c.authorRole}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {new Date(c.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="mt-1 text-sm" lang="en">
              {c.body}
            </p>
          </div>
        ))}
      </div>

      {/* Add comment */}
      <div className="space-y-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={
            isReadOnly ? 'Comments disabled in read-only mode' : 'Add a comment (1-1000 characters)'
          }
          maxLength={BODY_MAX}
          disabled={isReadOnly}
          rows={2}
        />
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={newComment.length < BODY_MIN || isSubmitting || isReadOnly}
        >
          {isSubmitting ? 'Sending...' : 'Add Comment'}
        </Button>
      </div>
    </div>
  )
}
