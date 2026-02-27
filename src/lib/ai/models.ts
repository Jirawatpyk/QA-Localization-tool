/**
 * Shared model constants for AI layer configuration.
 *
 * Importable from both server and client code — no 'server-only' guard.
 * Used by: updateModelPinning.action.ts (server validation),
 *          ModelPinningSettings.tsx (client dropdown),
 *          providers.ts (fallback chain).
 */

export const AVAILABLE_L2_MODELS = [
  'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
] as const

export const AVAILABLE_L3_MODELS = [
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20251001',
  'gpt-4o',
  'gpt-4o-2024-11-20',
] as const

/** All allowed model IDs — used for server-side allowlist validation */
export const ALL_AVAILABLE_MODELS = new Set<string>([
  ...AVAILABLE_L2_MODELS,
  ...AVAILABLE_L3_MODELS,
])
