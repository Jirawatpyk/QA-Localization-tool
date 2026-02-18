import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core'

import { tenants } from './tenants'

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  sourceLang: varchar('source_lang', { length: 35 }).notNull(), // BCP-47
  targetLangs: jsonb('target_langs').notNull().$type<string[]>(), // array of BCP-47
  processingMode: varchar('processing_mode', { length: 20 }).notNull().default('economy'), // 'economy' | 'thorough'
  status: varchar('status', { length: 20 }).notNull().default('draft'), // 'draft' | 'processing' | 'reviewed' | 'completed'
  autoPassThreshold: integer('auto_pass_threshold').notNull().default(95),
  aiBudgetMonthlyUsd: numeric('ai_budget_monthly_usd', { precision: 10, scale: 2 }), // NULL = unlimited
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
