'use client'

import { useEffect, useRef, useState } from 'react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { FindingDetailContent } from '@/features/review/components/FindingDetailContent'
import type { OverrideHistoryEntry } from '@/features/review/components/OverrideHistoryPanel'
import type { FindingForDisplay } from '@/features/review/types'
import { useIsLaptop } from '@/hooks/useMediaQuery'
import { useReducedMotion } from '@/hooks/useReducedMotion'

type FindingDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  finding: FindingForDisplay | null
  sourceLang: string
  targetLang: string
  fileId: string | null
  contextRange?: number
  onNavigateToFinding?: (findingId: string) => void
  onAccept?: ((findingId: string) => void) | undefined
  onReject?: ((findingId: string) => void) | undefined
  onFlag?: ((findingId: string) => void) | undefined
  onDelete?: ((findingId: string) => void) | undefined
  isActionInFlight?: boolean | undefined
  projectId?: string | undefined
  fetchOverrideHistory?:
    | ((input: { findingId: string; projectId: string }) => Promise<{
        success: boolean
        data?: OverrideHistoryEntry[]
        error?: string
      }>)
    | undefined
  isNonNative?: boolean | undefined
  btConfidenceThreshold?: number | undefined
  /** Story 5.2c: Assignment info for comment thread */
  assignmentId?: string | undefined
  flaggerComment?: string | null | undefined
}

/**
 * Finding detail side sheet — used at < 1440px (laptop/tablet/mobile).
 * At >= 1440px, ReviewPageClient renders FindingDetailContent as a static aside instead.
 *
 * AC4: width = 360px at 1024-1439px (laptop), 300px below 1024px (tablet/mobile).
 * SheetContent base has `sm:max-w-sm` (384px) — we override with responsive token.
 */
export function FindingDetailSheet({
  open,
  onOpenChange,
  finding,
  sourceLang,
  targetLang,
  fileId,
  contextRange,
  onNavigateToFinding,
  onAccept,
  onReject,
  onFlag,
  onDelete,
  isActionInFlight = false,
  projectId,
  fetchOverrideHistory,
  isNonNative,
  btConfidenceThreshold,
  assignmentId,
  flaggerComment,
}: FindingDetailSheetProps) {
  const reducedMotion = useReducedMotion()
  const isLaptop = useIsLaptop()
  const prevFindingIdRef = useRef<string | null>(null)

  // Announce finding changes via aria-live (Guardrail #33)
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    if (finding && finding.id !== prevFindingIdRef.current) {
      setAnnouncement(`Viewing ${finding.severity} ${finding.category} finding`) // eslint-disable-line react-hooks/set-state-in-effect -- aria-live must change after mount
      prevFindingIdRef.current = finding.id
    } else if (!finding) {
      prevFindingIdRef.current = null
      setAnnouncement('')
    }
  }, [finding])

  // Responsive width: laptop = 360px, tablet/mobile = 300px
  const widthClass = isLaptop
    ? 'max-w-[var(--detail-panel-width-laptop)]'
    : 'max-w-[var(--detail-panel-width-tablet)]'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        role="complementary"
        aria-label="Finding detail"
        className={`${widthClass} ${reducedMotion ? '[&[data-state]]:duration-0 [&[data-state]]:animate-none' : ''}`}
        data-testid="finding-detail-sheet"
      >
        <SheetHeader>
          <SheetTitle>Finding Detail</SheetTitle>
          <SheetDescription>
            Review finding details, segment context, and take actions
          </SheetDescription>
        </SheetHeader>

        {/* aria-live region for screen reader announcements (Guardrail #33) */}
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {fileId ? (
          <FindingDetailContent
            finding={finding}
            sourceLang={sourceLang}
            targetLang={targetLang}
            fileId={fileId}
            contextRange={contextRange}
            onNavigateToFinding={onNavigateToFinding}
            onAccept={onAccept}
            onReject={onReject}
            onFlag={onFlag}
            onDelete={onDelete}
            isActionInFlight={isActionInFlight}
            projectId={projectId}
            fetchOverrideHistory={fetchOverrideHistory}
            isNonNative={isNonNative}
            btConfidenceThreshold={btConfidenceThreshold}
            assignmentId={assignmentId}
            flaggerComment={flaggerComment}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
