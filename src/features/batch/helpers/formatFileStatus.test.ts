/// <reference types="vitest/globals" />
import type { DbFileStatus } from '@/types/pipeline'

import { formatFileStatus } from './formatFileStatus'

describe('formatFileStatus', () => {
  const expectedMappings: [DbFileStatus, string][] = [
    ['uploaded', 'Uploaded'],
    ['parsing', 'Parsing'],
    ['parsed', 'Parsed'],
    ['l1_processing', 'L1 Processing'],
    ['l1_completed', 'L1 Completed'],
    ['l2_processing', 'L2 Processing'],
    ['l2_completed', 'L2 Completed'],
    ['l3_processing', 'L3 Processing'],
    ['l3_completed', 'L3 Completed'],
    ['ai_partial', 'AI Partial'],
    ['failed', 'Failed'],
  ]

  it.each(expectedMappings)('should return "%s" → "%s"', (status, expected) => {
    expect(formatFileStatus(status)).toBe(expected)
  })

  it('should return a string for every DbFileStatus value', () => {
    for (const [status] of expectedMappings) {
      expect(typeof formatFileStatus(status)).toBe('string')
      expect(formatFileStatus(status).length).toBeGreaterThan(0)
    }
  })

  it('should cover all 11 status values', () => {
    expect(expectedMappings).toHaveLength(11)
  })
})
