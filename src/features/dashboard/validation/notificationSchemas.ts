import { z } from 'zod'

export const markNotificationReadSchema = z.union([
  z.literal('all'),
  z.string().uuid('Invalid notification ID format'),
])

export type MarkNotificationReadInput = z.infer<typeof markNotificationReadSchema>
