import { describe, expect, it } from 'vitest'

import {
  createProjectSchema,
  updateLanguagePairConfigSchema,
  updateProjectSchema,
} from './projectSchemas'

describe('projectSchemas', () => {
  describe('createProjectSchema', () => {
    it('should accept valid input', () => {
      const result = createProjectSchema.safeParse({
        name: 'My Project',
        description: 'A test project',
        sourceLang: 'en',
        targetLangs: ['th', 'ja'],
        processingMode: 'economy',
      })
      expect(result.success).toBe(true)
    })

    it('should fail when name is empty', () => {
      const result = createProjectSchema.safeParse({
        name: '',
        sourceLang: 'en',
        targetLangs: ['th'],
        processingMode: 'economy',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Project name is required')
      }
    })

    it('should fail when name exceeds 255 characters', () => {
      const result = createProjectSchema.safeParse({
        name: 'a'.repeat(256),
        sourceLang: 'en',
        targetLangs: ['th'],
        processingMode: 'economy',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Project name too long')
      }
    })

    it('should fail with invalid BCP-47 code', () => {
      const result = createProjectSchema.safeParse({
        name: 'Test',
        sourceLang: '123',
        targetLangs: ['th'],
        processingMode: 'economy',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Invalid BCP-47 language code')
      }
    })

    it('should fail when targetLangs is empty', () => {
      const result = createProjectSchema.safeParse({
        name: 'Test',
        sourceLang: 'en',
        targetLangs: [],
        processingMode: 'economy',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('At least one target language required')
      }
    })

    it('should accept valid BCP-47 codes including subtags', () => {
      const result = createProjectSchema.safeParse({
        name: 'Test',
        sourceLang: 'en',
        targetLangs: ['zh-Hant'],
        processingMode: 'thorough',
      })
      expect(result.success).toBe(true)
    })

    it('should accept description as optional', () => {
      const result = createProjectSchema.safeParse({
        name: 'Test',
        sourceLang: 'en',
        targetLangs: ['th'],
        processingMode: 'economy',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('updateProjectSchema', () => {
    it('should accept partial update with only name', () => {
      const result = updateProjectSchema.safeParse({ name: 'Updated Name' })
      expect(result.success).toBe(true)
    })

    it('should accept empty object (no changes)', () => {
      const result = updateProjectSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('should fail when autoPassThreshold exceeds 100', () => {
      const result = updateProjectSchema.safeParse({ autoPassThreshold: 101 })
      expect(result.success).toBe(false)
    })

    it('should fail when autoPassThreshold is negative', () => {
      const result = updateProjectSchema.safeParse({ autoPassThreshold: -1 })
      expect(result.success).toBe(false)
    })

    it('should accept nullable description for clearing', () => {
      const result = updateProjectSchema.safeParse({ description: null })
      expect(result.success).toBe(true)
    })

    it('should accept valid processingMode', () => {
      const result = updateProjectSchema.safeParse({ processingMode: 'thorough' })
      expect(result.success).toBe(true)
    })

    it('should fail with invalid processingMode', () => {
      const result = updateProjectSchema.safeParse({ processingMode: 'ultra' })
      expect(result.success).toBe(false)
    })
  })

  describe('updateLanguagePairConfigSchema', () => {
    it('should accept valid config', () => {
      const result = updateLanguagePairConfigSchema.safeParse({
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        sourceLang: 'en',
        targetLang: 'th',
        autoPassThreshold: 93,
        wordSegmenter: 'intl',
      })
      expect(result.success).toBe(true)
    })

    it('should fail with invalid projectId UUID', () => {
      const result = updateLanguagePairConfigSchema.safeParse({
        projectId: 'not-a-uuid',
        sourceLang: 'en',
        targetLang: 'th',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Invalid project ID')
      }
    })

    it('should fail with invalid segmenter value', () => {
      const result = updateLanguagePairConfigSchema.safeParse({
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        sourceLang: 'en',
        targetLang: 'th',
        wordSegmenter: 'custom',
      })
      expect(result.success).toBe(false)
    })

    it('should accept config with only required fields', () => {
      const result = updateLanguagePairConfigSchema.safeParse({
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        sourceLang: 'en',
        targetLang: 'th',
      })
      expect(result.success).toBe(true)
    })

    it('should accept mutedCategories as string array', () => {
      const result = updateLanguagePairConfigSchema.safeParse({
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        sourceLang: 'en',
        targetLang: 'th',
        mutedCategories: ['accuracy', 'fluency'],
      })
      expect(result.success).toBe(true)
    })
  })
})
