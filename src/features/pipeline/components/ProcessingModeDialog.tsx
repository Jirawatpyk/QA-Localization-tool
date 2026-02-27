'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getFilesWordCount } from '@/features/pipeline/actions/getFilesWordCount.action'
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

// Word-count-based cost rates (AC1: per 100K words)
const COST_PER_100K: Record<ProcessingMode, number> = {
  economy: 0.4,
  thorough: 2.4,
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
  const [totalWords, setTotalWords] = useState<number | null>(null)
  const [isLoadingWords, setIsLoadingWords] = useState(false)

  const fileCount = fileIds.length

  // Fetch word count when dialog opens
  useEffect(() => {
    if (!open || fileIds.length === 0) return

    setIsLoadingWords(true)
    getFilesWordCount({ fileIds, projectId })
      .then((result) => {
        if (result.success) {
          setTotalWords(result.data.totalWords)
        }
      })
      .catch(() => {
        // non-critical — fall back to 0
      })
      .finally(() => {
        setIsLoadingWords(false)
      })
  }, [open, fileIds, projectId])

  // Calculate cost from word count: (words / 100K) × rate
  const estimatedCost =
    totalWords !== null ? ((totalWords / 100_000) * COST_PER_100K[mode]).toFixed(2) : null
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
            costPerFile={`~$${COST_PER_100K.economy.toFixed(2)}/100K words`}
            description="Can upgrade later"
            selected={mode === 'economy'}
            onSelect={() => setMode('economy')}
          />
          <ModeCard
            title="Thorough"
            layers="L1 + L2 + L3"
            estimatedTime="~2min/file"
            costPerFile={`~$${COST_PER_100K.thorough.toFixed(2)}/100K words`}
            description="Best accuracy"
            badge="Recommended"
            selected={mode === 'thorough'}
            onSelect={() => setMode('thorough')}
          />
        </div>

        {isLoadingWords ? (
          <div
            data-testid="cost-estimate-loading"
            className="h-6 w-48 animate-pulse rounded bg-muted"
          />
        ) : (
          <div data-testid="cost-estimate">
            Estimated cost: ${estimatedCost ?? '—'} · {estimatedTime}/file
          </div>
        )}

        <div data-testid="cost-comparison-note" className="text-xs text-muted-foreground">
          vs. manual QA: ~$150–$300 per 100K words
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
