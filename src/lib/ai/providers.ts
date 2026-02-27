import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { projects } from '@/db/schema/projects'

import type { AILayer } from './types'

// ── Types ──

export type FallbackChain = {
  primary: string
  fallbacks: string[]
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
