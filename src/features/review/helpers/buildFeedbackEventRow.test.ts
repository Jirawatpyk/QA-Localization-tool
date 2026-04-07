import { describe, it, expect, vi } from 'vitest'

// Mock server-only before importing
vi.mock('server-only', () => ({}))

import { buildFeedbackEventRow } from './buildFeedbackEventRow'

const baseParams = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  fileId: '00000000-0000-0000-0000-000000000002',
  projectId: '00000000-0000-0000-0000-000000000003',
  findingId: '00000000-0000-0000-0000-000000000004',
  reviewerId: '00000000-0000-0000-0000-000000000005',
  findingCategory: 'accuracy',
  originalSeverity: 'major',
  layer: 'L2',
  detectedByLayer: 'L2',
  sourceLang: 'en',
  targetLang: 'th',
  sourceText: 'Hello world',
  originalTarget: '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e0a\u0e32\u0e27\u0e42\u0e25\u0e01',
  reviewerNativeLanguages: ['th'],
}

describe('buildFeedbackEventRow', () => {
  it('should build a manual_add row with isFalsePositive=false', () => {
    const row = buildFeedbackEventRow({
      ...baseParams,
      action: 'manual_add',
      isFalsePositive: false,
    })

    expect(row).toEqual({
      tenantId: baseParams.tenantId,
      fileId: baseParams.fileId,
      projectId: baseParams.projectId,
      findingId: baseParams.findingId,
      reviewerId: baseParams.reviewerId,
      action: 'manual_add',
      findingCategory: 'accuracy',
      originalSeverity: 'major',
      isFalsePositive: false,
      reviewerIsNative: true,
      layer: 'L2',
      detectedByLayer: 'L2',
      sourceLang: 'en',
      targetLang: 'th',
      sourceText: 'Hello world',
      originalTarget: '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e0a\u0e32\u0e27\u0e42\u0e25\u0e01',
    })
  })

  it('should build a reject row with isFalsePositive=true', () => {
    const row = buildFeedbackEventRow({
      ...baseParams,
      action: 'reject',
      isFalsePositive: true,
    })

    expect(row.action).toBe('reject')
    expect(row.isFalsePositive).toBe(true)
    expect(row.reviewerIsNative).toBe(true)
  })

  it('should set reviewerIsNative=false for non-native reviewer', () => {
    const row = buildFeedbackEventRow({
      ...baseParams,
      action: 'undo_reject',
      isFalsePositive: false,
      reviewerNativeLanguages: ['ja'],
    })

    expect(row.reviewerIsNative).toBe(false)
  })

  it('should default sourceLang/targetLang to "unknown" when empty', () => {
    const row = buildFeedbackEventRow({
      ...baseParams,
      action: 'reject',
      isFalsePositive: true,
      sourceLang: '',
      targetLang: '',
    })

    expect(row.sourceLang).toBe('unknown')
    expect(row.targetLang).toBe('unknown')
  })

  it('should handle empty nativeLanguages (conservative: non-native)', () => {
    const row = buildFeedbackEventRow({
      ...baseParams,
      action: 'manual_add',
      isFalsePositive: false,
      reviewerNativeLanguages: [],
    })

    expect(row.reviewerIsNative).toBe(false)
  })
})
