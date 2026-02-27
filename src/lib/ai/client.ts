import 'server-only'

import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
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
 * Convenience: get the model for a given pipeline layer (uses system defaults).
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

/**
 * Create an AI SDK language model instance from a model ID string.
 *
 * Maps model ID prefix to the appropriate provider SDK.
 * Used when a project has a pinned model that differs from the system default.
 *
 * @example
 *   const model = getModelById('gpt-4o-mini-2024-07-18')
 *   const result = await generateText({ model, ... })
 */
export function getModelById(modelId: string) {
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1-') || modelId.startsWith('o3-'))
    return openai(modelId)
  if (modelId.startsWith('claude-')) return anthropic(modelId)
  if (modelId.startsWith('gemini-')) return google(modelId)
  throw new Error(`Unsupported model provider for: ${modelId}`)
}
