import { z } from 'zod'

import { bcp47LanguageArraySchema } from '@/lib/language/bcp47'

// Re-export project-wide BCP-47 helpers for backwards compatibility.
// New call sites SHOULD import directly from `@/lib/language/bcp47`.
export {
  canonicalizeBcp47,
  canonicalizeLanguages,
  languageSetsEqual,
  normalizeBcp47,
} from '@/lib/language/bcp47'

const appRoleSchema = z.union([
  z.literal('admin'),
  z.literal('qa_reviewer'),
  z.literal('native_reviewer'),
])

// F7: use the shared `bcp47LanguageArraySchema` from `@/lib/language/bcp47`
// instead of defining a local variant. Single source of truth.
const nativeLanguagesSchema = bcp47LanguageArraySchema({ max: 20 })

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  displayName: z.string().min(1, 'Name is required').max(255),
  role: appRoleSchema,
  nativeLanguages: nativeLanguagesSchema.default([]),
})

export const updateRoleSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  newRole: appRoleSchema,
})

export const updateUserLanguagesSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  nativeLanguages: nativeLanguagesSchema,
  /**
   * Pre-edit snapshot for optimistic-lock conflict detection (Guardrail #25-style).
   * When provided, the server rejects the write if the current DB value no longer
   * matches — this catches concurrent admin edits from two tabs/devices.
   * Optional for backwards compatibility, but clients SHOULD pass it.
   */
  previousLanguages: nativeLanguagesSchema.optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>
export type UpdateUserLanguagesInput = z.infer<typeof updateUserLanguagesSchema>
