import { isNull, or, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { severityConfigs } from '@/db/schema/severityConfigs'
import type { TenantId } from '@/types/tenant'

import { DEFAULT_PENALTY_WEIGHTS } from './constants'
import type { PenaltyWeights } from './types'

type SeverityKey = keyof PenaltyWeights

/**
 * Resolve penalty weights for a tenant using 3-level fallback chain:
 * 1. Tenant-specific rows (tenant_id = tenantId)
 * 2. System defaults (tenant_id IS NULL) — readable by all authenticated users
 * 3. Hardcoded DEFAULT_PENALTY_WEIGHTS
 *
 * Drizzle ORM bypasses RLS — the app-level filter IS the security boundary here.
 * severity_configs SELECT policy is USING (true) so system defaults are accessible.
 */
export async function loadPenaltyWeights(tenantId: TenantId): Promise<PenaltyWeights> {
  const rows = await db
    .select({
      tenantId: severityConfigs.tenantId,
      severity: severityConfigs.severity,
      penaltyWeight: severityConfigs.penaltyWeight,
    })
    .from(severityConfigs)
    // withTenant() is intentionally NOT used here — this query must fetch both
    // tenant-specific rows (tenantId = tenantId) AND system default rows
    // (tenantId IS NULL). withTenant() would exclude IS NULL rows, breaking the
    // 3-level fallback chain. App-level merge logic below enforces tenant precedence.
    .where(or(eq(severityConfigs.tenantId, tenantId), isNull(severityConfigs.tenantId)))

  // Build resolved weights per severity using priority: tenant-specific > system default > hardcoded
  // M7 fix: Map lookup instead of 6x Array.find() (O(1) per severity instead of O(n))
  const tenantMap = new Map<string, number>()
  const systemMap = new Map<string, number>()
  for (const r of rows) {
    if (r.tenantId === tenantId) {
      tenantMap.set(r.severity, r.penaltyWeight)
    } else if (r.tenantId === null) {
      systemMap.set(r.severity, r.penaltyWeight)
    }
  }

  const resolved: Partial<PenaltyWeights> = {}
  const severities: SeverityKey[] = ['critical', 'major', 'minor']

  for (const severity of severities) {
    resolved[severity] =
      tenantMap.get(severity) ?? systemMap.get(severity) ?? DEFAULT_PENALTY_WEIGHTS[severity]
  }

  return {
    critical: resolved.critical ?? DEFAULT_PENALTY_WEIGHTS.critical,
    major: resolved.major ?? DEFAULT_PENALTY_WEIGHTS.major,
    minor: resolved.minor ?? DEFAULT_PENALTY_WEIGHTS.minor,
  }
}
