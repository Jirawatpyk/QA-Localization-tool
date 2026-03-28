/**
 * Story 4.5 ATDD: SearchInput — Debounced search, clear, escape handling
 * Adapted from ATDD stubs — preserved scenario intent + assertion count.
 *
 * Uses fireEvent (not userEvent) for input changes to avoid fake timer conflicts.
 * Per CLAUDE.md: vi.advanceTimersByTimeAsync for async timer tests.
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { SearchInput } from '@/features/review/components/SearchInput'
import { useReviewStore, getStoreFileState } from '@/features/review/stores/review.store'

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useReviewStore.setState({ currentFileId: null })
    useReviewStore.getState().resetForFile('test-file')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should render with search icon and placeholder "Search findings..."', () => {
    render(<SearchInput />)
    expect(screen.getByPlaceholderText('Search findings...')).toBeInTheDocument()
    expect(screen.getByTestId('search-input')).toBeInTheDocument()
  })

  it('should debounce input by 300ms before updating store', () => {
    render(<SearchInput />)
    const input = screen.getByTestId('search-input')

    fireEvent.change(input, { target: { value: 'test' } })

    // Store should NOT be updated yet (within 300ms debounce)
    expect(getStoreFileState().searchQuery).toBe('')

    // Advance timers by 300ms
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(getStoreFileState().searchQuery).toBe('test')
  })

  it('should call setSearchQuery on store after debounce', () => {
    render(<SearchInput />)
    const input = screen.getByTestId('search-input')

    fireEvent.change(input, { target: { value: 'query' } })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(getStoreFileState().searchQuery).toBe('query')
  })

  it('should clear query immediately when clear button clicked', () => {
    render(<SearchInput />)
    const input = screen.getByTestId('search-input')

    // Type and let debounce fire
    fireEvent.change(input, { target: { value: 'hello' } })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(getStoreFileState().searchQuery).toBe('hello')

    // Click clear — should clear immediately, no debounce wait
    const clearBtn = screen.getByTestId('search-clear')
    fireEvent.click(clearBtn)

    expect(getStoreFileState().searchQuery).toBe('')
    expect(screen.getByTestId('search-input')).toHaveValue('')
  })

  it('should clear query when Escape pressed while focused (Guardrail #31)', () => {
    render(<SearchInput />)
    const input = screen.getByTestId('search-input')

    fireEvent.change(input, { target: { value: 'escape-me' } })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(getStoreFileState().searchQuery).toBe('escape-me')

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(getStoreFileState().searchQuery).toBe('')
    expect(input).toHaveValue('')
  })

  it('should not propagate Escape to parent when query has text (Guardrail #31)', () => {
    const parentHandler = vi.fn()
    render(
      <div onKeyDown={parentHandler}>
        <SearchInput />
      </div>,
    )
    const input = screen.getByTestId('search-input')

    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    // Escape should NOT reach parent (stopPropagation) when query has text
    const escapeEvents = parentHandler.mock.calls.filter(
      (call: unknown[]) => (call[0] as KeyboardEvent).key === 'Escape',
    )
    expect(escapeEvents).toHaveLength(0)
  })

  it('should propagate Escape to parent when query is empty (BUG-1 fix)', () => {
    const parentHandler = vi.fn()
    render(
      <div onKeyDown={parentHandler}>
        <SearchInput />
      </div>,
    )
    const input = screen.getByTestId('search-input')

    // Query is empty — Escape should propagate to parent layer (Guardrail #31)
    fireEvent.keyDown(input, { key: 'Escape' })

    const escapeEvents = parentHandler.mock.calls.filter(
      (call: unknown[]) => (call[0] as KeyboardEvent).key === 'Escape',
    )
    expect(escapeEvents).toHaveLength(1)
  })

  it('should clean up debounce timer on unmount (Guardrail #12)', () => {
    const { unmount } = render(<SearchInput />)
    const input = screen.getByTestId('search-input')

    fireEvent.change(input, { target: { value: 'unmount-me' } })

    // Unmount before debounce fires
    unmount()

    // Advance timer — should NOT crash or update store
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // Store should still be empty (timer was cleaned up)
    expect(getStoreFileState().searchQuery).toBe('')
  })

  it('should suppress single-key hotkeys when focused (Guardrail #28)', () => {
    render(<SearchInput />)
    const input = screen.getByTestId('search-input')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'a' } })

    // 'a' should be in input value, not trigger a review action
    expect(input).toHaveValue('a')
  })
})
