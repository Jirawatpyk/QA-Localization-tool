import type { DetectedByLayer } from '@/types/finding'
import { PRIMARY_MODELS } from '@/types/pipeline'

// ── L3 Markers ──

export const L3_CONFIRMED_MARKER = '[L3 Confirmed]'
export const L3_DISAGREES_MARKER = '[L3 Disagrees]'

export function stripL3Markers(text: string): string {
  return text.replaceAll(L3_CONFIRMED_MARKER, '').replaceAll(L3_DISAGREES_MARKER, '').trim()
}

// ── CJK Language Detection (Guardrail #39) ──

const CJK_LANGS = new Set(['ja', 'zh', 'ko', 'ja-JP', 'zh-CN', 'zh-TW', 'ko-KR'])

export function isCjkLang(lang: string | undefined): boolean {
  if (!lang) return false
  return (
    CJK_LANGS.has(lang) || lang.startsWith('ja') || lang.startsWith('zh') || lang.startsWith('ko')
  )
}

// ── Fallback Badge Detection ──

export function isFallbackModel(aiModel: string | null, detectedByLayer: DetectedByLayer): boolean {
  return aiModel !== null && detectedByLayer !== 'L1' && aiModel !== PRIMARY_MODELS[detectedByLayer]
}

// ── Confidence Threshold ──

export function computeConfidenceMin(
  detectedByLayer: DetectedByLayer,
  l2ConfidenceMin: number | null | undefined,
  l3ConfidenceMin: number | null | undefined,
): number | null {
  const raw = detectedByLayer === 'L3' ? l3ConfidenceMin : l2ConfidenceMin
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

// ── Text Truncation ──

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}
