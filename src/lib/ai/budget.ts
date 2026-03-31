import 'server-only'

import { and, eq, gte, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { aiUsageLogs } from '@/db/schema/aiUsageLogs'
import { projects } from '@/db/schema/projects'
import { logger } from '@/lib/logger'
import type { TenantId } from '@/types/tenant'

import type { AILayer, BudgetCheckResult } from './types'
import { getConfigForModel } from './types'

// ── Types ──

export type BudgetReservation = {
  hasQuota: boolean
  reservationId: string | null
  remainingBudgetUsd: number
  monthlyBudgetUsd: number | null
  usedBudgetUsd: number
}

// ── Budget Check (read-only, no reservation) ──

/**
 * Check if a tenant has remaining AI quota.
 *
 * STUB: Always returns hasQuota=true.
 * Retained for backward compatibility — callers migrating to checkProjectBudget.
 */
export async function checkTenantBudget(_tenantId: TenantId): Promise<BudgetCheckResult> {
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
 * NOTE: This is a snapshot read — subject to TOCTOU race under concurrency.
 * For AI calls, prefer reserveBudget() which atomically checks + reserves.
 * Retained for read-only budget display in UI.
 */
export async function checkProjectBudget(
  projectId: string,
  tenantId: TenantId,
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

  // Step 3: Query current month's total spend (UTC to avoid timezone drift)
  const monthStart = getMonthStartUtc()

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
        // D1 fix: exclude stale pending reservations (> 30 min = leaked/crashed process)
        sql`(${aiUsageLogs.status} != 'pending' OR ${aiUsageLogs.createdAt} >= NOW() - INTERVAL '30 minutes')`,
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

// ── Budget Reservation (TOCTOU-safe) ──

/**
 * Atomically check budget and reserve estimated cost for an upcoming AI call.
 *
 * Uses pg_advisory_xact_lock to serialize concurrent budget checks per project.
 * Inserts a "pending" ai_usage_logs row with estimated max cost so that
 * concurrent callers see the reserved amount in their SUM.
 *
 * After the AI call completes, the caller MUST call either:
 *   - settleBudget() — update with actual cost + status
 *   - releaseBudget() — delete the reservation (on failure before AI response)
 *
 * @param estimatedCost - Pre-computed estimated max cost for this call.
 *   Callers can use estimateMaxCost() to compute a conservative upper bound.
 */
export async function reserveBudget(params: {
  projectId: string
  tenantId: TenantId
  fileId: string
  model: string
  layer: AILayer
  estimatedCost: number
  languagePair: string | null
}): Promise<BudgetReservation> {
  const { projectId, tenantId, fileId, model, layer, estimatedCost, languagePair } = params
  const monthStart = getMonthStartUtc()

  // Atomic check + reserve inside advisory-locked transaction.
  // D2 fix: budget cap read INSIDE the lock so admin budget changes are seen atomically.
  // pg_advisory_xact_lock serializes per project — lock key derived from project UUID.
  // Lock is auto-released at transaction end (no manual unlock needed).
  const result = await db.transaction(async (tx) => {
    const lockKey = projectIdToLockKey(projectId)
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7001, ${lockKey})`)

    // Read budget inside lock — prevents TOCTOU if admin changes budget concurrently
    const [project] = await tx
      .select({ aiBudgetMonthlyUsd: projects.aiBudgetMonthlyUsd })
      .from(projects)
      .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))

    if (!project) {
      throw new Error('Project not found')
    }

    // Unlimited budget — no reservation needed
    if (project.aiBudgetMonthlyUsd === null) {
      return {
        hasQuota: true,
        reservationId: null,
        remainingBudgetUsd: Infinity,
        monthlyBudgetUsd: null,
        usedBudgetUsd: 0,
      }
    }

    const budget = Number(project.aiBudgetMonthlyUsd)

    // SUM includes settled + pending rows, but excludes stale pending (D1 fix)
    const [usage] = await tx
      .select({
        total: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
      })
      .from(aiUsageLogs)
      .where(
        and(
          withTenant(aiUsageLogs.tenantId, tenantId),
          eq(aiUsageLogs.projectId, projectId),
          gte(aiUsageLogs.createdAt, monthStart),
          // D1 fix: exclude stale pending reservations (> 30 min = leaked/crashed process)
          sql`(${aiUsageLogs.status} != 'pending' OR ${aiUsageLogs.createdAt} >= NOW() - INTERVAL '30 minutes')`,
        ),
      )

    const usedBudgetUsd = Number(usage?.total ?? 0)

    if (usedBudgetUsd + estimatedCost > budget) {
      return {
        hasQuota: false,
        reservationId: null,
        remainingBudgetUsd: Math.max(0, budget - usedBudgetUsd),
        monthlyBudgetUsd: budget,
        usedBudgetUsd,
      }
    }

    // Insert pending reservation row — counted in SUM by concurrent callers
    const [reservation] = await tx
      .insert(aiUsageLogs)
      .values({
        fileId,
        projectId,
        tenantId,
        layer,
        model,
        provider: 'reservation',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: estimatedCost,
        latencyMs: 0,
        chunkIndex: null,
        languagePair,
        status: 'pending',
      })
      .returning({ id: aiUsageLogs.id })

    if (!reservation) {
      throw new Error('Failed to insert budget reservation')
    }

    return {
      hasQuota: true,
      reservationId: reservation.id,
      remainingBudgetUsd: Math.max(0, budget - usedBudgetUsd - estimatedCost),
      monthlyBudgetUsd: budget,
      usedBudgetUsd: usedBudgetUsd + estimatedCost,
    }
  })

  return result
}

/**
 * Settle a budget reservation after AI call completes.
 *
 * Updates the pending row with actual cost, tokens, and final status.
 * The pending row's estimatedCost (conservative upper bound) is replaced
 * with the actual cost — freeing unused budget for other callers.
 */
export async function settleBudget(params: {
  reservationId: string
  tenantId: TenantId
  actualCost: number
  inputTokens: number
  outputTokens: number
  durationMs: number
  status: 'success' | 'error'
  provider: string
  chunkIndex?: number | null
}): Promise<void> {
  const {
    reservationId,
    tenantId,
    actualCost,
    inputTokens,
    outputTokens,
    durationMs,
    status,
    provider,
    chunkIndex,
  } = params

  const [updated] = await db
    .update(aiUsageLogs)
    .set({
      estimatedCost: actualCost,
      inputTokens,
      outputTokens,
      latencyMs: durationMs,
      status,
      provider,
      ...(chunkIndex !== undefined ? { chunkIndex } : {}),
    })
    .where(
      and(
        eq(aiUsageLogs.id, reservationId),
        withTenant(aiUsageLogs.tenantId, tenantId),
        eq(aiUsageLogs.status, 'pending'),
      ),
    )
    .returning({ id: aiUsageLogs.id })

  if (!updated) {
    logger.warn(
      { reservationId },
      'settleBudget: reservation row not found or already settled — skipping duplicate',
    )
  }
}

/**
 * Release a budget reservation without settlement (e.g., AI call failed
 * before producing any usage data, or non-retriable error before AI call).
 *
 * Deletes the pending row so its estimated cost is freed from the SUM.
 */
export async function releaseBudget(reservationId: string, tenantId: TenantId): Promise<void> {
  await db
    .delete(aiUsageLogs)
    .where(
      and(
        eq(aiUsageLogs.id, reservationId),
        withTenant(aiUsageLogs.tenantId, tenantId),
        eq(aiUsageLogs.status, 'pending'),
      ),
    )
}

// ── Helpers ──

/**
 * Estimate maximum cost for an AI call (conservative upper bound).
 *
 * Uses maxOutputTokens from model config as worst-case output.
 * Input cost uses layer-specific multipliers since prompt sizes vary:
 * - L2/BT: 4x output tokens (short prompts, small segment batches)
 * - L3: 12x output tokens (large system prompts, full segment context)
 */
export function estimateMaxCost(model: string, layer: AILayer): number {
  const config = getConfigForModel(model, layer)
  const maxOutputCost = (config.maxOutputTokens / 1000) * config.costPer1kOutput
  // D4 fix: layer-specific multiplier — L3 prompts include many segments as context
  const inputMultiplier = layer === 'L3' ? 12 : 4
  const estimatedInputCost =
    ((config.maxOutputTokens * inputMultiplier) / 1000) * config.costPer1kInput
  return Math.round((maxOutputCost + estimatedInputCost) * 1_000_000) / 1_000_000
}

/** Get the start of the current month in UTC */
function getMonthStartUtc(): Date {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/**
 * Convert a project UUID to a stable int64 advisory lock key.
 *
 * Takes first 8 hex chars of UUID → parse as int32.
 * Prefixed with a namespace constant (7001) to avoid collision with
 * other advisory lock users in the same database.
 *
 * pg_advisory_xact_lock accepts two int4 args: (namespace, key).
 */
function projectIdToLockKey(projectId: string): number {
  // Strip hyphens, take first 8 hex chars → 32-bit signed integer.
  // Bitwise OR coerces to signed int32 (-2147483648..2147483647),
  // matching PostgreSQL's int4 range for pg_advisory_xact_lock.
  const hex = projectId.replace(/-/g, '').slice(0, 8)
  return parseInt(hex, 16) | 0
}
