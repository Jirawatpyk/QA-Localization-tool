'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { startProcessing } from '@/features/pipeline/actions/startProcessing.action'
import type { ProcessingMode } from '@/types/pipeline'

import { ModeCard } from './ModeCard'

type ProcessingModeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileIds: string[]
  projectId: string
  onStartProcessing?: () => void
}

// Provisional cost estimates per file — real costs tracked in Epic 3 (AI provider integration)
const COST_PER_FILE: Record<ProcessingMode, number> = {
  economy: 0.15,
  thorough: 0.35,
}

// Provisional time estimates per file
const TIME_PER_FILE: Record<ProcessingMode, string> = {
  economy: '~30s',
  thorough: '~2 min',
}

export function ProcessingModeDialog({
  open,
  onOpenChange,
  fileIds,
  projectId,
  onStartProcessing,
}: ProcessingModeDialogProps) {
  const [mode, setMode] = useState<ProcessingMode>('economy')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fileCount = fileIds.length
  const estimatedCost = (fileCount * COST_PER_FILE[mode]).toFixed(2)
  const estimatedTime = TIME_PER_FILE[mode]

  const handleStart = async () => {
    setIsSubmitting(true)
    try {
      const result = await startProcessing({ fileIds, projectId, mode })
      if (result.success) {
        toast.success(`Processing started for ${fileCount} files`)
        onStartProcessing?.()
        onOpenChange(false)
      } else {
        toast.error(result.error ?? 'Failed to start processing')
      }
    } catch {
      toast.error('Failed to start processing')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Processing</DialogTitle>
          <p className="text-sm text-muted-foreground">{fileCount} files selected for processing</p>
        </DialogHeader>

        <div className="flex gap-4">
          <ModeCard
            title="Economy"
            layers="L1 + L2"
            estimatedTime="~30s/file"
            costPerFile="$0.15/file"
            description="Can upgrade later"
            selected={mode === 'economy'}
            onSelect={() => setMode('economy')}
          />
          <ModeCard
            title="Thorough"
            layers="L1 + L2 + L3"
            estimatedTime="~2min/file"
            costPerFile="$0.35/file"
            description="Best accuracy"
            badge="Recommended"
            selected={mode === 'thorough'}
            onSelect={() => setMode('thorough')}
          />
        </div>

        <div data-testid="cost-estimate">
          Estimated cost: ${estimatedCost} · {estimatedTime}/file
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={isSubmitting}>
            {isSubmitting ? 'Processing...' : 'Start Processing'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
