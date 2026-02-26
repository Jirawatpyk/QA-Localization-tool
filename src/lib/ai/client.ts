import 'server-only'

import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { customProvider } from 'ai'

/**
 * Unified AI provider for the QA pipeline.
 *
 * Usage:
 *   import { qaProvider } from '@/lib/ai/client'
 *   const model = qaProvider.languageModel('l2-screening')
 *
 * Models:
 *   - 'l2-screening'  → gpt-4o-mini (fast, cheap — L2 AI triage)
 *   - 'l3-analysis'   → claude-sonnet-4-5-20250929 (deep, accurate — L3 review)
 *
 * API keys are read from env by provider packages automatically
 * (OPENAI_API_KEY, ANTHROPIC_API_KEY) — validated in @/lib/env.ts
 */
export const qaProvider = customProvider({
  languageModels: {
    'l2-screening': openai('gpt-4o-mini'),
    'l3-analysis': anthropic('claude-sonnet-4-5-20250929'),
  },
  // No fallbackProvider — explicit model selection only.
  // Cross-provider fallback handled at Inngest step level (Guardrail #18).
})

/**
 * Convenience: get the model for a given pipeline layer.
 *
 * @example
 *   const model = getModelForLayer('L2')
 *   const result = await generateText({ model, ... })
 */
export function getModelForLayer(layer: 'L2' | 'L3') {
  return layer === 'L2'
    ? qaProvider.languageModel('l2-screening')
    : qaProvider.languageModel('l3-analysis')
}
