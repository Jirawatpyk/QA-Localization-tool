'use client'

import { AlertTriangle, Info, XCircle } from 'lucide-react'
import { useCallback, useState } from 'react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { FindingSeverity } from '@/types/finding'
import { FINDING_SEVERITIES } from '@/types/finding'

const DESCRIPTION_MIN = 10
const DESCRIPTION_MAX = 1000
const SUGGESTION_MAX = 1000
const SOURCE_PREVIEW_MAX = 60

type SegmentOption = {
  id: string
  segmentNumber: number
  sourceText: string
}

type CategoryOption = {
  category: string
  parentCategory: string | null
}

type AddFindingFormData = {
  segmentId: string
  category: string
  severity: FindingSeverity
  description: string
  suggestion: string | null
}

type AddFindingDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  segments: SegmentOption[]
  categories: CategoryOption[]
  defaultSegmentId: string | null
  onSubmit: (data: AddFindingFormData) => void
}

/** Guardrail #36: icon shape + text + color per severity */
const SEVERITY_DISPLAY: Record<
  FindingSeverity,
  { icon: typeof XCircle; label: string; colorClass: string }
> = {
  critical: {
    icon: XCircle,
    label: 'Critical',
    colorClass: 'text-severity-critical',
  },
  major: {
    icon: AlertTriangle,
    label: 'Major',
    colorClass: 'text-severity-major',
  },
  minor: {
    icon: Info,
    label: 'Minor',
    colorClass: 'text-severity-minor',
  },
}

/** Truncate source text for segment selector display */
function truncateSourceText(text: string): string {
  if (text.length <= SOURCE_PREVIEW_MAX) {
    return text
  }
  return `${text.slice(0, SOURCE_PREVIEW_MAX - 1)}\u2026`
}

/** Format category label with optional parent prefix */
function formatCategoryLabel(category: string, parentCategory: string | null): string {
  if (parentCategory !== null) {
    return `${parentCategory} > ${category}`
  }
  return category
}

/**
 * AddFindingDialog — Dialog for manually adding findings to a file.
 * Uses shadcn Dialog with focus trap (Guardrail #30).
 * Guardrail #11: resets form on re-open.
 * Guardrail #27: focus indicators 2px indigo, 4px offset.
 * Guardrail #36: severity display with icon + text + color.
 */
export function AddFindingDialog({
  open,
  onOpenChange,
  segments,
  categories,
  defaultSegmentId,
  onSubmit,
}: AddFindingDialogProps) {
  const [segmentId, setSegmentId] = useState<string>('')
  const [category, setCategory] = useState<string>('')
  const [severity, setSeverity] = useState<FindingSeverity>('minor')
  const [description, setDescription] = useState('')
  const [suggestion, setSuggestion] = useState('')

  // Guardrail #11: reset form state on re-open
  // Use "adjust state during render" pattern (React 19) to avoid setState-in-effect lint error
  const [prevOpen, setPrevOpen] = useState(false)
  if (open && !prevOpen) {
    setPrevOpen(true)
    setSegmentId(defaultSegmentId ?? '')
    setCategory('')
    setSeverity('minor')
    setDescription('')
    setSuggestion('')
  } else if (!open && prevOpen) {
    setPrevOpen(false)
  }

  const descriptionLength = description.length
  const isDescriptionValid =
    descriptionLength >= DESCRIPTION_MIN && descriptionLength <= DESCRIPTION_MAX
  const isSuggestionValid = suggestion.length <= SUGGESTION_MAX
  const isFormValid =
    segmentId.length > 0 && category.length > 0 && isDescriptionValid && isSuggestionValid

  const handleSubmit = useCallback(() => {
    if (!isFormValid) return

    onSubmit({
      segmentId,
      category,
      severity,
      description: description.trim(),
      suggestion: suggestion.trim().length > 0 ? suggestion.trim() : null,
    })
  }, [isFormValid, segmentId, category, severity, description, suggestion, onSubmit])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="add-finding-dialog"
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Add Manual Finding</DialogTitle>
          <DialogDescription>
            Create a new finding for this file. Manual findings are marked as reviewer-added.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* H4 fix: Warning when segments/categories unavailable */}
          {(segments.length === 0 || categories.length === 0) && (
            <div
              className="rounded border border-warning-border bg-warning-light p-3 text-sm text-warning-foreground"
              role="alert"
            >
              <AlertTriangle className="inline h-4 w-4 mr-1" aria-hidden="true" />
              {segments.length === 0 && categories.length === 0
                ? 'Segment and category data unavailable. Cannot add finding.'
                : segments.length === 0
                  ? 'Segment data unavailable. Cannot select a segment.'
                  : 'Category data unavailable. Cannot select a category.'}
            </div>
          )}

          {/* Segment Selector */}
          <div className="space-y-2">
            <Label htmlFor="segment-selector">Segment</Label>
            <Select value={segmentId} onValueChange={setSegmentId}>
              <SelectTrigger
                id="segment-selector"
                data-testid="segment-selector"
                className="w-full focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
              >
                <SelectValue placeholder="Select a segment..." />
              </SelectTrigger>
              <SelectContent>
                {segments.map((seg) => (
                  <SelectItem key={seg.id} value={seg.id}>
                    #{seg.segmentNumber}: {truncateSourceText(seg.sourceText)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category Selector */}
          <div className="space-y-2">
            <Label htmlFor="category-selector">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger
                id="category-selector"
                data-testid="category-selector"
                className="w-full focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
              >
                <SelectValue placeholder="Select a category..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem
                    key={`${cat.parentCategory ?? ''}-${cat.category}`}
                    value={cat.category}
                  >
                    {formatCategoryLabel(cat.category, cat.parentCategory)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Severity Radio Group */}
          <div className="space-y-2">
            <Label>Severity</Label>
            <RadioGroup
              value={severity}
              onValueChange={(val) => {
                setSeverity(val as FindingSeverity)
              }}
              data-testid="severity-selector"
              className="flex gap-4"
            >
              {FINDING_SEVERITIES.map((sev) => {
                const config = SEVERITY_DISPLAY[sev]
                const Icon = config.icon

                return (
                  <div key={sev} className="flex items-center gap-2">
                    <RadioGroupItem
                      value={sev}
                      id={`severity-${sev}`}
                      className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
                    />
                    <Label
                      htmlFor={`severity-${sev}`}
                      className={`flex items-center gap-1 cursor-pointer ${config.colorClass}`}
                    >
                      {/* Guardrail #36: icon aria-hidden, text label is accessible name */}
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {config.label}
                    </Label>
                  </div>
                )
              })}
            </RadioGroup>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description-field">
              Description <span className="text-error">*</span>
            </Label>
            <Textarea
              id="description-field"
              data-testid="description-field"
              value={description}
              onChange={(e) => {
                if (e.target.value.length <= DESCRIPTION_MAX) {
                  setDescription(e.target.value)
                }
              }}
              maxLength={DESCRIPTION_MAX}
              placeholder="Describe the issue found (min 10 characters)..."
              className="min-h-24 resize-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
              rows={4}
              aria-invalid={descriptionLength > 0 && !isDescriptionValid}
              aria-describedby="description-help"
            />
            <p
              id="description-help"
              className={`text-xs ${descriptionLength > 0 && descriptionLength < DESCRIPTION_MIN ? 'text-error' : 'text-muted-foreground'}`}
            >
              {descriptionLength}/{DESCRIPTION_MAX} characters (min {DESCRIPTION_MIN})
            </p>
          </div>

          {/* Suggestion (optional) */}
          <div className="space-y-2">
            <Label htmlFor="suggestion-field">
              Suggestion <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              id="suggestion-field"
              data-testid="suggestion-field"
              value={suggestion}
              onChange={(e) => {
                if (e.target.value.length <= SUGGESTION_MAX) {
                  setSuggestion(e.target.value)
                }
              }}
              maxLength={SUGGESTION_MAX}
              placeholder="Suggest a fix or correction..."
              className="min-h-16 resize-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
              rows={2}
              aria-describedby="suggestion-help"
            />
            <p id="suggestion-help" className="text-xs text-muted-foreground">
              {suggestion.length}/{SUGGESTION_MAX} characters
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
            data-testid="add-finding-cancel"
            className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid}
            data-testid="add-finding-submit"
            className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
          >
            Add Finding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
