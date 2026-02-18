import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
import { z } from 'zod'

import { findings } from '@/db/schema/findings'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'
import { projects } from '@/db/schema/projects'
import { scores } from '@/db/schema/scores'
import { userRoles } from '@/db/schema/userRoles'

// BCP-47 language tag validation (simplified — covers en, en-US, zh-Hans-CN etc.)
const bcp47Schema = z.string().regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/, 'Invalid BCP-47 tag')

// --- Projects ---
export const projectInsertSchema = createInsertSchema(projects, {
  name: (schema) => schema.min(1, 'Name is required').max(255),
  sourceLang: () => bcp47Schema,
  targetLangs: () => z.array(bcp47Schema).min(1, 'At least one target language required'),
  processingMode: (schema) => schema.pipe(z.union([z.literal('economy'), z.literal('thorough')])),
})

export const projectSelectSchema = createSelectSchema(projects)
export const projectUpdateSchema = createUpdateSchema(projects, {
  name: (schema) => schema.min(1).max(255),
})

// --- Findings ---
export const findingInsertSchema = createInsertSchema(findings, {
  severity: (schema) =>
    schema.pipe(z.union([z.literal('critical'), z.literal('major'), z.literal('minor')])),
  detectedByLayer: (schema) =>
    schema.pipe(z.union([z.literal('L1'), z.literal('L2'), z.literal('L3')])),
})

export const findingSelectSchema = createSelectSchema(findings)
export const findingUpdateSchema = createUpdateSchema(findings)

// --- Scores ---
export const scoreInsertSchema = createInsertSchema(scores, {
  mqmScore: (schema) => schema.min(0).max(100),
  layerCompleted: (schema) =>
    schema.pipe(z.union([z.literal('L1'), z.literal('L1L2'), z.literal('L1L2L3')])),
})

export const scoreSelectSchema = createSelectSchema(scores)
export const scoreUpdateSchema = createUpdateSchema(scores)

// --- User Roles ---
export const userRoleInsertSchema = createInsertSchema(userRoles, {
  role: (schema) =>
    schema.pipe(
      z.union([z.literal('admin'), z.literal('qa_reviewer'), z.literal('native_reviewer')]),
    ),
})

export const userRoleSelectSchema = createSelectSchema(userRoles)

// --- Glossaries ---
export const glossaryInsertSchema = createInsertSchema(glossaries, {
  name: (schema) => schema.min(1).max(255),
  sourceLang: () => bcp47Schema,
  targetLang: () => bcp47Schema,
})

export const glossarySelectSchema = createSelectSchema(glossaries)
export const glossaryUpdateSchema = createUpdateSchema(glossaries)

// --- Glossary Terms ---
export const glossaryTermInsertSchema = createInsertSchema(glossaryTerms, {
  sourceTerm: (schema) => schema.min(1).max(500),
  targetTerm: (schema) => schema.min(1).max(500),
})

export const glossaryTermSelectSchema = createSelectSchema(glossaryTerms)
export const glossaryTermUpdateSchema = createUpdateSchema(glossaryTerms)
