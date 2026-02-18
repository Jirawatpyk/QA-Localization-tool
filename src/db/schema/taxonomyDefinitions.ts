import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core'

// NOTE: NO tenant_id — shared reference data per ERD 1.9
export const taxonomyDefinitions = pgTable('taxonomy_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: varchar('category', { length: 100 }).notNull(),
  parentCategory: varchar('parent_category', { length: 100 }),
  description: text('description').notNull(),
  isCustom: boolean('is_custom').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
