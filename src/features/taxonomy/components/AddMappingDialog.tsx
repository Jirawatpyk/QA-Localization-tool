'use client'

import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Severity } from '@/features/taxonomy/types'
import { severityValues } from '@/features/taxonomy/validation/taxonomySchemas'

type SubmitInput = {
  category: string
  parentCategory?: string | null
  internalName: string
  severity: Severity
  description: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: SubmitInput) => void
}

const EMPTY_FORM = {
  category: '',
  parentCategory: '',
  internalName: '',
  severity: 'minor' as Severity,
  description: '',
}

export function AddMappingDialog({ open, onOpenChange, onSubmit }: Props) {
  const [form, setForm] = useState(EMPTY_FORM)

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSubmit({
      category: form.category,
      parentCategory: form.parentCategory || null,
      internalName: form.internalName,
      severity: form.severity,
      description: form.description,
    })
    setForm(EMPTY_FORM)
  }

  function handleChange(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="add-mapping-dialog">
        <DialogHeader>
          <DialogTitle>Add Taxonomy Mapping</DialogTitle>
          <DialogDescription>
            Map a QA Cosmetic term to an MQM category for the QA engine.
          </DialogDescription>
        </DialogHeader>

        <form id="add-mapping-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="internalName">QA Cosmetic Term *</Label>
            <Input
              id="internalName"
              data-testid="internal-name-input"
              value={form.internalName}
              onChange={(e) => handleChange('internalName', e.target.value)}
              placeholder="e.g. Missing text"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category">MQM Category *</Label>
            <Input
              id="category"
              data-testid="mqm-category-input"
              value={form.category}
              onChange={(e) => handleChange('category', e.target.value)}
              placeholder="e.g. Accuracy"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="parentCategory">MQM Parent Category</Label>
            <Input
              id="parentCategory"
              value={form.parentCategory}
              onChange={(e) => handleChange('parentCategory', e.target.value)}
              placeholder="e.g. Omission (optional)"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="severity">Severity *</Label>
            <Select value={form.severity} onValueChange={(val) => handleChange('severity', val)}>
              <SelectTrigger id="severity" data-testid="severity-select">
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                {severityValues.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              data-testid="description-input"
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Brief explanation of when this error applies"
              required
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="add-mapping-form" type="submit" data-testid="submit-add-mapping">
            Add Mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
