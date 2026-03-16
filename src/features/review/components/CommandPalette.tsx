import { useCallback, useMemo, useState } from 'react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { SeverityIndicator } from '@/features/review/components/SeverityIndicator'
import { useReviewStore, useFileState } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'

const MAX_FINDING_RESULTS = 20

type CommandAction = 'accept' | 'reject' | 'flag' | 'note' | 'source_issue'

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  findings: FindingForDisplay[]
  siblingFiles?: Array<{ fileId: string; fileName: string }>
  onNavigateToFile?: (fileId: string) => void
  onNavigateToFinding?: (findingId: string) => void
  onAction?: (action: CommandAction) => void
}

function truncate(text: string | null, max: number): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '…' : text
}

export function CommandPalette({
  open,
  onOpenChange,
  findings,
  siblingFiles = [],
  onNavigateToFile,
  onNavigateToFinding,
  onAction,
}: CommandPaletteProps) {
  const [inputValue, setInputValue] = useState('')
  const setSelectedFinding = useReviewStore((s) => s.setSelectedFinding)
  const setAiSuggestionsEnabled = useReviewStore((s) => s.setAiSuggestionsEnabled)
  const aiSuggestionsEnabled = useFileState((fs) => fs.aiSuggestionsEnabled)

  // Guardrail #11: Reset form state on re-open (adjust state during render pattern)
  const [prevOpen, setPrevOpen] = useState(false)
  if (open && !prevOpen) {
    setPrevOpen(true)
    setInputValue('')
  }
  if (!open && prevOpen) {
    setPrevOpen(false)
  }

  // Scope prefix: > = actions, # = findings, @ = files
  const scope = useMemo(() => {
    if (inputValue.startsWith('>')) return 'actions'
    if (inputValue.startsWith('#')) return 'findings'
    if (inputValue.startsWith('@')) return 'files'
    return 'all'
  }, [inputValue])

  // Strip prefix from search query
  const searchTerm = useMemo(() => {
    if (scope !== 'all') return inputValue.slice(1).trim()
    return inputValue.trim()
  }, [inputValue, scope])

  // Fuzzy-match findings (limit to MAX_FINDING_RESULTS)
  const { matchedFindings, totalMatched } = useMemo(() => {
    if (scope === 'actions' || scope === 'files') return { matchedFindings: [], totalMatched: 0 }
    const lower = searchTerm.toLocaleLowerCase()
    const matched = findings.filter((f) => {
      if (!lower) return true
      const desc = f.description?.toLocaleLowerCase() ?? ''
      const source = f.sourceTextExcerpt?.toLocaleLowerCase() ?? ''
      const target = f.targetTextExcerpt?.toLocaleLowerCase() ?? ''
      return desc.includes(lower) || source.includes(lower) || target.includes(lower)
    })
    return { matchedFindings: matched.slice(0, MAX_FINDING_RESULTS), totalMatched: matched.length }
  }, [findings, searchTerm, scope])

  const handleSelectFinding = useCallback(
    (findingId: string) => {
      // H2 fix: use onNavigateToFinding callback to sync activeFindingState (desktop detail panel)
      if (onNavigateToFinding) {
        onNavigateToFinding(findingId)
      } else {
        setSelectedFinding(findingId)
      }
      onOpenChange(false)
      setInputValue('')
    },
    [setSelectedFinding, onOpenChange, onNavigateToFinding],
  )

  const handleSelectFile = useCallback(
    (fileId: string) => {
      onNavigateToFile?.(fileId)
      onOpenChange(false)
      setInputValue('')
    },
    [onNavigateToFile, onOpenChange],
  )

  const resetFilters = useReviewStore((s) => s.resetFilters)

  const handleSelectAction = useCallback(
    (action: string) => {
      switch (action) {
        case 'clear-filters':
          resetFilters()
          break
        case 'toggle-ai': {
          // H5 fix: use getState() to avoid stale closure
          const current = useReviewStore.getState().aiSuggestionsEnabled
          setAiSuggestionsEnabled(!current)
          break
        }
        default:
          onAction?.(action as CommandAction)
      }
      onOpenChange(false)
      setInputValue('')
    },
    [resetFilters, setAiSuggestionsEnabled, onAction, onOpenChange],
  )

  // Actions list
  const actions = useMemo(
    () => [
      { id: 'clear-filters', label: 'Clear All Filters' },
      {
        id: 'toggle-ai',
        label: `Toggle AI Suggestions (${aiSuggestionsEnabled ? 'ON→OFF' : 'OFF→ON'})`,
      },
      { id: 'accept', label: 'Accept Finding' },
      { id: 'reject', label: 'Reject Finding' },
      { id: 'flag', label: 'Flag Finding' },
      { id: 'note', label: 'Add Note' },
      { id: 'source_issue', label: 'Source Issue' },
    ],
    [aiSuggestionsEnabled],
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Type a command or search..."
        value={inputValue}
        onValueChange={setInputValue}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Actions group */}
        {(scope === 'all' || scope === 'actions') && (
          <CommandGroup heading="Actions">
            {actions.map((action) => (
              <CommandItem
                key={action.id}
                value={`action-${action.id}`}
                onSelect={() => handleSelectAction(action.id)}
              >
                {action.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Findings group */}
        {(scope === 'all' || scope === 'findings') && matchedFindings.length > 0 && (
          <CommandGroup heading="Findings">
            {matchedFindings.map((f) => (
              <CommandItem
                key={f.id}
                value={`finding-${f.id}-${f.description}`}
                onSelect={() => handleSelectFinding(f.id)}
              >
                <SeverityIndicator severity={f.severity} />
                <span className="text-xs text-muted-foreground">{f.category}</span>
                <span className="flex-1 truncate text-xs">
                  {truncate(f.sourceTextExcerpt, 30)}→{truncate(f.targetTextExcerpt, 30)}
                </span>
                {f.aiConfidence !== null && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(f.aiConfidence)}%
                  </span>
                )}
              </CommandItem>
            ))}
            {totalMatched > MAX_FINDING_RESULTS && (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                Show more... ({totalMatched - MAX_FINDING_RESULTS} more)
              </div>
            )}
          </CommandGroup>
        )}

        {/* Files group */}
        {(scope === 'all' || scope === 'files') && siblingFiles.length > 0 && (
          <CommandGroup heading="Files">
            {siblingFiles.map((file) => (
              <CommandItem
                key={file.fileId}
                value={`file-${file.fileName}`}
                onSelect={() => handleSelectFile(file.fileId)}
              >
                {file.fileName}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
