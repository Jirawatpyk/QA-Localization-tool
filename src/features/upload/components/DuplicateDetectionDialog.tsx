'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import type { DuplicateInfo } from '../types'

type DuplicateDetectionDialogProps = {
  open: boolean
  fileName: string
  duplicateInfo: DuplicateInfo
  onRerun: () => void
  onCancel: () => void
}

export function DuplicateDetectionDialog({
  open,
  fileName,
  duplicateInfo,
  onRerun,
  onCancel,
}: DuplicateDetectionDialogProps) {
  const uploadDate = new Date(duplicateInfo.originalUploadDate).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  const scoreText =
    duplicateInfo.existingScore !== null
      ? `Score ${duplicateInfo.existingScore.toFixed(1)}`
      : 'No score yet'

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel()
      }}
    >
      <DialogContent aria-label="Duplicate file detected">
        <DialogHeader>
          <DialogTitle>Duplicate File Detected</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-text-primary">{fileName}</span> was uploaded on{' '}
            {uploadDate} ({scoreText}) — re-run QA?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onRerun}>Re-run QA</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
