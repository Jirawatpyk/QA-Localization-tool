/**
 * Story 4.5 ATDD: FindingCardCompact — Search highlight rendering
 * Adapted from ATDD stubs — preserved scenario intent + assertion count.
 */
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { highlightText } from '@/features/review/components/FindingCardCompact'

describe('FindingCardCompact search highlight', () => {
  it('should render mark element around matching text', () => {
    const { container } = render(<>{highlightText('accuracy check', 'accuracy')}</>)
    const mark = container.querySelector('mark')
    expect(mark).not.toBeNull()
    expect(mark?.textContent).toBe('accuracy')
  })

  it('should not render mark when searchQuery is empty', () => {
    const { container } = render(<>{highlightText('some text', '')}</>)
    const mark = container.querySelector('mark')
    expect(mark).toBeNull()
    expect(container.textContent).toBe('some text')
  })

  it('should highlight in source text', () => {
    const { container } = render(<>{highlightText('Source text with keyword here', 'keyword')}</>)
    const mark = container.querySelector('mark')
    expect(mark).not.toBeNull()
    expect(mark?.textContent).toBe('keyword')
  })

  it('should highlight in description text', () => {
    const { container } = render(<>{highlightText('Missing translation found', 'translation')}</>)
    const mark = container.querySelector('mark')
    expect(mark?.textContent).toBe('translation')
  })

  it('should handle special characters ( [ * in searchQuery without error (E5 fix)', () => {
    // indexOf-based — no regex escaping issues
    expect(() => render(<>{highlightText('test[1] data', 'test[1]')}</>)).not.toThrow()
    expect(() => render(<>{highlightText('(test) data', '(test)')}</>)).not.toThrow()
    expect(() => render(<>{highlightText('test* data', 'test*')}</>)).not.toThrow()

    const { container } = render(<>{highlightText('test[1] data', 'test[1]')}</>)
    const mark = container.querySelector('mark')
    expect(mark?.textContent).toBe('test[1]')
  })

  it('should be case-insensitive for highlighting', () => {
    const { container } = render(<>{highlightText('Missing Translation', 'missing')}</>)
    const mark = container.querySelector('mark')
    expect(mark).not.toBeNull()
    // Preserves original case
    expect(mark?.textContent).toBe('Missing')
  })

  it('should highlight ALL matching occurrences, not just the first', () => {
    const { container } = render(<>{highlightText('test foo test bar test', 'test')}</>)
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(3)
    expect(marks[0]?.textContent).toBe('test')
    expect(marks[1]?.textContent).toBe('test')
    expect(marks[2]?.textContent).toBe('test')
  })
})
