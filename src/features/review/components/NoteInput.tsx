'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const MAX_NOTE_LENGTH = 500

type NoteInputProps = {
  open: boolean
  onSubmit: (noteText: string) => void
  onDismiss: () => void
}

/**
 * NoteInput — inline popover for adding/editing note text on a finding.
 * Opens below the action bar when a noted finding is pressed with N again.
 * Guardrail #11: resets form on re-open.
 * Guardrail #27: focus indicator 2px indigo, 4px offset.
 */
export function NoteInput({ open, onSubmit, onDismiss }: NoteInputProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Guardrail #11: reset form state on re-open (React 19 "adjust state during render" pattern)
  const [prevOpen, setPrevOpen] = useState(false)
  if (open && !prevOpen) {
    setPrevOpen(true)
    setText('')
  } else if (!open && prevOpen) {
    setPrevOpen(false)
  }

  // Focus textarea when popover opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
      })
    }
  }, [open])

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (trimmed.length > 0) {
      onSubmit(trimmed)
    }
  }, [text, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation() // Guardrail #31: one layer per Esc
        onDismiss()
      }
    },
    [handleSubmit, onDismiss],
  )

  if (!open) {
    return null
  }

  const charsRemaining = MAX_NOTE_LENGTH - text.length

  return (
    <div
      data-testid="note-input-popover"
      className="mt-2 rounded-lg border bg-popover p-3 shadow-md"
      role="dialog"
      aria-label="Add note text"
      aria-modal="true"
      onKeyDown={(e) => {
        // M2 fix: Esc at container level closes popover (Guardrail #30/31)
        if (e.key === 'Escape') {
          e.stopPropagation()
          onDismiss()
        }
        // M2 fix: Tab trap — keep focus within popover (Guardrail #30)
        if (e.key === 'Tab') {
          const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
            'textarea, button:not([disabled])',
          )
          if (focusable.length === 0) return
          const first = focusable[0]!
          const last = focusable[focusable.length - 1]!
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }}
    >
      <div className="space-y-2">
        <label htmlFor="note-text-field" className="text-sm font-medium">
          Note (optional comment)
        </label>
        <Textarea
          ref={textareaRef}
          id="note-text-field"
          data-testid="note-text-field"
          value={text}
          onChange={(e) => {
            if (e.target.value.length <= MAX_NOTE_LENGTH) {
              setText(e.target.value)
            }
          }}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="Add a note about this finding... (Enter to save, Shift+Enter for newline)"
          onKeyDown={handleKeyDown}
          className="min-h-20 resize-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
          rows={3}
        />
        <div className="flex items-center justify-between">
          <span
            className={`text-xs ${charsRemaining < 50 ? 'text-warning-foreground' : 'text-muted-foreground'}`}
          >
            {charsRemaining} characters remaining
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={text.trim().length === 0}
              data-testid="note-save-button"
              className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            >
              Save Note
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
