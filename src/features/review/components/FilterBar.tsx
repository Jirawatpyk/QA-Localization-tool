import { X } from 'lucide-react'
import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useReviewStore, useFileState } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import type { ConfidenceFilter, FilterState } from '@/features/review/utils/filter-helpers'
import {
  DEFAULT_FILTER_STATE,
  findingMatchesFilters,
  getConfidenceBucket,
} from '@/features/review/utils/filter-helpers'
import { cn } from '@/lib/utils'
import type { DetectedByLayer, FindingSeverity, FindingStatus } from '@/types/finding'

// ── Constants ──

const SEVERITY_OPTIONS: Array<{ value: FindingSeverity | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
]

const LAYER_OPTIONS: Array<{ value: DetectedByLayer | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'L1', label: 'Rule-based' },
  { value: 'L2', label: 'AI' },
]

const STATUS_OPTIONS: Array<{ value: FindingStatus | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'flagged', label: 'Flagged' },
]

const CONFIDENCE_OPTIONS: Array<{ value: ConfidenceFilter | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

// ── Types (AP-M2: typed per dimension) ──

type FilterBarProps = {
  findings: FindingForDisplay[]
  filteredCount: number
}

type MatchCounts = {
  severity: Partial<Record<FindingSeverity, number>>
  layer: Partial<Record<DetectedByLayer, number>>
  status: Partial<Record<FindingStatus, number>>
  category: Partial<Record<string, number>>
  confidence: Partial<Record<ConfidenceFilter, number>>
}

// ── Helper: compute per-button match counts in single pass ──

function computeMatchCounts(
  findings: FindingForDisplay[],
  filterState: FilterState,
  searchQuery: string,
  aiSuggestionsEnabled: boolean,
): MatchCounts {
  const counts: MatchCounts = {
    severity: {},
    layer: {},
    status: {},
    category: {},
    confidence: {},
  }

  for (const f of findings) {
    const baseMatch = (dimToSkip: keyof FilterState) => {
      const testFilter = { ...filterState, [dimToSkip]: null }
      return findingMatchesFilters(
        f as Parameters<typeof findingMatchesFilters>[0],
        testFilter,
        searchQuery,
        aiSuggestionsEnabled,
      )
    }

    if (baseMatch('severity')) {
      counts.severity[f.severity] = (counts.severity[f.severity] ?? 0) + 1
    }
    if (baseMatch('layer')) {
      // Bucket L3 under 'L2' key to match filter group behavior (AI = L2+L3)
      const layerKey = f.detectedByLayer === 'L3' ? 'L2' : f.detectedByLayer
      counts.layer[layerKey] = (counts.layer[layerKey] ?? 0) + 1
    }
    if (baseMatch('status')) {
      // Bucket 're_accepted' under 'accepted' to match filter group behavior (M1)
      const statusKey = f.status === 're_accepted' ? 'accepted' : f.status
      counts.status[statusKey] = (counts.status[statusKey] ?? 0) + 1
    }
    if (baseMatch('category')) {
      counts.category[f.category] = (counts.category[f.category] ?? 0) + 1
    }
    if (baseMatch('confidence') && f.aiConfidence !== null) {
      const bucket = getConfidenceBucket(f.aiConfidence)
      counts.confidence[bucket] = (counts.confidence[bucket] ?? 0) + 1
    }
  }

  return counts
}

// ── Component ──

export function FilterBar({ findings, filteredCount }: FilterBarProps) {
  const filterState = useFileState((fs) => fs.filterState)
  const searchQuery = useFileState((fs) => fs.searchQuery)
  const aiSuggestionsEnabled = useFileState((fs) => fs.aiSuggestionsEnabled)
  const setFilter = useReviewStore((s) => s.setFilter)
  const resetFilters = useReviewStore((s) => s.resetFilters)
  const totalCount = findings.length

  // Dynamic category options from findings data
  const categoryOptions = useMemo(() => {
    const cats = new Set<string>()
    for (const f of findings) {
      cats.add(f.category)
    }
    const sorted = [...cats].sort()
    return [
      { value: null as string | null, label: 'All' },
      ...sorted.map((c) => ({ value: c, label: c })),
    ]
  }, [findings])

  // Single-pass match counts
  const matchCounts = useMemo(
    () => computeMatchCounts(findings, filterState, searchQuery, aiSuggestionsEnabled),
    [findings, filterState, searchQuery, aiSuggestionsEnabled],
  )

  // Active non-default filters for badge chips
  const activeChips = useMemo(() => {
    const chips: Array<{ dimension: keyof FilterState; value: string; label: string }> = []
    if (filterState.severity !== null && filterState.severity !== DEFAULT_FILTER_STATE.severity) {
      chips.push({
        dimension: 'severity',
        value: filterState.severity,
        label: `Severity: ${filterState.severity}`,
      })
    }
    if (filterState.status !== DEFAULT_FILTER_STATE.status) {
      if (filterState.status === null) {
        chips.push({ dimension: 'status', value: 'all', label: 'Status: All' })
      } else if (filterState.status !== 'pending') {
        chips.push({
          dimension: 'status',
          value: filterState.status,
          label: `Status: ${filterState.status}`,
        })
      }
    }
    if (filterState.layer !== null && filterState.layer !== DEFAULT_FILTER_STATE.layer) {
      const label = filterState.layer === 'L1' ? 'Rule-based' : 'AI'
      chips.push({ dimension: 'layer', value: filterState.layer, label: `Layer: ${label}` })
    }
    if (filterState.category !== null && filterState.category !== DEFAULT_FILTER_STATE.category) {
      chips.push({
        dimension: 'category',
        value: filterState.category,
        label: `Category: ${filterState.category}`,
      })
    }
    if (
      filterState.confidence !== null &&
      filterState.confidence !== DEFAULT_FILTER_STATE.confidence
    ) {
      chips.push({
        dimension: 'confidence',
        value: filterState.confidence,
        label: `Confidence: ${filterState.confidence}`,
      })
    }
    return chips
  }, [filterState])

  const hasNonDefaultFilters = activeChips.length > 0

  const removeChip = (dimension: keyof FilterState) => {
    setFilter(dimension, DEFAULT_FILTER_STATE[dimension] as FilterState[typeof dimension])
  }

  // ── Render helpers ──

  function renderFilterGroup<T extends string | null>(
    dimension: string,
    options: Array<{ value: T; label: string }>,
    currentValue: T,
    onSelect: (value: T) => void,
    countKey: keyof MatchCounts,
  ) {
    return (
      <div className="flex items-center gap-1" role="group" aria-label={`${dimension} filter`}>
        <span className="text-xs font-medium text-muted-foreground mr-1 capitalize">
          {dimension}:
        </span>
        {options.map((opt) => {
          const isActive = currentValue === opt.value
          const count =
            opt.value === null
              ? totalCount
              : ((matchCounts[countKey] as Record<string, number>)?.[opt.value as string] ?? 0)
          return (
            <Button
              key={opt.label}
              variant={isActive ? 'secondary' : 'ghost'}
              size="xs"
              aria-pressed={isActive}
              aria-label={`${opt.label} ${dimension} filter, ${count} of ${totalCount} findings match`}
              data-testid={`filter-${dimension}-${(opt.value ?? 'all').toString().toLowerCase()}`}
              className={cn(isActive && 'ring-1 ring-ring')}
              onClick={() => onSelect(opt.value)}
            >
              {opt.label}
            </Button>
          )
        })}
      </div>
    )
  }

  return (
    <div data-testid="filter-bar">
      <div
        role="toolbar"
        aria-label="Filter findings"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2"
      >
        {renderFilterGroup(
          'severity',
          SEVERITY_OPTIONS,
          filterState.severity,
          (v) => setFilter('severity', v),
          'severity',
        )}
        {renderFilterGroup(
          'layer',
          LAYER_OPTIONS,
          filterState.layer,
          (v) => setFilter('layer', v),
          'layer',
        )}
        {renderFilterGroup(
          'status',
          STATUS_OPTIONS,
          filterState.status,
          (v) => setFilter('status', v),
          'status',
        )}
        {renderFilterGroup(
          'category',
          categoryOptions,
          filterState.category,
          (v) => setFilter('category', v as string | null),
          'category',
        )}
        {renderFilterGroup(
          'confidence',
          CONFIDENCE_OPTIONS,
          filterState.confidence,
          (v) => setFilter('confidence', v),
          'confidence',
        )}
      </div>

      {/* Badge chips + Clear all */}
      {hasNonDefaultFilters && (
        <div className="flex items-center gap-2 py-1 flex-wrap">
          {activeChips.map((chip) => (
            <Badge
              key={`${chip.dimension}-${chip.value}`}
              variant="secondary"
              data-testid={`filter-chip-${chip.dimension}-${chip.value}`}
              className="gap-1 pl-2 pr-1"
            >
              {chip.label}
              <button
                data-testid="filter-chip-remove"
                aria-label={`Remove ${chip.label} filter`}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={() => removeChip(chip.dimension)}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </Badge>
          ))}
          <button
            data-testid="filter-clear-all"
            className="text-xs text-muted-foreground underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={resetFilters}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Showing X of Y findings */}
      <div
        data-testid="filter-count"
        aria-live="polite"
        className="text-xs text-muted-foreground py-1"
      >
        Showing {filteredCount} of {totalCount} findings
      </div>

      {/* Empty state */}
      {filteredCount === 0 && totalCount > 0 && (
        <div
          data-testid="filter-empty-state"
          className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground"
        >
          <p className="text-sm">No findings match your filters</p>
          <button
            className="mt-2 text-xs text-primary underline hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={resetFilters}
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  )
}
