'use client'

import { CheckCircle2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AutoPassRationaleData } from '@/features/scoring/types'

type AutoPassRationaleProps = {
  rationale: string
}

function tryParseRationale(rationale: string): AutoPassRationaleData | null {
  try {
    return JSON.parse(rationale) as AutoPassRationaleData
  } catch {
    return null
  }
}

/**
 * Renders structured JSON rationale from auto-passed scores.
 * Falls back to raw text for legacy rationale strings.
 */
export function AutoPassRationale({ rationale }: AutoPassRationaleProps) {
  if (!rationale) {
    return <p className="text-muted-foreground text-sm">No rationale available</p>
  }

  const data = tryParseRationale(rationale)

  // Legacy fallback: raw text display
  if (!data) {
    return <p className="text-sm">{rationale}</p>
  }

  const { score, threshold, margin, severityCounts, riskiestFinding, criteria } = data

  return (
    <Card data-testid="auto-pass-rationale">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Auto-Pass Rationale</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Score & threshold */}
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">{score}</span>
          <span className="text-muted-foreground text-sm">/ {threshold}</span>
          <Badge variant={margin >= 0 ? 'default' : 'destructive'}>
            {margin >= 0 ? '+' : ''}
            {margin.toFixed(1)}
          </Badge>
        </div>

        {/* Severity counts */}
        <div className="flex gap-3 text-sm">
          <span>
            Critical: <strong>{severityCounts.critical}</strong>
          </span>
          <span>
            Major: <strong>{severityCounts.major}</strong>
          </span>
          <span>
            Minor: <strong>{severityCounts.minor}</strong>
          </span>
        </div>

        {/* Riskiest finding */}
        {riskiestFinding && (
          <div data-testid="riskiest-finding" className="text-sm">
            <p className="text-muted-foreground mb-1">Riskiest finding:</p>
            <p>
              <Badge variant="outline" className="mr-1">
                {riskiestFinding.severity}
              </Badge>
              {riskiestFinding.description}
              {riskiestFinding.confidence !== null && (
                <span className="text-muted-foreground ml-1">({riskiestFinding.confidence}%)</span>
              )}
            </p>
          </div>
        )}

        {/* Criteria checkmarks */}
        <div data-testid="auto-pass-criteria" className="space-y-1 text-sm">
          {criteria.scoreAboveThreshold && (
            <div
              data-testid="criterion-score-above-threshold"
              className="flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4 text-status-pass" />
              <span>Score above threshold</span>
            </div>
          )}
          {criteria.noCriticalFindings && (
            <div data-testid="criterion-no-critical" className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-status-pass" />
              <span>No critical findings</span>
            </div>
          )}
          {criteria.allLayersComplete && (
            <div data-testid="criterion-all-layers-complete" className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-status-pass" />
              <span>All layers complete</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
