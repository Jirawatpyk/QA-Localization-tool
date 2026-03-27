'use client'

import { AlertTriangle, CheckCircle, HelpCircle, XCircle } from 'lucide-react'

/**
 * Visual confidence indicator for back-translation accuracy (0.0–1.0).
 *
 * Guardrail #25: Color is never the sole information carrier — uses icon (distinct shape) + text + color.
 * Guardrail #36: Min 16px icon, aria-hidden on icon (text label is accessible name).
 */
export function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const { label, textClass, bgClass, Icon } = getConfidenceConfig(confidence)

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium ${bgClass} ${textClass}`}
      data-testid="confidence-indicator"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        {label} ({(confidence * 100).toFixed(0)}%)
      </span>
    </div>
  )
}

function getConfidenceConfig(confidence: number) {
  if (confidence >= 0.8) {
    return {
      label: 'High confidence',
      textClass: 'text-success',
      bgClass: 'bg-success/10 border border-success/20',
      Icon: CheckCircle,
    }
  }
  if (confidence >= 0.6) {
    return {
      label: 'Moderate confidence',
      textClass: 'text-info',
      bgClass: 'bg-info/10 border border-info/20',
      Icon: HelpCircle,
    }
  }
  if (confidence >= 0.4) {
    return {
      label: 'Low confidence',
      textClass: 'text-warning',
      bgClass: 'bg-warning/10 border border-warning/20',
      Icon: AlertTriangle,
    }
  }
  return {
    label: 'Very low confidence',
    textClass: 'text-error',
    bgClass: 'bg-error/10 border border-error/20',
    Icon: XCircle,
  }
}
