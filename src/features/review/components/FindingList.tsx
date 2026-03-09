'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { FindingCard } from '@/features/review/components/FindingCard'
import { FindingCardCompact } from '@/features/review/components/FindingCardCompact'
import type { FindingForDisplay } from '@/features/review/types'
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
  // Avoids setState-in-effect which violates react-hooks/set-state-in-effect
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

  // Compute active row index for roving tabindex (first row = active)
  const [activeIndex, setActiveIndex] = useState(0)

  // Track accordion open state locally so Realtime additions don't reset it
  const [minorAccordionValue, setMinorAccordionValue] = useState<string[]>([])

  // Reset active index when findings count changes — "adjust state during render" pattern
  const [prevSortedLength, setPrevSortedLength] = useState(0)
  if (sorted.length !== prevSortedLength) {
    setPrevSortedLength(sorted.length)
    setActiveIndex(0)
  }

  // Pre-compute global index map (StrictMode-safe — no mutable counter in render)
  const indexMap = useMemo(() => {
    const map = new Map<string, number>()
    const order = [...groups.critical, ...groups.major, ...groups.minor]
    for (let i = 0; i < order.length; i++) {
      map.set(order[i]!.id, i)
    }
    return map
  }, [groups])

  // Empty state — all hooks must be above this early return
  if (sorted.length === 0) {
    return <p className="text-muted-foreground text-sm py-4">No findings for this file.</p>
  }

  // Rendering helpers
  function renderCompactWithCard(finding: FindingForDisplay, isExpanded: boolean) {
    const currentGlobalIndex = indexMap.get(finding.id) ?? 0
    const isActive = currentGlobalIndex === activeIndex
    const isNew = newIds.has(finding.id)

    return (
      <div key={finding.id}>
        <FindingCardCompact
          finding={finding}
          isActive={isActive}
          isExpanded={isExpanded}
          isNew={isNew}
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
            totalFindings={sorted.length}
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
    <div className="space-y-2">
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
