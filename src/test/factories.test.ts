import { describe, expect, it } from 'vitest'

import type { ParsedSegment } from '@/features/parser/types'

import { buildSegmentRecordFromParsed } from './factories'

describe('buildSegmentRecordFromParsed', () => {
  const mockParsedSegment: ParsedSegment = {
    segmentId: 'mrk-42', // parser-level ID (SDLXLIFF mrk @mid) — NOT persisted to DB
    segmentNumber: 7,
    sourceText: 'Click the button.',
    targetText: 'คลิกปุ่ม',
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    wordCount: 3,
    confirmationState: 'Translated',
    matchPercentage: 95,
    translatorComment: 'TM match',
    inlineTags: { source: [], target: [] },
  }

  const ids = {
    fileId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
    projectId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
    tenantId: 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f',
  }

  it('should map all ParsedSegment fields to SegmentRecord', () => {
    const result = buildSegmentRecordFromParsed(mockParsedSegment, ids)

    expect(result.fileId).toBe(ids.fileId)
    expect(result.projectId).toBe(ids.projectId)
    expect(result.tenantId).toBe(ids.tenantId)
    expect(result.segmentNumber).toBe(7)
    expect(result.sourceText).toBe('Click the button.')
    expect(result.targetText).toBe('คลิกปุ่ม')
    expect(result.sourceLang).toBe('en-US')
    expect(result.targetLang).toBe('th-TH')
    expect(result.wordCount).toBe(3)
    expect(result.confirmationState).toBe('Translated')
    expect(result.matchPercentage).toBe(95)
    expect(result.translatorComment).toBe('TM match')
    expect(result.inlineTags).toEqual({ source: [], target: [] })
  })

  it('should generate a valid UUID for id (DB primary key)', () => {
    const result = buildSegmentRecordFromParsed(mockParsedSegment, ids)

    // id should be a UUID, not the parser segmentId
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(result.id).not.toBe('mrk-42')
  })

  it('should generate unique ids across calls', () => {
    const result1 = buildSegmentRecordFromParsed(mockParsedSegment, ids)
    const result2 = buildSegmentRecordFromParsed(mockParsedSegment, ids)

    expect(result1.id).not.toBe(result2.id)
  })

  it('should set createdAt to a Date instance', () => {
    const result = buildSegmentRecordFromParsed(mockParsedSegment, ids)

    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('should handle null optional fields', () => {
    const segWithNulls: ParsedSegment = {
      ...mockParsedSegment,
      confirmationState: null,
      matchPercentage: null,
      translatorComment: null,
      inlineTags: null,
    }

    const result = buildSegmentRecordFromParsed(segWithNulls, ids)

    expect(result.confirmationState).toBeNull()
    expect(result.matchPercentage).toBeNull()
    expect(result.translatorComment).toBeNull()
    expect(result.inlineTags).toBeNull()
  })
})
