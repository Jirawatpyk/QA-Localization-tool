'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ScoreBadgeSize, ScoreBadgeState } from '@/types/finding'

type ScoreBadgeProps = {
  score: number | null
  state?: ScoreBadgeState | undefined
  size?: ScoreBadgeSize | undefined
  criticalCount?: number | undefined
}

const STATE_LABELS: Record<ScoreBadgeState, string> = {
  pass: 'Passed',
  review: 'Review',
  fail: 'Fail',
  analyzing: 'Analyzing...',
  'rule-only': 'Rule-based',
  'ai-screened': 'AI Screened',
  'deep-analyzed': 'Deep Analyzed',
}

const STATE_CLASSES: Record<ScoreBadgeState, string> = {
  pass: 'bg-status-pass/10 text-status-pass border-status-pass/20',
  review: 'bg-status-pending/10 text-status-pending border-status-pending/20',
  fail: 'bg-status-fail/10 text-status-fail border-status-fail/20',
  analyzing: 'bg-status-analyzing/10 text-status-analyzing border-status-analyzing/20',
  'rule-only': 'bg-info/10 text-info border-info/20',
  'ai-screened': 'bg-status-ai-screened/10 text-status-ai-screened border-status-ai-screened/20',
  'deep-analyzed':
    'bg-status-deep-analyzed/10 text-status-deep-analyzed border-status-deep-analyzed/20',
}

const MUTED_CLASSES = 'bg-muted text-muted-foreground border-muted'

const SIZE_TEXT: Record<ScoreBadgeSize, string> = {
  sm: 'text-xs',
  md: 'text-2xl',
  lg: 'text-5xl',
}

const SIZE_PADDING: Record<ScoreBadgeSize, string> = {
  sm: 'px-2 py-0.5',
  md: 'px-3 py-1',
  lg: 'px-4 py-2',
}

function deriveState(
  score: number | null,
  criticalCount: number | undefined,
): ScoreBadgeState | null {
  if (score === null) return null
  if (score < 70) return 'fail'
  if (score >= 95 && (criticalCount ?? 0) === 0) return 'pass'
  return 'review'
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  const handleChange = useCallback((e: MediaQueryListEvent) => {
    setReduced(e.matches)
  }, [])

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [handleChange])

  return reduced
}

export function ScoreBadge({ score, state, size = 'sm', criticalCount }: ScoreBadgeProps) {
  const reducedMotion = useReducedMotion()
  const prevScoreRef = useRef<number | null>(score)
  const scoreTextRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const prev = prevScoreRef.current
    prevScoreRef.current = score

    const el = scoreTextRef.current
    if (!el) return

    el.classList.remove('animate-slide-up', 'animate-slide-down')

    if (reducedMotion || prev === null || score === null || prev === score) {
      return
    }

    const cls = score > prev ? 'animate-slide-up' : 'animate-slide-down'
    el.classList.add(cls)

    const timer = setTimeout(() => el.classList.remove(cls), 300)
    return () => clearTimeout(timer)
  }, [score, reducedMotion])

  const displayText = score !== null ? score.toFixed(1) : 'N/A'

  // Determine effective state
  const effectiveState = state ?? deriveState(score, criticalCount)
  const isMuted = effectiveState === null
  const stateClasses = isMuted ? MUTED_CLASSES : STATE_CLASSES[effectiveState]
  const label = effectiveState !== null ? STATE_LABELS[effectiveState] : undefined

  const isAnalyzing = effectiveState === 'analyzing'
  const pulseClass = isAnalyzing && !reducedMotion ? 'animate-pulse' : ''
  const opacityClass = isAnalyzing ? 'opacity-60' : ''

  const showLabelVisible = (size === 'md' || size === 'lg') && label
  const showLabelTooltip = size === 'sm' && label

  return (
    <span
      data-testid="score-badge"
      className={`inline-flex flex-col items-center rounded-md border font-semibold ${SIZE_PADDING[size]} ${stateClasses} ${pulseClass}`}
      {...(showLabelTooltip ? { title: label, 'aria-label': label } : {})}
    >
      <span ref={scoreTextRef} className={`${SIZE_TEXT[size]} ${opacityClass}`}>
        {displayText}
      </span>
      {showLabelVisible && <span className="text-xs mt-0.5">{label}</span>}
    </span>
  )
}
