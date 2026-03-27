'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { BackTranslationSection } from '@/features/bridge/components/BackTranslationSection'
import { ConfidenceIndicator } from '@/features/bridge/components/ConfidenceIndicator'
import { ContextualExplanation } from '@/features/bridge/components/ContextualExplanation'
import { LanguageBridgeSkeleton } from '@/features/bridge/components/LanguageBridgeSkeleton'
import { useBackTranslation } from '@/features/bridge/hooks/useBackTranslation'
import type { BridgePanelState } from '@/features/bridge/types'
import { cn } from '@/lib/utils'

type LanguageBridgePanelProps = {
  segmentId: string | null
  sourceLang: string
  projectId: string
  isNonNative: boolean
  confidenceThreshold?: number | undefined
}

/**
 * LanguageBridge panel — persistent section in FindingDetailContent.
 *
 * AC4: 5 visual states (standard, hidden, confidence-warning, loading, error).
 * Guardrail #33: aria-live="polite" on content updates.
 * Guardrail #70: lang attribute on BT text.
 * Guardrail #77: Cached vs fresh indicator.
 */
export function LanguageBridgePanel({
  segmentId,
  sourceLang,
  projectId,
  isNonNative,
  confidenceThreshold = 0.6,
}: LanguageBridgePanelProps) {
  const { data, loading, error, cached, refresh } = useBackTranslation({
    segmentId: isNonNative ? segmentId : null, // AC4 state 2: don't fetch for native
    projectId,
  })

  // AC4 state 2: Hidden when native pair detected
  if (!isNonNative) return null

  // AC4 state 2: Hidden when no segmentId (cross-file findings)
  if (!segmentId) return null

  // Determine panel state
  const panelState = determinePanelState({ loading, error, data, confidenceThreshold })

  return (
    <section
      data-testid="language-bridge-panel"
      data-state={panelState}
      className={cn('rounded border p-3 space-y-3', getPanelBorderClass(panelState))}
    >
      {/* Header with cached indicator (Guardrail #77) */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Language Bridge</h3>
        <div className="flex items-center gap-2">
          {data && !loading && (
            <>
              {cached && (
                <span
                  className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground"
                  data-testid="cached-badge"
                >
                  Cached
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={refresh}
                className="h-6 w-6 p-0 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
                aria-label="Refresh back-translation"
                data-testid="bt-refresh-button"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content area with aria-live for screen readers (Guardrail #33) */}
      <div aria-live="polite" aria-atomic="true">
        {/* AC4 state 4: Loading */}
        {panelState === 'loading' && <LanguageBridgeSkeleton />}

        {/* AC4 state 5: Error */}
        {panelState === 'error' && (
          <div className="flex items-center gap-2 text-sm text-error" data-testid="bt-error">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Back-translation unavailable</span>
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              className="ml-auto focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
              data-testid="bt-retry-button"
            >
              Retry
            </Button>
          </div>
        )}

        {/* AC4 state 1 & 3: Standard / Confidence Warning */}
        {data && !loading && !error && (
          <>
            {/* AC4 state 3: Confidence warning text */}
            {panelState === 'confidence-warning' && (
              <p className="text-xs text-warning font-medium mb-2" data-testid="confidence-warning">
                Flag recommended — low confidence back-translation
              </p>
            )}

            <BackTranslationSection
              backTranslation={data.backTranslation}
              sourceLang={sourceLang}
            />

            <ContextualExplanation
              explanation={data.contextualExplanation}
              languageNotes={data.languageNotes}
            />

            <ConfidenceIndicator confidence={data.confidence} />
          </>
        )}
      </div>
    </section>
  )
}

function determinePanelState({
  loading,
  error,
  data,
  confidenceThreshold,
}: {
  loading: boolean
  error: string | null
  data: { confidence: number } | null
  confidenceThreshold: number
}): BridgePanelState {
  if (loading) return 'loading'
  if (error) return 'error'
  if (data && data.confidence < confidenceThreshold) return 'confidence-warning'
  if (data) return 'standard'
  return 'loading' // Initial state before first fetch
}

function getPanelBorderClass(state: BridgePanelState): string {
  switch (state) {
    case 'confidence-warning':
      return 'border-warning'
    case 'error':
      return 'border-error'
    default:
      return 'border-border'
  }
}
