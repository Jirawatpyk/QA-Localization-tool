/**
 * Branded TenantId type — compile-time enforcement for tenant isolation.
 *
 * TenantId can only be created through validated paths:
 * - requireRole() / getCurrentUser() — from JWT claims
 * - Zod .transform(validateTenantId) — from Inngest event data
 * - asTenantId() — for test factories only
 *
 * withTenant() requires TenantId, preventing accidental use of
 * wrong ID types (projectId, userId, etc.) at compile time.
 */
declare const TenantIdBrand: unique symbol
export type TenantId = string & { readonly [TenantIdBrand]: typeof TenantIdBrand }

/** Cast a validated UUID string to TenantId. Use in auth/Zod boundaries only. */
export function validateTenantId(id: string): TenantId {
  return id as TenantId
}

/** Cast a string to TenantId for test factories. Not for production code. */
export function asTenantId(id: string): TenantId {
  return id as TenantId
}
