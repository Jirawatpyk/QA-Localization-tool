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
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { critical: 0, major: 1, minor: 2 }

function sortFindings(items: FindingForDisplay[]): FindingForDisplay[] {
  return [...items].sort((a, b) => {
    const severityDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
    if (severityDiff !== 0) return severityDiff
    // Within same severity: confidence DESC, nulls last
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
}: FindingListProps) {
  const reducedMotion = useReducedMotion()
  const { register } = useKeyboardActions()
  const { pushEscapeLayer, popEscapeLayer } = useFocusManagement()
  const gridRef = useRef<HTMLDivElement>(null)

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
  // Exclude Minor findings when accordion is closed (AC4)
  const flattenedIds = useMemo(() => {
    const ids = [...groups.critical.map((f) => f.id), ...groups.major.map((f) => f.id)]
    if (minorAccordionOpen) {
      ids.push(...groups.minor.map((f) => f.id))
    }
    return ids
  }, [groups.critical, groups.major, groups.minor, minorAccordionOpen])

  // ID-based focus tracking (AC5) — replaces old index-only approach
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
  // "Adjust state during render" pattern (React 19) — avoids setState-in-effect
  const flattenedIdsKey = flattenedIds.join(',')
  const [prevFlattenedState, setPrevFlattenedState] = useState<{
    key: string
    ids: string[]
  }>({ key: '', ids: [] })

  if (flattenedIdsKey !== prevFlattenedState.key) {
    const prevFlattenedIds = prevFlattenedState.ids
    setPrevFlattenedState({ key: flattenedIdsKey, ids: flattenedIds })

    // Only adjust if we had previous findings AND current finding was removed
    if (prevFlattenedIds.length > 0 && activeFindingId !== null) {
      const newIndex = flattenedIds.indexOf(activeFindingId)
      if (newIndex === -1) {
        const oldIndex = prevFlattenedIds.indexOf(activeFindingId)
        const safeIndex = Math.min(Math.max(oldIndex, 0), flattenedIds.length - 1)
        setActiveFindingId(flattenedIds[safeIndex] ?? null)
      }
    }
  }

  // DOM focus wiring — focus the active row after activeFindingId changes
  const prevActiveFindingIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeFindingId === null || activeFindingId === prevActiveFindingIdRef.current) return
    prevActiveFindingIdRef.current = activeFindingId

    requestAnimationFrame(() => {
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
  }, [activeFindingId, reducedMotion])

  // Navigate to next finding (J / ArrowDown)
  const navigateNext = useCallback(() => {
    if (flattenedIds.length === 0) return
    // Auto-collapse current expanded finding before moving (DD#11)
    if (activeFindingId && expandedIds.has(activeFindingId)) {
      onToggleExpand(activeFindingId)
    }
    const nextIndex = (activeIndex + 1) % flattenedIds.length
    setActiveFindingId(flattenedIds[nextIndex] ?? null)
  }, [activeIndex, activeFindingId, expandedIds, flattenedIds, onToggleExpand])

  // Navigate to previous finding (K / ArrowUp)
  const navigatePrev = useCallback(() => {
    if (flattenedIds.length === 0) return
    // Auto-collapse current expanded finding before moving (DD#11)
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
    return () => cleanups.forEach((fn) => fn())
  }, [register, navigateNext, navigatePrev])

  // Escape layer management for expanded cards (AC2, Guardrail #31)
  const prevExpandedForEscape = useRef<Set<string>>(new Set())
  useEffect(() => {
    // Push escape layer when active finding becomes expanded
    if (
      activeFindingId &&
      expandedIds.has(activeFindingId) &&
      !prevExpandedForEscape.current.has(activeFindingId)
    ) {
      pushEscapeLayer('expanded', () => {
        onToggleExpand(activeFindingId)
      })
    }
    // Pop escape layer when active finding becomes collapsed
    if (
      activeFindingId &&
      !expandedIds.has(activeFindingId) &&
      prevExpandedForEscape.current.has(activeFindingId)
    ) {
      popEscapeLayer('expanded')
    }
    prevExpandedForEscape.current = new Set(expandedIds)
  }, [activeFindingId, expandedIds, onToggleExpand, pushEscapeLayer, popEscapeLayer])

  // Grid focus handler — restore active row on Tab re-entry (AC3)
  const handleGridFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      // Only handle focus entering the grid (not focus moving between rows)
      if (gridRef.current?.contains(e.relatedTarget as Node)) return

      // Restore focus to the active row
      if (activeFindingId) {
        requestAnimationFrame(() => {
          const row = gridRef.current?.querySelector(
            `[data-finding-id="${CSS.escape(activeFindingId)}"]`,
          ) as HTMLElement | null
          if (row) {
            row.focus()
          }
        })
      }
    },
    [activeFindingId],
  )

  // Pre-compute global index map for all findings (including closed accordion)
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

  // Total findings count (all, including Minor whether accordion is open or not)
  const totalFindings = groups.critical.length + groups.major.length + groups.minor.length

  // Empty state — all hooks must be above this early return
  if (sorted.length === 0) {
    return <p className="text-muted-foreground text-sm py-4">No findings for this file.</p>
  }

  // Rendering helpers
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
    >
      {/* Critical section — auto-expanded */}
      {groups.critical.length > 0 && (
        <div role="rowgroup" aria-label="Critical findings">
          {groups.critical.map((f) => renderCompactWithCard(f, expandedIds.has(f.id)))}
        </div>
      )}

      {/* Major section — collapsed */}
      {groups.major.length > 0 && (
        <div role="rowgroup" aria-label="Major findings">
          {groups.major.map((f) => renderCompactWithCard(f, expandedIds.has(f.id)))}
        </div>
      )}

      {/* Minor section — under accordion */}
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
