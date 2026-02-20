import { boolean, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

// NOTE: NO tenant_id — shared reference data per ERD 1.9
// All tenants share the same taxonomy definitions (taxonomy_definitions table has no RLS)
export const taxonomyDefinitions = pgTable('taxonomy_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: varchar('category', { length: 100 }).notNull(),
  parentCategory: varchar('parent_category', { length: 100 }),
  internalName: varchar('internal_name', { length: 200 }),
  severity: varchar('severity', { length: 20 }).default('minor'),
  description: text('description').notNull(),
  isCustom: boolean('is_custom').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
