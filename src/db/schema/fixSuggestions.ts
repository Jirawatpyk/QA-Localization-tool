import { pgTable, uuid, varchar, text, real, timestamp } from 'drizzle-orm/pg-core'

import { findings } from './findings'
import { tenants } from './tenants'

// Growth-phase table — mode='disabled' at zero runtime cost
export const fixSuggestions = pgTable('fix_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  findingId: uuid('finding_id')
    .notNull()
    .references(() => findings.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  suggestedText: text('suggested_text').notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  confidence: real('confidence').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending' | 'accepted' | 'rejected'
  mode: varchar('mode', { length: 20 }).notNull().default('disabled'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
