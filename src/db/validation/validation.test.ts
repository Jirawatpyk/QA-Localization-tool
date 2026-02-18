import { describe, expect, it } from 'vitest'

import {
  projectInsertSchema,
  findingInsertSchema,
  scoreInsertSchema,
  userRoleInsertSchema,
  glossaryInsertSchema,
  glossaryTermInsertSchema,
} from './index'

describe('Drizzle-Zod Validation Schemas', () => {
  describe('projectInsertSchema', () => {
    it('should accept valid project data', () => {
      const result = projectInsertSchema.safeParse({
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Project',
        sourceLang: 'en',
        targetLangs: ['th', 'ja'],
        processingMode: 'economy',
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty name', () => {
      const result = projectInsertSchema.safeParse({
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        name: '',
        sourceLang: 'en',
        targetLangs: ['th'],
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid BCP-47 source language', () => {
      const result = projectInsertSchema.safeParse({
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test',
        sourceLang: '!!invalid!!',
        targetLangs: ['th'],
      })
      expect(result.success).toBe(false)
    })

    it('should reject empty targetLangs array', () => {
      const result = projectInsertSchema.safeParse({
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test',
        sourceLang: 'en',
        targetLangs: [],
      })
      expect(result.success).toBe(false)
    })

    it('should accept valid BCP-47 language tags', () => {
      const result = projectInsertSchema.safeParse({
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test',
        sourceLang: 'zh-Hans-CN',
        targetLangs: ['en-US', 'ja-JP'],
      })
      expect(result.success).toBe(true)
    })
  })

  describe('findingInsertSchema', () => {
    it('should accept valid finding data', () => {
      const result = findingInsertSchema.safeParse({
        segmentId: '550e8400-e29b-41d4-a716-446655440000',
        projectId: '550e8400-e29b-41d4-a716-446655440001',
        tenantId: '550e8400-e29b-41d4-a716-446655440002',
        severity: 'major',
        category: 'accuracy',
        description: 'Translation error',
        detectedByLayer: 'L1',
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid severity', () => {
      const result = findingInsertSchema.safeParse({
        segmentId: '550e8400-e29b-41d4-a716-446655440000',
        projectId: '550e8400-e29b-41d4-a716-446655440001',
        tenantId: '550e8400-e29b-41d4-a716-446655440002',
        severity: 'invalid',
        category: 'accuracy',
        description: 'Test',
        detectedByLayer: 'L1',
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid detection layer', () => {
      const result = findingInsertSchema.safeParse({
        segmentId: '550e8400-e29b-41d4-a716-446655440000',
        projectId: '550e8400-e29b-41d4-a716-446655440001',
        tenantId: '550e8400-e29b-41d4-a716-446655440002',
        severity: 'minor',
        category: 'accuracy',
        description: 'Test',
        detectedByLayer: 'L4',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('scoreInsertSchema', () => {
    it('should accept valid score data', () => {
      const result = scoreInsertSchema.safeParse({
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        mqmScore: 95.5,
        totalWords: 1000,
        criticalCount: 0,
        majorCount: 1,
        minorCount: 3,
        npt: 0.8,
        layerCompleted: 'L1L2',
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid layer completed value', () => {
      const result = scoreInsertSchema.safeParse({
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        mqmScore: 95,
        totalWords: 1000,
        criticalCount: 0,
        majorCount: 0,
        minorCount: 0,
        npt: 0,
        layerCompleted: 'L4',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('userRoleInsertSchema', () => {
    it('should accept valid roles', () => {
      for (const role of ['admin', 'qa_reviewer', 'native_reviewer']) {
        const result = userRoleInsertSchema.safeParse({
          userId: '550e8400-e29b-41d4-a716-446655440000',
          tenantId: '550e8400-e29b-41d4-a716-446655440001',
          role,
        })
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid role', () => {
      const result = userRoleInsertSchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        role: 'superadmin',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('glossaryInsertSchema', () => {
    it('should accept valid glossary', () => {
      const result = glossaryInsertSchema.safeParse({
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Technical Terms',
        sourceLang: 'en',
        targetLang: 'th',
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty name', () => {
      const result = glossaryInsertSchema.safeParse({
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        name: '',
        sourceLang: 'en',
        targetLang: 'th',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('glossaryTermInsertSchema', () => {
    it('should accept valid term', () => {
      const result = glossaryTermInsertSchema.safeParse({
        glossaryId: '550e8400-e29b-41d4-a716-446655440000',
        sourceTerm: 'API',
        targetTerm: 'เอพีไอ',
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty source term', () => {
      const result = glossaryTermInsertSchema.safeParse({
        glossaryId: '550e8400-e29b-41d4-a716-446655440000',
        sourceTerm: '',
        targetTerm: 'test',
      })
      expect(result.success).toBe(false)
    })
  })
})
