'use client'

import { useState } from 'react'
import { toast } from 'sonner'

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

const COST_PER_FILE: Record<ProcessingMode, number> = {
  economy: 0.02,
  thorough: 0.08,
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

  if (!open) return null

  const fileCount = fileIds.length
  const estimatedCost = (fileCount * COST_PER_FILE[mode]).toFixed(2)

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
    <div role="dialog" aria-modal="true">
      <p>{fileCount} files selected for processing</p>

      <div>
        <ModeCard
          title="Economy"
          layers="L1 + L2"
          estimatedTime="~2 min"
          costPerFile="$0.02"
          description="Rule-based checks plus AI screening. Fast and cost-effective."
          badge="Recommended"
          selected={mode === 'economy'}
          onSelect={() => setMode('economy')}
        />
        <ModeCard
          title="Thorough"
          layers="L1 + L2 + L3"
          estimatedTime="~8 min"
          costPerFile="$0.08"
          description="Full AI analysis with deep semantic review. Maximum quality."
          selected={mode === 'thorough'}
          onSelect={() => setMode('thorough')}
        />
      </div>

      <div data-testid="cost-estimate">Estimated cost: ${estimatedCost}</div>

      <div>
        <button onClick={() => onOpenChange(false)} disabled={isSubmitting}>
          Cancel
        </button>
        <button onClick={handleStart} disabled={isSubmitting}>
          {isSubmitting ? 'Processing...' : 'Start Processing'}
        </button>
      </div>
    </div>
  )
}
