/**
 * ATDD GREEN PHASE — Story 4.1c: Detail Panel & Segment Context
 * Component: SegmentTextDisplay
 *
 * Renders full text with `<mark>` highlight for the excerpt substring.
 * Guardrails referenced: #39 (lang attribute), #25 (color not sole info)
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { SegmentTextDisplay } from '@/features/review/components/SegmentTextDisplay'

describe('SegmentTextDisplay', () => {
  // ═══════════════════════════════════════════════════════════════════════
  // AC2: Full Segment Text with Highlighted Excerpts
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C1.1][P0] should highlight exact substring match with <mark>', () => {
    render(
      <SegmentTextDisplay
        fullText="The quick brown fox jumps over the lazy dog"
        excerpt="brown fox"
        lang="en-US"
        label="source"
      />,
    )
    const mark = screen.getByText('brown fox')
    expect(mark.tagName).toBe('MARK')
    // Full text still readable
    expect(screen.getByText(/The quick/)).toBeInTheDocument()
    expect(screen.getByText(/jumps over/)).toBeInTheDocument()
  })

  it('[T-C1.2][P1] should highlight case-insensitive fallback when exact match fails', () => {
    render(
      <SegmentTextDisplay
        fullText="The Quick Brown Fox"
        excerpt="quick brown"
        lang="en-US"
        label="source"
      />,
    )
    const mark = screen.getByText('Quick Brown')
    expect(mark.tagName).toBe('MARK')
  })

  it('[T-C1.3][P1] should render full text without highlight when excerpt not found', () => {
    render(
      <SegmentTextDisplay
        fullText="The quick brown fox"
        excerpt="missing phrase"
        lang="en-US"
        label="source"
      />,
    )
    expect(document.querySelector('mark')).toBeNull()
    expect(screen.getByText('The quick brown fox')).toBeInTheDocument()
  })

  it('[T-C1.4][P1] should strip trailing "..." before matching', () => {
    render(
      <SegmentTextDisplay
        fullText="The quick brown fox jumps"
        excerpt="brown fox..."
        lang="en-US"
        label="source"
      />,
    )
    const mark = screen.getByText('brown fox')
    expect(mark.tagName).toBe('MARK')
  })

  it('[T-C1.5][P1] should render full text when excerpt is null', () => {
    render(
      <SegmentTextDisplay
        fullText="The quick brown fox"
        excerpt={null}
        lang="en-US"
        label="source"
      />,
    )
    expect(document.querySelector('mark')).toBeNull()
    expect(screen.getByText('The quick brown fox')).toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC6: Thai/CJK Language & Accessibility
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C1.6][P0] should set lang attribute on outermost text container', () => {
    render(
      <SegmentTextDisplay
        fullText="The quick brown fox"
        excerpt={null}
        lang="en-US"
        label="source"
      />,
    )
    const container = screen.getByText('The quick brown fox').closest('[lang]')
    expect(container?.getAttribute('lang')).toBe('en-US')
  })

  it('[T-C1.7][P1] should apply CJK text-cjk-scale for ja/zh/ko languages', () => {
    render(
      <SegmentTextDisplay
        fullText="品質チェックリスト"
        excerpt={null}
        lang="ja-JP"
        label="source"
      />,
    )
    const container = screen.getByText('品質チェックリスト').closest('[lang]')
    expect(container?.className).toContain('text-cjk-scale')
  })

  it('[T-C1.8][P1] should set lang="th" for Thai text without CJK scale', () => {
    render(
      <SegmentTextDisplay
        fullText="สุนัขจิ้งจอกสีน้ำตาล"
        excerpt={null}
        lang="th-TH"
        label="source"
      />,
    )
    const container = screen.getByText('สุนัขจิ้งจอกสีน้ำตาล').closest('[lang]')
    expect(container?.getAttribute('lang')).toBe('th-TH')
    expect(container?.className).not.toContain('text-cjk-scale')
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Boundary Value Tests (MANDATORY — Epic 2 Retro A2)
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C1.9][P1] should not highlight when excerpt is empty string', () => {
    render(<SegmentTextDisplay fullText="Some text here" excerpt="" lang="en-US" label="source" />)
    expect(document.querySelector('mark')).toBeNull()
    expect(screen.getByText('Some text here')).toBeInTheDocument()
  })

  it('[T-C1.10][P1] should not highlight when excerpt is whitespace-only', () => {
    render(
      <SegmentTextDisplay fullText="Some text here" excerpt="   " lang="en-US" label="source" />,
    )
    expect(document.querySelector('mark')).toBeNull()
  })

  it('[T-C1.11][P1] should handle regex special chars in excerpt via indexOf (not regex)', () => {
    render(
      <SegmentTextDisplay
        fullText="Please find[this] item"
        excerpt="find[this]"
        lang="en-US"
        label="source"
      />,
    )
    const mark = screen.getByText('find[this]')
    expect(mark.tagName).toBe('MARK')
  })

  it('[T-C1.12][P1] should not highlight when excerpt is longer than fullText', () => {
    render(
      <SegmentTextDisplay
        fullText="Short"
        excerpt="This excerpt is much longer than the full text"
        lang="en-US"
        label="source"
      />,
    )
    expect(document.querySelector('mark')).toBeNull()
    expect(screen.getByText('Short')).toBeInTheDocument()
  })

  it('[T-C1.13][P1] should highlight only first occurrence when excerpt appears multiple times', () => {
    render(
      <SegmentTextDisplay
        fullText="the quick brown the fox"
        excerpt="the"
        lang="en-US"
        label="source"
      />,
    )
    const marks = document.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0]!.textContent).toBe('the')
  })

  // ═══════════════════════════════════════════════════════════════════════
  // P2: Edge Cases & Security
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C1.14][P2] should render HTML-like content in excerpt as text, not HTML (XSS)', () => {
    render(
      <SegmentTextDisplay
        fullText='Some <script>alert("xss")</script> text'
        excerpt='<script>alert("xss")</script>'
        lang="en-US"
        label="source"
      />,
    )
    // Should render as text, not execute
    const mark = screen.getByText('<script>alert("xss")</script>')
    expect(mark.tagName).toBe('MARK')
    expect(document.querySelector('script')).toBeNull()
  })

  it('[T-C1.15][P2] should not render stray empty before-span when excerpt is at start', () => {
    render(
      <SegmentTextDisplay
        fullText="brown fox jumps"
        excerpt="brown fox"
        lang="en-US"
        label="source"
      />,
    )
    const mark = screen.getByText('brown fox')
    expect(mark.tagName).toBe('MARK')
    // No empty sibling before the mark
    const prevSibling = mark.previousSibling
    if (prevSibling) {
      expect(prevSibling.textContent).not.toBe('')
    }
  })

  it('[T-C1.16][P2] should not render trailing empty after-span when excerpt is at end', () => {
    render(
      <SegmentTextDisplay
        fullText="The quick brown fox"
        excerpt="brown fox"
        lang="en-US"
        label="source"
      />,
    )
    const mark = screen.getByText('brown fox')
    expect(mark.tagName).toBe('MARK')
    // No empty sibling after the mark
    const nextSibling = mark.nextSibling
    if (nextSibling) {
      expect(nextSibling.textContent).not.toBe('')
    }
  })

  it('[T-C1.17][P2] should set correct lang attr for RTL language (ar)', () => {
    render(
      <SegmentTextDisplay fullText="نص باللغة العربية" excerpt={null} lang="ar" label="source" />,
    )
    const container = screen.getByText('نص باللغة العربية').closest('[lang]')
    expect(container?.getAttribute('lang')).toBe('ar')
  })
})
