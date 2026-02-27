import 'server-only'

import { and, eq, gte, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { aiUsageLogs } from '@/db/schema/aiUsageLogs'
import { projects } from '@/db/schema/projects'

import type { BudgetCheckResult } from './types'

/**
 * Check if a tenant has remaining AI quota.
 *
 * STUB: Always returns hasQuota=true.
 * Retained for backward compatibility — callers migrating to checkProjectBudget.
 */
export async function checkTenantBudget(_tenantId: string): Promise<BudgetCheckResult> {
  return {
    hasQuota: true,
    remainingBudgetUsd: Infinity,
    monthlyBudgetUsd: null,
    usedBudgetUsd: 0,
  }
}

/**
 * Check if a project has remaining AI budget for the current calendar month.
 *
 * Logic:
 *   1. Load project's ai_budget_monthly_usd (NULL = unlimited)
 *   2. If unlimited → return hasQuota:true immediately
 *   3. Query ai_usage_logs SUM(estimated_cost) for current month
 *   4. Compare: usedBudgetUsd < monthlyBudgetUsd → hasQuota
 *
 * Guard: withTenant() on every query. Guardrail #4 on rows[0]!.
 */
export async function checkProjectBudget(
  projectId: string,
  tenantId: string,
): Promise<BudgetCheckResult> {
  // Step 1: Get project budget
  const [project] = await db
    .select({ aiBudgetMonthlyUsd: projects.aiBudgetMonthlyUsd })
    .from(projects)
    .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))

  if (!project) {
    throw new Error('Project not found')
  }

  // Step 2: NULL budget = unlimited
  if (project.aiBudgetMonthlyUsd === null) {
    return {
      hasQuota: true,
      remainingBudgetUsd: Infinity,
      monthlyBudgetUsd: null,
      usedBudgetUsd: 0,
    }
  }

  // Step 3: Query current month's total spend
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [usage] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
    })
    .from(aiUsageLogs)
    .where(
      and(
        withTenant(aiUsageLogs.tenantId, tenantId),
        eq(aiUsageLogs.projectId, projectId),
        gte(aiUsageLogs.createdAt, monthStart),
      ),
    )

  // Step 4: Calculate budget status
  const usedBudgetUsd = Number(usage?.total ?? 0)
  const budget = Number(project.aiBudgetMonthlyUsd)

  return {
    hasQuota: usedBudgetUsd < budget,
    remainingBudgetUsd: Math.max(0, budget - usedBudgetUsd),
    monthlyBudgetUsd: budget,
    usedBudgetUsd,
  }
}
