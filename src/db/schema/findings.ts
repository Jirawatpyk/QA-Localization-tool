import { pgTable, uuid, varchar, text, real, integer, timestamp } from 'drizzle-orm/pg-core'

import { projects } from './projects'
import { reviewSessions } from './reviewSessions'
import { segments } from './segments'
import { tenants } from './tenants'

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  segmentId: uuid('segment_id')
    .notNull()
    .references(() => segments.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  reviewSessionId: uuid('review_session_id').references(() => reviewSessions.id, {
    onDelete: 'set null',
  }),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  // 'pending' | 'accepted' | 're_accepted' | 'rejected' | 'flagged' | 'noted' | 'source_issue' | 'manual'
  severity: varchar('severity', { length: 20 }).notNull(), // 'critical' | 'major' | 'minor'
  category: varchar('category', { length: 100 }).notNull(), // MQM category
  description: text('description').notNull(),
  detectedByLayer: varchar('detected_by_layer', { length: 10 }).notNull(), // 'L1' | 'L2' | 'L3'
  aiModel: varchar('ai_model', { length: 100 }),
  aiConfidence: real('ai_confidence'), // 0-100
  suggestedFix: text('suggested_fix'),
  segmentCount: integer('segment_count').notNull().default(1), // multi-segment span tracking
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
