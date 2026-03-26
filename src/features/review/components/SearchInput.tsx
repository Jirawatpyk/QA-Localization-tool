import { Search, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useReviewStore, useFileState } from '@/features/review/stores/review.store'

const DEBOUNCE_MS = 300

export function SearchInput() {
  const setSearchQuery = useReviewStore((s) => s.setSearchQuery)
  const storeQuery = useFileState((fs) => fs.searchQuery)
  const [localValue, setLocalValue] = useState(storeQuery)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local value from store when store resets (e.g., file switch)
  // Cancel any pending debounce timer to prevent stale value overwriting the reset (M1 CR fix)
  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- valid external→local state sync: Zustand store resets on file switch, local input must follow
    setLocalValue(storeQuery)
  }, [storeQuery])

  // Cleanup timer on unmount (Guardrail #12)
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const updateStore = useCallback(
    (query: string) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        setSearchQuery(query)
        timerRef.current = null
      }, DEBOUNCE_MS)
    },
    [setSearchQuery],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setLocalValue(val)
    updateStore(val)
  }

  const handleClear = () => {
    // Clear immediately — no debounce
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setLocalValue('')
    setSearchQuery('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Guardrail #31: innermost layer closes first — only consume Escape when there's
      // something to clear. If empty, let Escape propagate to parent layer (detail panel, etc.)
      if (localValue.length > 0) {
        e.stopPropagation()
        handleClear()
      }
      return
    }
    // Guardrail #28: stop single-key hotkeys from propagating when input focused
    // (native input behavior — keys typed in input don't bubble as hotkeys)
  }

  return (
    <div className="relative" data-testid="search-container">
      <Search
        className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
        aria-hidden="true"
      />
      <Input
        data-testid="search-input"
        type="search"
        placeholder="Search findings..."
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="pl-8 pr-8 h-8 text-sm"
        aria-label="Search findings"
      />
      {localValue.length > 0 && (
        <Button
          data-testid="search-clear"
          variant="ghost"
          size="icon-xs"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={handleClear}
          aria-label="Clear search"
        >
          <X className="size-3" aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}
