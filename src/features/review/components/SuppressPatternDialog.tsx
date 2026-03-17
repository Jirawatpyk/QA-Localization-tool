'use client'

import { useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
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
import type {
  DetectedPattern,
  SuppressionConfig,
  SuppressionDuration,
  SuppressionScope,
} from '@/features/review/types'

type SuppressPatternDialogProps = {
  open: boolean
  pattern: DetectedPattern | null
  fileId: string
  onConfirm: (config: SuppressionConfig) => void
  onCancel: () => void
}

export function SuppressPatternDialog({
  open,
  pattern,
  fileId,
  onConfirm,
  onCancel,
}: SuppressPatternDialogProps) {
  const triggerRef = useRef<HTMLElement | null>(null)
  const [scope, setScope] = useState<SuppressionScope>('language_pair')
  const [duration, setDuration] = useState<SuppressionDuration>('until_improved')

  // Guardrail #11: Reset form state on re-open
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null
      setScope('language_pair') // eslint-disable-line react-hooks/set-state-in-effect -- Guardrail #11: dialog state reset on re-open
      setDuration('until_improved')
    }
  }, [open])

  if (!pattern) return null

  const langPairLabel = `${pattern.sourceLang} → ${pattern.targetLang}`

  function handleConfirm() {
    const config: SuppressionConfig = {
      scope,
      duration,
      fileId: scope === 'file' ? fileId : null,
      sourceLang: scope === 'language_pair' ? pattern!.sourceLang : null,
      targetLang: scope === 'language_pair' ? pattern!.targetLang : null,
    }
    onConfirm(config)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      onCancel()
      // Guardrail #30: restore focus on close
      requestAnimationFrame(() => {
        triggerRef.current?.focus()
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="suppress-pattern-dialog"
        aria-modal="true"
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Suppress Pattern</DialogTitle>
          <DialogDescription>
            Configure how to suppress this recurring false positive pattern.
          </DialogDescription>
        </DialogHeader>

        {/* Pattern preview */}
        <div className="space-y-2 py-2">
          <div className="text-sm font-medium">Pattern</div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{pattern.category}</Badge>
            <span className="text-muted-foreground text-sm">{pattern.keywords.join(', ')}</span>
          </div>
          <div className="text-muted-foreground text-xs">
            {pattern.matchingFindingIds.length} matching findings detected
          </div>
        </div>

        {/* Scope radios */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Scope</Label>
          <RadioGroup
            value={scope}
            onValueChange={(v) => setScope(v as SuppressionScope)}
            aria-label="Suppression scope"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="file" id="scope-file" />
              <Label htmlFor="scope-file" className="font-normal">
                This file only
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="language_pair" id="scope-lang" />
              <Label htmlFor="scope-lang" className="font-normal">
                This language pair ({langPairLabel})
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="scope-all" />
              <Label htmlFor="scope-all" className="font-normal">
                All language pairs
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Duration radios */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Duration</Label>
          <RadioGroup
            value={duration}
            onValueChange={(v) => setDuration(v as SuppressionDuration)}
            aria-label="Suppression duration"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="until_improved" id="duration-improved" />
              <Label htmlFor="duration-improved" className="font-normal">
                Until AI accuracy improves
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="permanent" id="duration-permanent" />
              <Label htmlFor="duration-permanent" className="font-normal">
                Permanently
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="session" id="duration-session" />
              <Label htmlFor="duration-session" className="font-normal">
                This session only
              </Label>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            data-testid="suppress-confirm-button"
            aria-label={`Suppress ${pattern.category} pattern: ${pattern.keywords.join(', ')}`}
          >
            Suppress Pattern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
