'use client'

import { isCjkLang } from '@/features/review/utils/finding-display'

type SegmentTextDisplayProps = {
  fullText: string
  excerpt: string | null
  lang: string
  label: string
}

/**
 * Displays full segment text with optional excerpt highlighting via <mark>.
 * Sets lang attribute on outermost container (Guardrail #39, SC 3.1.2).
 * Applies 1.1x font scale for CJK languages (ja/zh/ko).
 */
export function SegmentTextDisplay({ fullText, excerpt, lang, label }: SegmentTextDisplayProps) {
  const isCjk = isCjkLang(lang)
  const effectiveLang = lang || undefined

  const highlighted = highlightExcerpt(fullText, excerpt)

  return (
    <div
      lang={effectiveLang}
      className={`text-sm break-words ${isCjk ? 'text-cjk-scale' : ''}`}
      data-testid={`segment-text-${label}`}
    >
      {highlighted}
    </div>
  )
}

/**
 * Splits fullText around the excerpt and wraps the match in <mark>.
 * Algorithm:
 * 1. Strip trailing "..." from excerpt (truncation indicator)
 * 2. Case-sensitive indexOf search
 * 3. Fallback: case-insensitive indexOf
 * 4. If not found: render fullText without highlight
 */
function highlightExcerpt(fullText: string, excerpt: string | null): React.ReactNode {
  if (!excerpt || excerpt.trim() === '') {
    return fullText
  }

  // Strip trailing "..." (truncation indicator from parser)
  const cleanedExcerpt = excerpt.endsWith('...') ? excerpt.slice(0, -3) : excerpt

  if (cleanedExcerpt === '' || cleanedExcerpt.length > fullText.length) {
    return fullText
  }

  // Case-sensitive search first
  let matchIndex = fullText.indexOf(cleanedExcerpt)

  // Fallback: case-insensitive
  if (matchIndex === -1) {
    matchIndex = fullText.toLowerCase().indexOf(cleanedExcerpt.toLowerCase())
  }

  if (matchIndex === -1) {
    return fullText
  }

  const before = fullText.slice(0, matchIndex)
  const match = fullText.slice(matchIndex, matchIndex + cleanedExcerpt.length)
  const after = fullText.slice(matchIndex + cleanedExcerpt.length)

  return (
    <>
      {before}
      <mark className="highlight-mark">{match}</mark>
      {after}
    </>
  )
}
