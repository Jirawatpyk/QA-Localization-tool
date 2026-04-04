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
import { useReducedMotion } from '@/hooks/useReducedMotion'

type FindingDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  finding: FindingForDisplay | null
  sourceLang: string
  targetLang: string
  fileId: string | null
  contextRange?: number
  onNavigateToFinding?: (findingId: string | null) => void
  findingNumber?: number | undefined
  onAccept?: ((findingId: string) => void) | undefined
  onReject?: ((findingId: string) => void) | undefined
  onFlag?: ((findingId: string) => void) | undefined
  onDelete?: ((findingId: string) => void) | undefined
  /** S-FIX-4 AC3: Additional action handlers */
  onNote?: (() => void) | undefined
  onSource?: (() => void) | undefined
  onOverride?: (() => void) | undefined
  onAdd?: (() => void) | undefined
  isActionInFlight?: boolean | undefined
  activeAction?: import('@/features/review/utils/state-transitions').ReviewAction | null | undefined
  isManualFinding?: boolean | undefined
  isNativeReviewer?: boolean | undefined
  onConfirmNative?: (() => void) | undefined
  onOverrideNative?: (() => void) | undefined
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
 * Finding detail side sheet — used at < 1024px (mobile only after S-FIX-4).
 * At >= 1024px, ReviewPageClient renders FindingDetailContent as a persistent aside.
 *
 * Width = 300px (tablet/mobile token).
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
  findingNumber,
  onAccept,
  onReject,
  onFlag,
  onDelete,
  onNote,
  onSource,
  onOverride,
  onAdd,
  isActionInFlight = false,
  activeAction = null,
  isManualFinding = false,
  isNativeReviewer = false,
  onConfirmNative,
  onOverrideNative,
  projectId,
  fetchOverrideHistory,
  isNonNative,
  btConfidenceThreshold,
  assignmentId,
  flaggerComment,
}: FindingDetailSheetProps) {
  const reducedMotion = useReducedMotion()
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

  // S-FIX-4: Sheet only renders at < 1024px (mobile). Width = tablet/mobile token (300px).
  const widthClass =
    'w-[var(--detail-panel-width-tablet)] sm:max-w-[var(--detail-panel-width-tablet)]'

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
            findingNumber={findingNumber}
            onAccept={onAccept}
            onReject={onReject}
            onFlag={onFlag}
            onDelete={onDelete}
            onNote={onNote}
            onSource={onSource}
            onOverride={onOverride}
            onAdd={onAdd}
            isActionInFlight={isActionInFlight}
            activeAction={activeAction}
            isManualFinding={isManualFinding}
            isNativeReviewer={isNativeReviewer}
            onConfirmNative={onConfirmNative}
            onOverrideNative={onOverrideNative}
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
