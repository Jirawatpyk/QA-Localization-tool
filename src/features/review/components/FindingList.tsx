'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { FindingCard } from '@/features/review/components/FindingCard'
import { FindingCardCompact } from '@/features/review/components/FindingCardCompact'
import { useFocusManagement } from '@/features/review/hooks/use-focus-management'
import { useKeyboardActions } from '@/features/review/hooks/use-keyboard-actions'
import { useReviewStore } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { FindingSeverity } from '@/types/finding'

export type FindingListProps = {
  findings: FindingForDisplay[]
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  sourceLang?: string | undefined
  targetLang?: string | undefined
  l2ConfidenceMin?: number | null | undefined
  l3ConfidenceMin?: number | null | undefined
  onAccept?: ((findingId: string) => void) | undefined
  onReject?: ((findingId: string) => void) | undefined
  isActionInFlight?: boolean | undefined
  // CR-C1: callback to notify parent when active finding changes
  onActiveFindingChange?: ((id: string | null) => void) | undefined
  // H3 fix: ref that signals storeSelectedId change came from row click (skip re-sync)
  skipStoreSyncRef?: React.RefObject<boolean> | undefined
  // Story 4.4a: callback when override badge clicked on finding card
  onOverrideBadgeClick?: ((findingId: string) => void) | undefined
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { critical: 0, major: 1, minor: 2 }

function sortFindings(items: FindingForDisplay[]): FindingForDisplay[] {
  return [...items].sort((a, b) => {
    const severityDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
    if (severityDiff !== 0) return severityDiff
    if (a.aiConfidence === null && b.aiConfidence === null) return 0
    if (a.aiConfidence === null) return 1
    if (b.aiConfidence === null) return -1
    return b.aiConfidence - a.aiConfidence
  })
}

export function FindingList({
  findings,
  expandedIds,
  onToggleExpand,
  sourceLang,
  targetLang,
  l2ConfidenceMin,
  l3ConfidenceMin,
  onAccept,
  onReject,
  isActionInFlight = false,
  onActiveFindingChange,
  skipStoreSyncRef,
  onOverrideBadgeClick,
}: FindingListProps) {
  const reducedMotion = useReducedMotion()
  const { register } = useKeyboardActions()
  const { pushEscapeLayer, popEscapeLayer } = useFocusManagement()
  const gridRef = useRef<HTMLDivElement>(null)
  const gridFocusRafRef = useRef<number>(0)

  // Track previous finding IDs to detect new findings (for announce + new-finding animation)
  const [prevIds, setPrevIds] = useState<Set<string>>(new Set<string>())
  const [newIds, setNewIds] = useState<Set<string>>(new Set<string>())

  // Sort findings
  const sorted = useMemo(() => sortFindings(findings), [findings])

  // Group by severity — memoized
  const groups = useMemo(() => {
    const critical: FindingForDisplay[] = []
    const major: FindingForDisplay[] = []
    const minor: FindingForDisplay[] = []
    for (const f of sorted) {
      if (f.severity === 'critical') critical.push(f)
      else if (f.severity === 'major') major.push(f)
      else minor.push(f)
    }
    return { critical, major, minor }
  }, [sorted])

  // Detect new findings during render — "adjust state during render" pattern (React 19)
  const findingIdsKey = useMemo(
    () =>
      findings
        .map((f) => f.id)
        .sort()
        .join(','),
    [findings],
  )
  const [prevFindingIdsKey, setPrevFindingIdsKey] = useState('')

  if (findingIdsKey !== prevFindingIdsKey) {
    setPrevFindingIdsKey(findingIdsKey)
    const currentIds = new Set(findings.map((f) => f.id))
    if (prevIds.size > 0) {
      const added = new Set<string>()
      for (const id of currentIds) {
        if (!prevIds.has(id)) added.add(id)
      }
      if (added.size > 0) {
        setNewIds(added)
      }
    }
    setPrevIds(currentIds)
  }

  // Clear new-finding highlight after animation duration
  useEffect(() => {
    if (newIds.size === 0) return
    const timer = setTimeout(() => setNewIds(new Set<string>()), 2000)
    return () => clearTimeout(timer)
  }, [newIds])

  // Track accordion open state locally so Realtime additions don't reset it
  const [minorAccordionValue, setMinorAccordionValue] = useState<string[]>([])
  const minorAccordionOpen = minorAccordionValue.includes('minor-group')

  // Compute flattenedIds: all navigable finding IDs in display order
  const flattenedIds = useMemo(() => {
    const ids = [...groups.critical.map((f) => f.id), ...groups.major.map((f) => f.id)]
    if (minorAccordionOpen) {
      ids.push(...groups.minor.map((f) => f.id))
    }
    return ids
  }, [groups.critical, groups.major, groups.minor, minorAccordionOpen])

  // C1+H3 fix: sync ALL finding IDs in visual order to store for autoAdvance.
  // Includes minor findings even when accordion is collapsed (autoAdvance needs them
  // to find next pending → setSelectedFinding triggers accordion expand via effect below)
  const allSortedIds = useMemo(
    () => [
      ...groups.critical.map((f) => f.id),
      ...groups.major.map((f) => f.id),
      ...groups.minor.map((f) => f.id),
    ],
    [groups.critical, groups.major, groups.minor],
  )
  const setSortedFindingIds = useReviewStore((s) => s.setSortedFindingIds)
  useEffect(() => {
    setSortedFindingIds(allSortedIds)
  }, [allSortedIds, setSortedFindingIds])

  // ID-based focus tracking — local state (no Zustand to avoid re-render loops)
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null)

  // Derive activeIndex from activeFindingId + flattenedIds
  const activeIndex = useMemo(() => {
    if (activeFindingId === null) return 0
    const idx = flattenedIds.indexOf(activeFindingId)
    return idx >= 0 ? idx : 0
  }, [activeFindingId, flattenedIds])

  // Initialize activeFindingId when flattenedIds first populates
  if (activeFindingId === null && flattenedIds.length > 0) {
    setActiveFindingId(flattenedIds[0] ?? null)
  }

  // Focus stability: recalculate when flattenedIds changes (AC5)
  const flattenedIdsKey = flattenedIds.join(',')
  const [prevFlattenedState, setPrevFlattenedState] = useState<{
    key: string
    ids: string[]
  }>({ key: '', ids: [] })

  if (flattenedIdsKey !== prevFlattenedState.key) {
    const prevFlattenedIds = prevFlattenedState.ids
    setPrevFlattenedState({ key: flattenedIdsKey, ids: flattenedIds })
    if (prevFlattenedIds.length > 0 && activeFindingId !== null) {
      const newIndex = flattenedIds.indexOf(activeFindingId)
      if (newIndex === -1) {
        const oldIndex = prevFlattenedIds.indexOf(activeFindingId)
        const safeIndex = Math.min(Math.max(oldIndex, 0), flattenedIds.length - 1)
        setActiveFindingId(flattenedIds[safeIndex] ?? null)
      }
    }
  }

  // CR-C1: Notify parent when activeFindingId changes (enables hotkeys + action bar + detail panel)
  // This replaces the bidirectional Zustand sync that caused re-render loops.
  useEffect(() => {
    onActiveFindingChange?.(activeFindingId)
  }, [activeFindingId, onActiveFindingChange])

  // ── Story 4.1c: Sync selectedId from review store → activeFindingId ──
  // Enables click-to-navigate from SegmentContextList → FindingList (AC5).
  const storeSelectedId = useReviewStore((s) => s.selectedId)
  useEffect(() => {
    if (storeSelectedId === null) return
    if (storeSelectedId === activeFindingId) return
    // H3 fix: skip if selectedId change came from row click (prevents infinite loop)
    if (skipStoreSyncRef?.current) return
    if (!flattenedIds.includes(storeSelectedId)) {
      const isMinorFinding = groups.minor.some((f) => f.id === storeSelectedId)
      if (isMinorFinding && !minorAccordionOpen) {
        setMinorAccordionValue(['minor-group']) // eslint-disable-line react-hooks/set-state-in-effect -- syncing from Zustand external store
        // After accordion opens, flattenedIds will update and this effect re-runs.
        // The re-run will hit the `setActiveFindingId` below because flattenedIds now includes the minor ID.
        return
      } else {
        return
      }
    }
    setActiveFindingId(storeSelectedId)
  }, [storeSelectedId, activeFindingId, flattenedIds, groups.minor, minorAccordionOpen])

  // DOM focus wiring — focus the active row after activeFindingId changes
  const prevActiveFindingIdRef = useRef<string | null>(null)
  const focusRafRef = useRef<number>(0)
  useEffect(() => {
    if (activeFindingId === null) return
    if (prevActiveFindingIdRef.current === null) {
      prevActiveFindingIdRef.current = activeFindingId
      return
    }
    if (activeFindingId === prevActiveFindingIdRef.current) return
    prevActiveFindingIdRef.current = activeFindingId

    focusRafRef.current = requestAnimationFrame(() => {
      const row = gridRef.current?.querySelector(
        `[data-finding-id="${CSS.escape(activeFindingId)}"]`,
      ) as HTMLElement | null
      if (row && document.activeElement !== row) {
        if (reducedMotion) {
          row.focus({ preventScroll: true })
          row.scrollIntoView({ block: 'nearest', behavior: 'instant' })
        } else {
          row.focus({ preventScroll: false })
        }
      }
    })
    return () => cancelAnimationFrame(focusRafRef.current)
  }, [activeFindingId, reducedMotion])

  // Navigate to next finding (J / ArrowDown)
  const navigateNext = useCallback(() => {
    if (flattenedIds.length === 0) return
    if (activeFindingId && expandedIds.has(activeFindingId)) {
      onToggleExpand(activeFindingId)
    }
    const nextIndex = (activeIndex + 1) % flattenedIds.length
    setActiveFindingId(flattenedIds[nextIndex] ?? null)
  }, [activeIndex, activeFindingId, expandedIds, flattenedIds, onToggleExpand])

  // Navigate to previous finding (K / ArrowUp)
  const navigatePrev = useCallback(() => {
    if (flattenedIds.length === 0) return
    if (activeFindingId && expandedIds.has(activeFindingId)) {
      onToggleExpand(activeFindingId)
    }
    const prevIndex = (activeIndex - 1 + flattenedIds.length) % flattenedIds.length
    setActiveFindingId(flattenedIds[prevIndex] ?? null)
  }, [activeIndex, activeFindingId, expandedIds, flattenedIds, onToggleExpand])

  // Register J/K/Arrow keyboard handlers (AC1)
  useEffect(() => {
    const cleanups = [
      register('j', () => navigateNext(), { scope: 'review', description: 'Next finding' }),
      register('ArrowDown', () => navigateNext(), { scope: 'review', description: 'Next finding' }),
      register('k', () => navigatePrev(), { scope: 'review', description: 'Previous finding' }),
      register('ArrowUp', () => navigatePrev(), {
        scope: 'review',
        description: 'Previous finding',
      }),
    ]
    gridRef.current?.setAttribute('data-keyboard-ready', 'true')
    return () => cleanups.forEach((fn) => fn())
  }, [register, navigateNext, navigatePrev])

  // Escape layer management for expanded cards (AC2, Guardrail #31)
  const activeFindingIdRef = useRef<string | null>(null)
  useEffect(() => {
    activeFindingIdRef.current = activeFindingId
  }, [activeFindingId])
  const prevExpandedForEscape = useRef<boolean>(false)
  useEffect(() => {
    const hasExpanded = expandedIds.size > 0
    const hadExpanded = prevExpandedForEscape.current
    if (hasExpanded && !hadExpanded) {
      pushEscapeLayer('expanded', () => {
        const currentId = activeFindingIdRef.current
        if (currentId) {
          onToggleExpand(currentId)
        }
      })
    }
    if (!hasExpanded && hadExpanded) {
      popEscapeLayer('expanded')
    }
    prevExpandedForEscape.current = hasExpanded
  }, [expandedIds, onToggleExpand, pushEscapeLayer, popEscapeLayer])

  // Grid focus handler
  const handleGridFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (gridRef.current?.contains(e.relatedTarget as Node)) return
      const isRowFocused = (e.target as HTMLElement).closest('[data-finding-id]') !== null
      if (isRowFocused) return
      if (activeFindingId) {
        cancelAnimationFrame(gridFocusRafRef.current)
        gridFocusRafRef.current = requestAnimationFrame(() => {
          const row = gridRef.current?.querySelector(
            `[data-finding-id="${CSS.escape(activeFindingId)}"]`,
          ) as HTMLElement | null
          if (row) row.focus()
        })
      }
    },
    [activeFindingId],
  )

  // Grid keydown handler
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (target.getAttribute('contenteditable') === 'true') return
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        navigateNext()
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        navigatePrev()
      }
      // Note: Enter is handled by FindingCardCompact's own onKeyDown handler (line 85)
      // Do NOT add grid-level Enter handler — it would stopPropagation and block the card.
    },
    [navigateNext, navigatePrev],
  )

  // Grid click handler
  const handleGridClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const targetRow = (e.target as HTMLElement).closest('[data-finding-id]') as HTMLElement | null
      if (!targetRow) return
      const clickedId = targetRow.getAttribute('data-finding-id')
      if (clickedId && clickedId !== activeFindingId && flattenedIds.includes(clickedId)) {
        setActiveFindingId(clickedId)
      }
    },
    [activeFindingId, flattenedIds],
  )

  // Pre-compute global index map
  const allIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    const allIds = [
      ...groups.critical.map((f) => f.id),
      ...groups.major.map((f) => f.id),
      ...groups.minor.map((f) => f.id),
    ]
    for (let i = 0; i < allIds.length; i++) {
      map.set(allIds[i]!, i)
    }
    return map
  }, [groups])

  const totalFindings = groups.critical.length + groups.major.length + groups.minor.length

  if (sorted.length === 0) {
    return <p className="text-muted-foreground text-sm py-4">No findings for this file.</p>
  }

  function renderCompactWithCard(finding: FindingForDisplay, isExpanded: boolean) {
    const currentGlobalIndex = allIndexMap.get(finding.id) ?? 0
    const isActive = finding.id === activeFindingId
    const isNew = newIds.has(finding.id)
    return (
      <div key={finding.id}>
        <FindingCardCompact
          finding={finding}
          isActive={isActive}
          isExpanded={isExpanded}
          isNew={isNew}
          findingIndex={currentGlobalIndex}
          totalFindings={totalFindings}
          sourceLang={sourceLang}
          targetLang={targetLang}
          l2ConfidenceMin={l2ConfidenceMin}
          l3ConfidenceMin={l3ConfidenceMin}
          onExpand={onToggleExpand}
          onAccept={onAccept}
          onReject={onReject}
          isActionInFlight={isActionInFlight}
          onOverrideBadgeClick={onOverrideBadgeClick}
        />
        {isExpanded && (
          <FindingCard
            finding={finding}
            findingIndex={currentGlobalIndex}
            totalFindings={totalFindings}
            sourceLang={sourceLang}
            targetLang={targetLang}
            l2ConfidenceMin={l2ConfidenceMin}
            l3ConfidenceMin={l3ConfidenceMin}
            isNew={isNew}
            onAccept={onAccept}
            onReject={onReject}
            isActionInFlight={isActionInFlight}
            onOverrideBadgeClick={onOverrideBadgeClick}
          />
        )}
      </div>
    )
  }

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="Finding list"
      aria-rowcount={totalFindings}
      className="space-y-2"
      onFocus={handleGridFocus}
      onClick={handleGridClick}
      onKeyDown={handleGridKeyDown}
    >
      {groups.critical.length > 0 && (
        <div role="rowgroup" aria-label="Critical findings">
          {groups.critical.map((f) => renderCompactWithCard(f, expandedIds.has(f.id)))}
        </div>
      )}
      {groups.major.length > 0 && (
        <div role="rowgroup" aria-label="Major findings">
          {groups.major.map((f) => renderCompactWithCard(f, expandedIds.has(f.id)))}
        </div>
      )}
      {groups.minor.length > 0 && (
        <div role="rowgroup" aria-label="Minor findings">
          <Accordion
            type="multiple"
            value={minorAccordionValue}
            onValueChange={setMinorAccordionValue}
          >
            <AccordionItem value="minor-group">
              <AccordionTrigger>Minor ({groups.minor.length})</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-1">
                  {groups.minor.map((f) => renderCompactWithCard(f, expandedIds.has(f.id)))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  )
}
