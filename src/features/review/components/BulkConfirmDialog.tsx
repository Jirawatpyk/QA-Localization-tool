'use client'

import { useEffect, useMemo, useRef } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Finding, FindingSeverity } from '@/types/finding'

export type BulkConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: 'accept' | 'reject'
  selectedFindings: Finding[]
  onConfirm: () => void
}

export function BulkConfirmDialog({
  open,
  onOpenChange,
  action,
  selectedFindings,
  onConfirm,
}: BulkConfirmDialogProps) {
  const triggerRef = useRef<HTMLElement | null>(null)

  // Guardrail #11: Reset state on re-open
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null
    }
  }, [open])

  // Guardrail #30: Focus restore on close handled by shadcn Dialog

  // Compute severity breakdown
  const severityBreakdown = useMemo(() => {
    const counts: Record<FindingSeverity, number> = { critical: 0, major: 0, minor: 0 }
    for (const f of selectedFindings) {
      counts[f.severity]++
    }
    return counts
  }, [selectedFindings])

  const count = selectedFindings.length
  const actionLabel = action === 'accept' ? 'Accept' : 'Reject'
  const actionVerb =
    action === 'accept' ? 'accept them as valid findings' : 'dismiss them as false positives'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="bulk-confirm-dialog" aria-modal="true" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {actionLabel} {count} findings?
          </DialogTitle>
          <DialogDescription>This will {actionVerb}.</DialogDescription>
        </DialogHeader>

        {/* Severity breakdown table */}
        <div className="py-3">
          <table className="w-full text-sm" aria-label="Severity breakdown">
            <tbody>
              {severityBreakdown.critical > 0 && (
                <tr>
                  <td className="py-1 font-medium text-severity-critical">Critical</td>
                  <td className="py-1 text-right">{severityBreakdown.critical}</td>
                </tr>
              )}
              {severityBreakdown.major > 0 && (
                <tr>
                  <td className="py-1 font-medium text-severity-major">Major</td>
                  <td className="py-1 text-right">{severityBreakdown.major}</td>
                </tr>
              )}
              {severityBreakdown.minor > 0 && (
                <tr>
                  <td className="py-1 font-medium text-severity-minor">Minor</td>
                  <td className="py-1 text-right">{severityBreakdown.minor}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
          >
            Cancel
          </Button>
          <Button
            variant={action === 'reject' ? 'destructive' : 'default'}
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
            className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            data-testid="bulk-confirm-button"
          >
            Confirm {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
