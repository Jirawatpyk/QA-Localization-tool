import 'server-only'

import type { BudgetCheckResult } from './types'

/**
 * Check if a tenant has remaining AI quota.
 *
 * STUB: Always returns hasQuota=true.
 * Story 3.1 implements real budget tracking via ai_usage_logs table.
 */
export async function checkTenantBudget(_tenantId: string): Promise<BudgetCheckResult> {
  // TODO (Story 3.1): Query ai_usage_logs for current month usage
  // and compare against tenant's monthly token limit.
  return {
    hasQuota: true,
    remainingTokens: Number.MAX_SAFE_INTEGER,
    monthlyLimitTokens: Number.MAX_SAFE_INTEGER,
    usedTokens: 0,
  }
}
