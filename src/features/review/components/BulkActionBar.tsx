'use client'

import { Check, Loader2, X, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export type BulkActionBarProps = {
  selectedCount: number
  onBulkAccept: () => void
  onBulkReject: () => void
  onClearSelection: () => void
  isBulkInFlight: boolean
  activeAction?: 'accept' | 'reject' | null | undefined
}

export function BulkActionBar({
  selectedCount,
  onBulkAccept,
  onBulkReject,
  onClearSelection,
  isBulkInFlight,
  activeAction = null,
}: BulkActionBarProps) {
  const reducedMotion = useReducedMotion()

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      data-testid="bulk-action-bar"
      className={`sticky bottom-0 z-10 flex items-center gap-3 rounded-t-lg border-t bg-background px-4 py-3 shadow-lg ${
        reducedMotion ? '' : 'animate-slide-up'
      }`}
    >
      {/* Selection count */}
      <span className="text-sm font-medium" aria-live="polite">
        {selectedCount} finding{selectedCount !== 1 ? 's' : ''} selected
      </span>

      {/* Bulk Accept */}
      <Button
        variant="default"
        size="sm"
        disabled={isBulkInFlight}
        onClick={onBulkAccept}
        className="bg-success text-success-foreground hover:bg-success/90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
        aria-label={`Bulk accept ${selectedCount} findings`}
      >
        {isBulkInFlight && activeAction === 'accept' ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="mr-1 h-4 w-4" aria-hidden="true" />
        )}
        Bulk Accept
      </Button>

      {/* Bulk Reject */}
      <Button
        variant="default"
        size="sm"
        disabled={isBulkInFlight}
        onClick={onBulkReject}
        className="bg-error text-error-foreground hover:bg-error/90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
        aria-label={`Bulk reject ${selectedCount} findings`}
      >
        {isBulkInFlight && activeAction === 'reject' ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <XCircle className="mr-1 h-4 w-4" aria-hidden="true" />
        )}
        Bulk Reject
      </Button>

      {/* Clear Selection */}
      <Button
        variant="ghost"
        size="sm"
        disabled={isBulkInFlight}
        onClick={onClearSelection}
        className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
        aria-label="Clear selection"
      >
        <X className="mr-1 h-4 w-4" aria-hidden="true" />
        Clear Selection
      </Button>
    </div>
  )
}
