import 'server-only'

import { and, eq, gte, lt, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { backTranslationCache } from '@/db/schema/backTranslationCache'
import type { TenantId } from '@/types/tenant'

import type { BackTranslationResult } from '../types'

// TTL = 24 hours
const TTL_MS = 24 * 60 * 60 * 1000

/**
 * Compute SHA-256 hash of target text for cache key (Guardrail #57).
 * Ensures stale cache is not served after re-upload with different text.
 */
export async function computeTargetTextHash(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Get cached back-translation if available and not expired.
 *
 * Guardrail #58: withTenant() on every cache query.
 * Guardrail #61: TTL filter at query time (createdAt >= now - 24h).
 */
export async function getCachedBackTranslation(
  segmentId: string,
  languagePair: string,
  modelVersion: string,
  tenantId: TenantId,
  targetTextHash: string, // Guardrail #57: include hash to prevent stale cache on re-upload
): Promise<(BackTranslationResult & { cached: true }) | null> {
  const ttlCutoff = new Date(Date.now() - TTL_MS)

  const rows = await db
    .select()
    .from(backTranslationCache)
    .where(
      and(
        eq(backTranslationCache.segmentId, segmentId),
        eq(backTranslationCache.languagePair, languagePair),
        eq(backTranslationCache.modelVersion, modelVersion),
        eq(backTranslationCache.targetTextHash, targetTextHash),
        withTenant(backTranslationCache.tenantId, tenantId),
        gte(backTranslationCache.createdAt, ttlCutoff),
      ),
    )
    .limit(1)

  if (rows.length === 0) return null

  const row = rows[0]!
  return {
    backTranslation: row.backTranslation,
    contextualExplanation: row.contextualExplanation,
    confidence: row.confidence,
    languageNotes: row.languageNotes,
    translationApproach: row.translationApproach,
    cached: true,
  }
}

type CacheBackTranslationParams = {
  segmentId: string
  tenantId: TenantId
  languagePair: string
  modelVersion: string
  targetTextHash: string
  result: BackTranslationResult
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
}

/**
 * Cache a back-translation result.
 *
 * Guardrail #59: onConflictDoUpdate on unique constraint for concurrent requests.
 * Refreshes createdAt on conflict to extend TTL.
 */
export async function cacheBackTranslation(params: CacheBackTranslationParams): Promise<void> {
  await db
    .insert(backTranslationCache)
    .values({
      segmentId: params.segmentId,
      tenantId: params.tenantId,
      languagePair: params.languagePair,
      modelVersion: params.modelVersion,
      targetTextHash: params.targetTextHash,
      backTranslation: params.result.backTranslation,
      contextualExplanation: params.result.contextualExplanation,
      confidence: params.result.confidence,
      languageNotes: params.result.languageNotes,
      translationApproach: params.result.translationApproach,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCostUsd: params.estimatedCostUsd,
    })
    .onConflictDoUpdate({
      target: [
        backTranslationCache.segmentId,
        backTranslationCache.languagePair,
        backTranslationCache.modelVersion,
        backTranslationCache.targetTextHash,
      ],
      set: {
        backTranslation: params.result.backTranslation,
        contextualExplanation: params.result.contextualExplanation,
        confidence: params.result.confidence,
        languageNotes: params.result.languageNotes,
        translationApproach: params.result.translationApproach,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        estimatedCostUsd: params.estimatedCostUsd,
        createdAt: sql`now()`, // Refresh TTL on conflict
      },
    })
}

/**
 * Invalidate BT cache entries for a specific glossary update.
 *
 * Guardrail #60: Explicit DELETE for glossary updates (exception to CASCADE rule).
 * CASCADE handles re-upload invalidation; glossary changes need manual invalidation
 * because glossary changes don't delete segments.
 */
export async function invalidateBTCacheForGlossary(
  projectId: string,
  languagePair: string,
  tenantId: TenantId,
): Promise<number> {
  // Delete cache entries for segments in this project with matching language pair.
  // Uses a subquery through segments → files → projects chain.
  const result = await db
    .delete(backTranslationCache)
    .where(
      and(
        eq(backTranslationCache.languagePair, languagePair),
        withTenant(backTranslationCache.tenantId, tenantId),
        // Subquery: segment belongs to this project (defense-in-depth: tenant filter on every table)
        sql`${backTranslationCache.segmentId} IN (
          SELECT s.id FROM segments s
          JOIN files f ON s.file_id = f.id
          WHERE f.project_id = ${projectId}
            AND s.tenant_id = ${tenantId}
            AND f.tenant_id = ${tenantId}
        )`,
      ),
    )
    .returning({ id: backTranslationCache.id })

  return result.length
}

/**
 * Delete expired cache entries (TTL > 24h).
 * Called by daily cron job (Guardrail #61).
 *
 * Intentional: no withTenant() — cron cleanup removes expired entries
 * across ALL tenants. Individual tenant isolation is enforced at read-time
 * (getCachedBackTranslation). This function is called only by the
 * cleanBTCache Inngest cron job, never from per-tenant code paths.
 */
export async function deleteExpiredBTCache(): Promise<number> {
  const ttlCutoff = new Date(Date.now() - TTL_MS)

  const result = await db
    .delete(backTranslationCache)
    .where(lt(backTranslationCache.createdAt, ttlCutoff))
    .returning({ id: backTranslationCache.id })

  return result.length
}
