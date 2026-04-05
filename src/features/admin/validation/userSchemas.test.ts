import { describe, expect, it } from 'vitest'

import {
  createUserSchema,
  normalizeBcp47,
  updateRoleSchema,
  updateUserLanguagesSchema,
} from './userSchemas'

describe('userSchemas', () => {
  describe('createUserSchema', () => {
    it('should accept valid user data', () => {
      const result = createUserSchema.safeParse({
        email: 'user@example.com',
        displayName: 'Test User',
        role: 'qa_reviewer',
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid email', () => {
      const result = createUserSchema.safeParse({
        email: 'not-an-email',
        displayName: 'Test',
        role: 'admin',
      })
      expect(result.success).toBe(false)
    })

    it('should reject empty display name', () => {
      const result = createUserSchema.safeParse({
        email: 'user@example.com',
        displayName: '',
        role: 'admin',
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid role', () => {
      const result = createUserSchema.safeParse({
        email: 'user@example.com',
        displayName: 'Test',
        role: 'superadmin',
      })
      expect(result.success).toBe(false)
    })

    it('should accept all valid roles', () => {
      for (const role of ['admin', 'qa_reviewer', 'native_reviewer']) {
        const result = createUserSchema.safeParse({
          email: 'user@example.com',
          displayName: 'Test',
          role,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('updateRoleSchema', () => {
    it('should accept valid update data', () => {
      const result = updateRoleSchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        newRole: 'admin',
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid UUID', () => {
      const result = updateRoleSchema.safeParse({
        userId: 'not-a-uuid',
        newRole: 'admin',
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid role', () => {
      const result = updateRoleSchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        newRole: 'unknown',
      })
      expect(result.success).toBe(false)
    })
  })

  // ---- BCP-47 boundary tests (S-FIX-14 R1 review P10) ----

  describe('updateUserLanguagesSchema — BCP-47 accepted tags', () => {
    const baseInput = { userId: '550e8400-e29b-41d4-a716-446655440000' }

    it.each([
      ['th'],
      ['en'],
      ['yue'],
      ['th-TH'],
      ['en-US'],
      ['zh-CN'],
      ['zh-Hant-CN'],
      ['zh-hant-TW'], // lowercase script — permissive per RFC 5646
      ['es-419'], // numeric region (UN M.49)
      ['ja-JP'],
    ])('accepts %s', (tag) => {
      const result = updateUserLanguagesSchema.safeParse({
        ...baseInput,
        nativeLanguages: [tag],
      })
      expect(result.success).toBe(true)
    })
  })

  describe('updateUserLanguagesSchema — BCP-47 rejected tags', () => {
    const baseInput = { userId: '550e8400-e29b-41d4-a716-446655440000' }

    it.each([
      [''],
      ['x'], // single letter
      ['1234'], // digits only primary subtag
      ['th-'], // trailing hyphen
      ['-th'], // leading hyphen
      ['th--TH'], // empty subtag
      ['th TH'], // space
    ])('rejects %s', (tag) => {
      const result = updateUserLanguagesSchema.safeParse({
        ...baseInput,
        nativeLanguages: [tag],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('updateUserLanguagesSchema — array rules', () => {
    const baseInput = { userId: '550e8400-e29b-41d4-a716-446655440000' }

    it('allows empty array', () => {
      const result = updateUserLanguagesSchema.safeParse({
        ...baseInput,
        nativeLanguages: [],
      })
      expect(result.success).toBe(true)
    })

    it('accepts exactly 20 languages (max boundary)', () => {
      const twenty = [
        'en',
        'th',
        'ja',
        'ko',
        'vi',
        'id',
        'ms',
        'de',
        'fr',
        'es',
        'pt',
        'it',
        'nl',
        'pl',
        'ru',
        'tr',
        'ar',
        'hi',
        'zh',
        'yue',
      ]
      const result = updateUserLanguagesSchema.safeParse({
        ...baseInput,
        nativeLanguages: twenty,
      })
      expect(result.success).toBe(true)
    })

    it('rejects 21 languages (above max)', () => {
      const twentyOne = [
        'en',
        'th',
        'ja',
        'ko',
        'vi',
        'id',
        'ms',
        'de',
        'fr',
        'es',
        'pt',
        'it',
        'nl',
        'pl',
        'ru',
        'tr',
        'ar',
        'hi',
        'zh',
        'yue',
        'he',
      ]
      const result = updateUserLanguagesSchema.safeParse({
        ...baseInput,
        nativeLanguages: twentyOne,
      })
      expect(result.success).toBe(false)
    })

    it('rejects exact duplicates (Guardrail #24)', () => {
      const result = updateUserLanguagesSchema.safeParse({
        ...baseInput,
        nativeLanguages: ['th', 'en', 'th'],
      })
      expect(result.success).toBe(false)
    })

    it('rejects case-insensitive duplicates (th-TH vs th-th)', () => {
      const result = updateUserLanguagesSchema.safeParse({
        ...baseInput,
        nativeLanguages: ['th-TH', 'th-th'],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('createUserSchema — nativeLanguages', () => {
    const baseCreateInput = {
      email: 'new@example.com',
      displayName: 'New User',
      role: 'qa_reviewer' as const,
    }

    it('defaults to empty array when omitted', () => {
      const result = createUserSchema.safeParse(baseCreateInput)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.nativeLanguages).toEqual([])
      }
    })

    it('canonicalizes provided languages via schema transform (RC-2)', () => {
      const result = createUserSchema.safeParse({
        ...baseCreateInput,
        nativeLanguages: ['th-TH', 'ja-JP'],
      })
      expect(result.success).toBe(true)
      if (result.success) {
        // RC-2: `.transform(canonicalizeLanguages)` lowercases + sorts on parse.
        expect(result.data.nativeLanguages).toEqual(['ja-jp', 'th-th'])
      }
    })
  })

  describe('normalizeBcp47', () => {
    it('lowercases the full tag', () => {
      expect(normalizeBcp47('TH-TH')).toBe('th-th')
      expect(normalizeBcp47('zh-Hant-CN')).toBe('zh-hant-cn')
    })

    it('trims whitespace', () => {
      expect(normalizeBcp47('  en-US  ')).toBe('en-us')
    })
  })
})
