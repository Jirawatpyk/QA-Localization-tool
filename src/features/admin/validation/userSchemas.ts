import { z } from 'zod'

const appRoleSchema = z.union([
  z.literal('admin'),
  z.literal('qa_reviewer'),
  z.literal('native_reviewer'),
])

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  displayName: z.string().min(1, 'Name is required').max(255),
  role: appRoleSchema,
})

export const updateRoleSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  newRole: appRoleSchema,
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>
