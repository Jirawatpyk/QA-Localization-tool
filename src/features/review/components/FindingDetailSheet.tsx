'use client'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { useReducedMotion } from '@/hooks/useReducedMotion'

type FindingDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  findingId: string | null
}

/**
 * Finding detail side sheet (Task 4.2 — shell only).
 *
 * Wraps shadcn Sheet with side="right" and role="complementary".
 * Radix provides: focus trap (Guardrail #30), Esc-to-close, focus restore, portal rendering.
 * Detail content will be populated in Story 4.1c.
 */
export function FindingDetailSheet({ open, onOpenChange, findingId }: FindingDetailSheetProps) {
  const reducedMotion = useReducedMotion()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        role="complementary"
        aria-label="Finding detail"
        className={reducedMotion ? '[&[data-state]]:duration-0 [&[data-state]]:animate-none' : ''}
        data-testid="finding-detail-sheet"
      >
        <SheetHeader>
          <SheetTitle>Finding Detail</SheetTitle>
          <SheetDescription>
            {findingId ? `Viewing finding ${findingId}` : 'Select a finding to view details'}
          </SheetDescription>
        </SheetHeader>

        {/* Content placeholder — populated in Story 4.1c */}
        <div className="flex-1 p-4">
          {findingId ? (
            <p className="text-sm text-muted-foreground">
              Detail content for finding will be implemented in Story 4.1c.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No finding selected.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
