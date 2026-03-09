'use client'

import { AlertTriangle, Info, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { FindingSeverity } from '@/types/finding'

export type SeverityIndicatorProps = {
  severity: FindingSeverity
  sourceLang?: string | undefined
  targetLang?: string | undefined
  sourceText?: string | undefined
  targetText?: string | undefined
}

/** Guardrail #36: icon shape + text + color, icon min 16px */
const SEVERITY_CONFIG: Record<
  FindingSeverity,
  { Icon: LucideIcon; label: string; classes: string }
> = {
  critical: {
    Icon: XCircle,
    label: 'Critical',
    classes: 'bg-severity-critical/10 text-severity-critical border-severity-critical/20',
  },
  major: {
    Icon: AlertTriangle,
    label: 'Major',
    classes: 'bg-severity-major/10 text-severity-major border-severity-major/20',
  },
  minor: {
    Icon: Info,
    label: 'Minor',
    classes: 'bg-severity-minor/10 text-severity-minor border-severity-minor/20',
  },
}

const CJK_LANGS = new Set(['ja', 'zh', 'ko', 'ja-JP', 'zh-CN', 'zh-TW', 'ko-KR'])

function isCjkLang(lang: string | undefined): boolean {
  if (!lang) return false
  return (
    CJK_LANGS.has(lang) || lang.startsWith('ja') || lang.startsWith('zh') || lang.startsWith('ko')
  )
}

export function SeverityIndicator({
  severity,
  sourceLang,
  targetLang,
  sourceText,
  targetText,
}: SeverityIndicatorProps) {
  const config = SEVERITY_CONFIG[severity]
  const { Icon, label, classes } = config

  return (
    <span className="inline-flex flex-col gap-1">
      {/* Severity badge — Guardrail #25: icon + text + color (never color alone) */}
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium border ${classes}`}
      >
        {/* Guardrail #36: aria-hidden on icon, text label is accessible name */}
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>

      {/* Source/target text with lang attribute — Guardrail #39 */}
      {sourceText && (
        <span lang={sourceLang} className={isCjkLang(sourceLang) ? 'text-cjk-scale' : undefined}>
          {sourceText}
        </span>
      )}
      {targetText && (
        <span lang={targetLang} className={isCjkLang(targetLang) ? 'text-cjk-scale' : undefined}>
          {targetText}
        </span>
      )}
    </span>
  )
}
