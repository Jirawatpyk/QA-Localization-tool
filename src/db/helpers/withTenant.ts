// Tenant filter helper — ensures every query is scoped to tenant
// Populated when DB schema is created in Story 1.2
export function withTenant<T>(query: T, _tenantId: string): T {
  // Placeholder: will wrap Drizzle queries with .where(eq(table.tenantId, tenantId))
  return query
}
