import type { FilterState } from '@/features/review/utils/filter-helpers'

type FilterCacheEntry = {
  filterState: FilterState
  searchQuery: string
  aiSuggestionsEnabled: boolean
}

const CACHE_PREFIX = 'filterCache:'

function getStorage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

export function saveFilterCache(fileId: string, entry: FilterCacheEntry): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(`${CACHE_PREFIX}${fileId}`, JSON.stringify(entry))
  } catch {
    // sessionStorage full or not available — silently ignore
  }
}

export function loadFilterCache(fileId: string): FilterCacheEntry | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(`${CACHE_PREFIX}${fileId}`)
    if (!raw) return null
    return JSON.parse(raw) as FilterCacheEntry
  } catch {
    return null
  }
}

export function clearFilterCache(fileId: string): void {
  const storage = getStorage()
  if (!storage) return
  storage.removeItem(`${CACHE_PREFIX}${fileId}`)
}
