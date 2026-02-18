import { describe, expect, it } from 'vitest'

import { createUserSchema, updateRoleSchema } from './userSchemas'

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
})
