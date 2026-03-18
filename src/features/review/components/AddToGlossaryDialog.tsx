'use client'

import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { addToGlossary } from '@/features/review/actions/addToGlossary.action'
import { updateGlossaryTerm } from '@/features/review/actions/updateGlossaryTerm.action'
import type { FindingForDisplay } from '@/features/review/types'

type AddToGlossaryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  finding: FindingForDisplay
  sourceLang: string
  targetLang: string
  projectId: string
}

type DuplicateInfo = {
  existingTermId: string
  existingTarget: string
}

export function AddToGlossaryDialog({
  open,
  onOpenChange,
  finding,
  sourceLang,
  targetLang,
  projectId,
}: AddToGlossaryDialogProps) {
  const triggerRef = useRef<HTMLElement | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const [isPending, startTransition] = useTransition()
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)

  // Guardrail #11: Reset form state on re-open
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null
      setCaseSensitive(false) // eslint-disable-line react-hooks/set-state-in-effect -- Guardrail #11: dialog state reset on re-open
      setDuplicate(null)
      setShowSuccess(false)
    }
  }, [open])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const submittedSource = formData.get('sourceTerm') as string
    const submittedTarget = formData.get('targetTerm') as string
    const submittedNotes = formData.get('notes') as string

    startTransition(async () => {
      const result = await addToGlossary({
        findingId: finding.id,
        projectId,
        sourceLang,
        targetLang,
        sourceTerm: submittedSource,
        targetTerm: submittedTarget,
        notes: submittedNotes || undefined,
        caseSensitive,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      if (result.data.created) {
        toast.success(
          `Added to glossary: '${result.data.sourceTerm}' → '${result.data.targetTerm}'`,
        )
        setShowSuccess(true)
      } else {
        // Duplicate detected — show warning inline
        setDuplicate({
          existingTermId: result.data.existingTermId,
          existingTarget: result.data.existingTarget,
        })
      }
    })
  }

  function handleUpdateExisting() {
    if (!duplicate) return
    if (!formRef.current) return // CR-R1 L2: guard against null ref — don't silently send ''

    const submittedTarget = new FormData(formRef.current).get('targetTerm') as string

    startTransition(async () => {
      const result = await updateGlossaryTerm({
        termId: duplicate.existingTermId,
        targetTerm: submittedTarget,
        projectId,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(`Updated glossary term: target → '${result.data.targetTerm}'`)
      setShowSuccess(true)
      setDuplicate(null)
    })
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      onOpenChange(false)
      // Guardrail #30: restore focus on close
      requestAnimationFrame(() => {
        triggerRef.current?.focus()
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="add-to-glossary-dialog" aria-modal="true" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Glossary</DialogTitle>
          <DialogDescription>
            Add this term to the project glossary ({sourceLang} → {targetLang}).
          </DialogDescription>
        </DialogHeader>

        {showSuccess ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              New glossary term will apply to future QA runs.
            </p>
            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
              >
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="atg-source-term">
                Source Term <span className="text-destructive">*</span>
              </Label>
              <Input
                id="atg-source-term"
                name="sourceTerm"
                defaultValue={finding.sourceTextExcerpt ?? ''}
                maxLength={500}
                required
                onChange={() => {
                  if (duplicate) setDuplicate(null)
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="atg-target-term">
                Target Term <span className="text-destructive">*</span>
              </Label>
              <Input
                id="atg-target-term"
                name="targetTerm"
                defaultValue={finding.suggestedFix ?? ''}
                maxLength={500}
                required
              />
            </div>

            {/* Language pair — read-only display */}
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Language Pair</Label>
              <p className="text-sm">
                {sourceLang} → {targetLang}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="atg-notes">Notes (optional)</Label>
              <Textarea
                id="atg-notes"
                name="notes"
                maxLength={1000}
                rows={2}
                placeholder="Additional context for this glossary entry..."
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={caseSensitive}
                onCheckedChange={(checked) => setCaseSensitive(checked === true)}
              />
              Case sensitive
            </label>

            {/* Duplicate warning */}
            {duplicate && (
              <div
                className="rounded border border-warning/30 bg-warning/10 p-3 space-y-2"
                role="alert"
              >
                <p className="text-sm font-medium text-warning-foreground">
                  Term &ldquo;{finding.sourceTextExcerpt}&rdquo; already exists with target: &ldquo;
                  {duplicate.existingTarget}&rdquo;
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleUpdateExisting}
                    disabled={isPending}
                    className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
                  >
                    {isPending ? 'Updating...' : 'Update existing'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDuplicate(null)}
                    className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!duplicate && (
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
                >
                  {isPending ? 'Adding...' : 'Add Term'}
                </Button>
              </DialogFooter>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
