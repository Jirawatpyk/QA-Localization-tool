import { z } from 'zod'

export const tourIdSchema = z.enum(['setup', 'review'])

export const updateTourStateSchema = z
  .object({
    action: z.enum(['complete', 'dismiss', 'restart']),
    tourId: tourIdSchema,
    dismissedAtStep: z.number().int().min(1).optional(),
  })
  .refine(
    (data) => {
      if (data.action === 'dismiss' && data.dismissedAtStep === undefined) {
        return false
      }
      return true
    },
    { message: 'dismissedAtStep is required when action is dismiss' },
  )

export type UpdateTourStateInput = z.infer<typeof updateTourStateSchema>
