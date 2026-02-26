import { vi } from 'vitest'

/**
 * Shared AI provider mock factory for unit tests.
 *
 * Analogous to `createDrizzleMock()` for DB mocks. Provides all mock functions
 * and pre-wired module objects that can be passed directly to `vi.mock()`.
 *
 * Usage in test files:
 * ```ts
 * const { mocks, modules } = vi.hoisted(() => createAIMock({ layer: 'L2' }))
 *
 * vi.mock('ai', () => modules.ai)
 * vi.mock('@/lib/ai/client', () => modules.aiClient)
 * vi.mock('@/lib/ai/costs', () => modules.aiCosts)
 * vi.mock('@/lib/ai/errors', () => modules.aiErrors)
 * vi.mock('@/lib/ai/budget', () => modules.aiBudget)
 * vi.mock('@/lib/ai/types', () => modules.aiTypes)
 * vi.mock('@/features/audit/actions/writeAuditLog', () => modules.audit)
 * vi.mock('@/lib/logger', () => modules.logger)
 * ```
 *
 * Then in tests, access mock functions via `mocks.mockGenerateText`, etc.
 */

// ── Types ──

export type AIMockOptions = {
  /** Which layer to configure as default. Affects getModelForLayer return value. */
  layer?: 'L2' | 'L3'
}

export type AIMockFunctions = {
  mockGenerateText: ReturnType<typeof vi.fn>
  mockClassifyAIError: ReturnType<typeof vi.fn>
  mockCheckTenantBudget: ReturnType<typeof vi.fn>
  mockWriteAuditLog: ReturnType<typeof vi.fn>
  mockLogAIUsage: ReturnType<typeof vi.fn>
  mockEstimateCost: ReturnType<typeof vi.fn>
  mockAggregateUsage: ReturnType<typeof vi.fn>
}

export type AIMockModules = {
  ai: Record<string, unknown>
  aiClient: Record<string, unknown>
  aiCosts: Record<string, unknown>
  aiErrors: Record<string, unknown>
  aiBudget: Record<string, unknown>
  aiTypes: Record<string, unknown>
  audit: Record<string, unknown>
  logger: Record<string, unknown>
}

export type AIMockResult = {
  mocks: AIMockFunctions
  modules: AIMockModules
}

// ── Factory ──

export function createAIMock(options?: AIMockOptions): AIMockResult {
  const layer = options?.layer ?? 'L2'
  const modelName = layer === 'L2' ? 'mock-l2-model' : 'mock-l3-model'

  // ── Mock functions (accessible for assertions + mockResolvedValue overrides) ──

  const mockGenerateText = vi.fn((..._args: unknown[]) =>
    Promise.resolve({
      output: { findings: [] as Record<string, unknown>[], summary: 'No issues found' },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      text: '',
      finishReason: 'stop' as const,
    }),
  )

  const mockClassifyAIError = vi.fn((..._args: unknown[]) => 'unknown' as string)

  const mockCheckTenantBudget = vi.fn((..._args: unknown[]) =>
    Promise.resolve({
      hasQuota: true,
      remainingTokens: Number.MAX_SAFE_INTEGER,
      monthlyLimitTokens: Number.MAX_SAFE_INTEGER,
      usedTokens: 0,
    }),
  )

  const mockWriteAuditLog = vi.fn((..._args: unknown[]) => Promise.resolve())
  const mockLogAIUsage = vi.fn()
  const mockEstimateCost = vi.fn((..._args: unknown[]) => 0.001)
  const mockAggregateUsage = vi.fn((..._args: unknown[]) => ({
    inputTokens: 100,
    outputTokens: 50,
    estimatedCostUsd: 0.001,
  }))

  // ── Module mocks (pass to vi.mock() factory callbacks) ──

  const modules: AIMockModules = {
    ai: {
      generateText: (...args: unknown[]) => mockGenerateText(...args),
      Output: { object: vi.fn() },
    },
    aiClient: {
      getModelForLayer: vi.fn(() => modelName),
    },
    aiCosts: {
      estimateCost: (...args: unknown[]) => mockEstimateCost(...args),
      logAIUsage: (...args: unknown[]) => mockLogAIUsage(...args),
      aggregateUsage: (...args: unknown[]) => mockAggregateUsage(...args),
    },
    aiErrors: {
      classifyAIError: (...args: unknown[]) => mockClassifyAIError(...args),
    },
    aiBudget: {
      checkTenantBudget: (...args: unknown[]) => mockCheckTenantBudget(...args),
    },
    aiTypes: {
      MODEL_CONFIG: {
        'gpt-4o-mini': {
          layer: 'L2',
          maxOutputTokens: 4096,
          temperature: 0.3,
          timeoutMs: 30000,
          costPer1kInput: 0.00015,
          costPer1kOutput: 0.0006,
        },
        'claude-sonnet-4-5-20250929': {
          layer: 'L3',
          maxOutputTokens: 8192,
          temperature: 0.2,
          timeoutMs: 60000,
          costPer1kInput: 0.003,
          costPer1kOutput: 0.015,
        },
      },
    },
    audit: {
      writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
    },
    logger: {
      logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    },
  }

  return {
    mocks: {
      mockGenerateText,
      mockClassifyAIError,
      mockCheckTenantBudget,
      mockWriteAuditLog,
      mockLogAIUsage,
      mockEstimateCost,
      mockAggregateUsage,
    },
    modules,
  }
}
