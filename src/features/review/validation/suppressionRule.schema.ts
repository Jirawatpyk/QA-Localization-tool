import { z } from 'zod'

export const suppressionRuleSchema = z.object({
  projectId: z.string().uuid(),
  fileId: z.string().uuid().nullable(), // Rule scope: only set for file-scoped rules
  currentFileId: z.string().uuid(), // File being reviewed: always set, used for auto-reject batch (AC3)
  category: z.string().min(1).max(100), // DB: varchar(100)
  pattern: z.string().min(1),
  scope: z.enum(['file', 'language_pair', 'all']),
  duration: z.enum(['session', 'permanent', 'until_improved']),
  sourceLang: z.string().nullable(),
  targetLang: z.string().nullable(),
})

export type CreateSuppressionRuleInput = z.infer<typeof suppressionRuleSchema>
