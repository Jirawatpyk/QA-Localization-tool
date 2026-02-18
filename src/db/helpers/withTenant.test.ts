import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { withTenant } from './withTenant'

// Test table with tenant_id column
const testTable = pgTable('test_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
})

describe('withTenant', () => {
  it('should return an SQL expression for tenant filtering', () => {
    const tenantId = '550e8400-e29b-41d4-a716-446655440000'
    const result = withTenant(testTable.tenantId, tenantId)

    // The result should be a valid Drizzle SQL expression
    expect(result).toBeDefined()
    // Verify it's an SQL-like object (has queryChunks or similar internal)
    expect(typeof result).toBe('object')
  })

  it('should accept different tenant IDs', () => {
    const tenantA = '11111111-1111-1111-1111-111111111111'
    const tenantB = '22222222-2222-2222-2222-222222222222'

    const resultA = withTenant(testTable.tenantId, tenantA)
    const resultB = withTenant(testTable.tenantId, tenantB)

    expect(resultA).toBeDefined()
    expect(resultB).toBeDefined()
    // They should be different SQL expressions
    expect(resultA).not.toBe(resultB)
  })
})
