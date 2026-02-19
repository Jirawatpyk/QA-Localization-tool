'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createTerm } from '@/features/glossary/actions/createTerm.action'
import { updateTerm } from '@/features/glossary/actions/updateTerm.action'

type Term = {
  id: string
  sourceTerm: string
  targetTerm: string
  caseSensitive: boolean
}

type TermEditDialogProps = {
  mode: 'create' | 'edit'
  glossaryId: string
  term?: Term
  onClose: () => void
  onSaved: () => void
}

export function TermEditDialog({ mode, glossaryId, term, onClose, onSaved }: TermEditDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [caseSensitive, setCaseSensitive] = useState(term?.caseSensitive ?? false)

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const sourceTerm = formData.get('sourceTerm') as string
    const targetTerm = formData.get('targetTerm') as string

    startTransition(async () => {
      if (mode === 'create') {
        const result = await createTerm({
          glossaryId,
          sourceTerm,
          targetTerm,
          caseSensitive,
        })
        if (result.success) {
          toast.success('Term created')
          onSaved()
        } else {
          toast.error(result.error)
        }
      } else if (term) {
        const result = await updateTerm(term.id, {
          sourceTerm,
          targetTerm,
          caseSensitive,
        })
        if (result.success) {
          toast.success('Term updated')
          onSaved()
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={mode === 'create' ? 'Add term' : 'Edit term'}>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add Term' : 'Edit Term'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="source-term">
              Source Term <span className="text-destructive">*</span>
            </Label>
            <Input
              id="source-term"
              name="sourceTerm"
              defaultValue={term?.sourceTerm ?? ''}
              maxLength={500}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-term">
              Target Term <span className="text-destructive">*</span>
            </Label>
            <Input
              id="target-term"
              name="targetTerm"
              defaultValue={term?.targetTerm ?? ''}
              maxLength={500}
              required
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={caseSensitive}
              onCheckedChange={(checked) => setCaseSensitive(checked === true)}
            />
            Case sensitive
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? mode === 'create'
                  ? 'Creating...'
                  : 'Saving...'
                : mode === 'create'
                  ? 'Add Term'
                  : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
