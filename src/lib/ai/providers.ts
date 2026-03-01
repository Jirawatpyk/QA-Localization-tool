import 'server-only'

import { generateText } from 'ai'
import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { projects } from '@/db/schema/projects'
import { logger } from '@/lib/logger'

import { getModelById } from './client'
import type { AILayer } from './types'

// ── Types ──

export type FallbackChain = {
  primary: string
  fallbacks: string[]
}

export type ProviderHealthResult = {
  available: boolean
  latencyMs: number
}

// ── Config ──

export const LAYER_DEFAULTS: Record<AILayer, { systemDefault: string; fallbacks: string[] }> = {
  L2: { systemDefault: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] },
  L3: { systemDefault: 'claude-sonnet-4-5-20250929', fallbacks: ['gpt-4o'] },
}

// ── Pure Logic ──

/**
 * Build a fallback chain for a given layer and optional pinned model.
 *
 * When pinned:  primary=pinned → fallbacks=[systemDefault, ...other]
 * When null:    primary=systemDefault → fallbacks=[...other]
 * Deduplication: primary is never in fallbacks.
 */
export function buildFallbackChain(layer: AILayer, pinnedModel: string | null): FallbackChain {
  const config = LAYER_DEFAULTS[layer]
  const primary = pinnedModel ?? config.systemDefault
  const fallbacks = pinnedModel
    ? [config.systemDefault, ...config.fallbacks].filter((m) => m !== primary)
    : config.fallbacks.filter((m) => m !== primary)
  return { primary, fallbacks }
}

// ── DB-Backed ──

/**
 * Get the effective model for a layer, respecting pinned model from project settings.
 *
 * Queries projects table for l2_pinned_model / l3_pinned_model,
 * then builds fallback chain accordingly.
 */
export async function getModelForLayerWithFallback(
  layer: AILayer,
  projectId: string,
  tenantId: string,
): Promise<FallbackChain> {
  const [project] = await db
    .select({
      l2PinnedModel: projects.l2PinnedModel,
      l3PinnedModel: projects.l3PinnedModel,
    })
    .from(projects)
    .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))

  if (!project) {
    // Project not found or tenant mismatch — fall back to system defaults
    return buildFallbackChain(layer, null)
  }

  const pinnedModel = layer === 'L2' ? project.l2PinnedModel : project.l3PinnedModel
  return buildFallbackChain(layer, pinnedModel ?? null)
}

// ── Provider Health Check ──

/**
 * Map provider name to a lightweight probe model ID.
 */
const PROVIDER_PROBE_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-5-20250929',
  google: 'gemini-2.0-flash',
}

/**
 * Extract provider name from a model ID string.
 */
function getProviderForModel(modelId: string): string {
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1-') || modelId.startsWith('o3-'))
    return 'openai'
  if (modelId.startsWith('claude-')) return 'anthropic'
  if (modelId.startsWith('gemini-')) return 'google'
  return 'unknown'
}

/**
 * Lightweight health probe for an AI provider.
 *
 * Makes a minimal generateText call to check availability.
 * Never throws — always returns a result. Logs status via pino.
 */
export async function checkProviderHealth(provider: string): Promise<ProviderHealthResult> {
  const start = performance.now()
  try {
    const probeModelId = PROVIDER_PROBE_MODELS[provider]
    if (!probeModelId) {
      const latencyMs = Math.round(performance.now() - start)
      logger.warn(
        { provider, available: false, latencyMs },
        'Unknown provider — health check skipped',
      )
      return { available: false, latencyMs }
    }

    const model = getModelById(probeModelId)
    await generateText({
      model,
      prompt: 'ping',
      maxOutputTokens: 1,
    })

    const latencyMs = Math.round(performance.now() - start)
    logger.info({ provider, available: true, latencyMs }, 'Provider health check passed')
    return { available: true, latencyMs }
  } catch {
    const latencyMs = Math.round(performance.now() - start)
    logger.warn({ provider, available: false, latencyMs }, 'Provider health check failed')
    return { available: false, latencyMs }
  }
}

/**
 * Resolve the first healthy model from a fallback chain.
 *
 * Checks provider health starting from primary, then fallbacks in order.
 * If primary is unhealthy, promotes the first healthy fallback to primary.
 * If all are unhealthy, returns the original chain (let the actual AI call fail).
 */
export async function resolveHealthyModel(chain: FallbackChain): Promise<FallbackChain> {
  const primaryProvider = getProviderForModel(chain.primary)
  const primaryHealth = await checkProviderHealth(primaryProvider)

  if (primaryHealth.available) {
    return chain
  }

  logger.warn(
    { primary: chain.primary, provider: primaryProvider },
    'Primary model provider unhealthy — trying fallbacks',
  )

  for (const fallback of chain.fallbacks) {
    const fbProvider = getProviderForModel(fallback)
    const fbHealth = await checkProviderHealth(fbProvider)

    if (fbHealth.available) {
      logger.info(
        { fallbackModel: fallback, originalPrimary: chain.primary },
        'Fallback model activated due to primary health check failure',
      )
      return {
        primary: fallback,
        fallbacks: [chain.primary, ...chain.fallbacks.filter((m) => m !== fallback)],
      }
    }
  }

  logger.error(
    { primary: chain.primary, fallbacks: chain.fallbacks },
    'All providers unhealthy — using primary anyway',
  )
  return chain
}
