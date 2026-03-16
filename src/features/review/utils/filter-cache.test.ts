/**
 * Story 4.5 CR fix: sessionStorage-based filter cache
 * Replaces Zustand in-memory perFileFilterCache to survive full page reload
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  saveFilterCache,
  loadFilterCache,
  clearFilterCache,
} from '@/features/review/utils/filter-cache'
import type { FilterState } from '@/features/review/utils/filter-helpers'

// Mock sessionStorage for jsdom
const store: Record<string, string> = {}
const mockSessionStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key]
  }),
  clear: vi.fn(() => {
    for (const k of Object.keys(store)) delete store[k]
  }),
  get length() {
    return Object.keys(store).length
  },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
}

beforeEach(() => {
  mockSessionStorage.clear()
  vi.stubGlobal('sessionStorage', mockSessionStorage)
})

describe('filter-cache (sessionStorage)', () => {
  const fileId = 'file-abc-123'

  const filterState: FilterState = {
    severity: 'major',
    status: 'pending',
    layer: null,
    category: 'accuracy',
    confidence: 'high',
  }

  it('should save filter state to sessionStorage', () => {
    saveFilterCache(fileId, { filterState, searchQuery: '', aiSuggestionsEnabled: true })

    expect(mockSessionStorage.setItem).toHaveBeenCalledTimes(1)
    const key = mockSessionStorage.setItem.mock.calls[0]![0] as string
    expect(key).toContain(fileId)
  })

  it('should load saved filter state from sessionStorage', () => {
    saveFilterCache(fileId, { filterState, searchQuery: 'test query', aiSuggestionsEnabled: false })

    const loaded = loadFilterCache(fileId)
    expect(loaded).not.toBeNull()
    expect(loaded!.filterState.severity).toBe('major')
    expect(loaded!.filterState.category).toBe('accuracy')
    expect(loaded!.filterState.confidence).toBe('high')
    expect(loaded!.searchQuery).toBe('test query')
    expect(loaded!.aiSuggestionsEnabled).toBe(false)
  })

  it('should return null for never-visited file', () => {
    const loaded = loadFilterCache('never-visited')
    expect(loaded).toBeNull()
  })

  it('should return null and not crash on corrupted data', () => {
    mockSessionStorage.setItem(`filterCache:${fileId}`, 'not-json{{{')
    const loaded = loadFilterCache(fileId)
    expect(loaded).toBeNull()
  })

  it('should clear cache for specific file', () => {
    saveFilterCache(fileId, { filterState, searchQuery: '', aiSuggestionsEnabled: true })
    clearFilterCache(fileId)
    expect(loadFilterCache(fileId)).toBeNull()
  })

  it('should handle sessionStorage not available (SSR)', () => {
    vi.stubGlobal('sessionStorage', undefined)

    // Should not throw
    expect(() =>
      saveFilterCache(fileId, { filterState, searchQuery: '', aiSuggestionsEnabled: true }),
    ).not.toThrow()
    expect(loadFilterCache(fileId)).toBeNull()
  })

  it('should roundtrip all FilterState fields correctly', () => {
    const fullState: FilterState = {
      severity: 'critical',
      status: 'rejected',
      layer: 'L2',
      category: 'terminology',
      confidence: 'low',
    }
    saveFilterCache(fileId, {
      filterState: fullState,
      searchQuery: 'roundtrip',
      aiSuggestionsEnabled: false,
    })

    const loaded = loadFilterCache(fileId)!
    expect(loaded.filterState).toEqual(fullState)
    expect(loaded.searchQuery).toBe('roundtrip')
    expect(loaded.aiSuggestionsEnabled).toBe(false)
  })
})
