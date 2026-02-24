import { isNull, or, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { severityConfigs } from '@/db/schema/severityConfigs'

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
export async function loadPenaltyWeights(tenantId: string): Promise<PenaltyWeights> {
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
  const resolved: Partial<PenaltyWeights> = {}

  const severities: SeverityKey[] = ['critical', 'major', 'minor']

  for (const severity of severities) {
    // Prefer tenant-specific row
    const tenantRow = rows.find((r) => r.tenantId === tenantId && r.severity === severity)
    if (tenantRow) {
      resolved[severity] = tenantRow.penaltyWeight
      continue
    }

    // Fall back to system default row (tenantId IS NULL)
    const systemRow = rows.find((r) => r.tenantId === null && r.severity === severity)
    if (systemRow) {
      resolved[severity] = systemRow.penaltyWeight
      continue
    }

    // Fall back to hardcoded default
    resolved[severity] = DEFAULT_PENALTY_WEIGHTS[severity]
  }

  return {
    critical: resolved.critical ?? DEFAULT_PENALTY_WEIGHTS.critical,
    major: resolved.major ?? DEFAULT_PENALTY_WEIGHTS.major,
    minor: resolved.minor ?? DEFAULT_PENALTY_WEIGHTS.minor,
  }
}
