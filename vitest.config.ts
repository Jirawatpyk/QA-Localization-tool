import path from 'path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      exclude: [
        'src/db/schema/**', // Declarative schema + relations — not business logic
        'src/test/**', // Test utilities, factories, mocks, fixtures
        'src/components/ui/**', // shadcn/ui generated components
        'src/db/client.ts', // DB connection setup — needs real DB, not unit-testable
        'src/features/pipeline/__tests__/pipeline-integration.helpers.ts', // Integration test helper — only used by env-gated tests
        'src/lib/env.ts', // Zod env validation at startup — runs once at boot
      ],
      thresholds: {
        lines: 90,
        statements: 89,
        branches: 82,
        functions: 80,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [
            'src/db/__tests__/**',
            'src/__tests__/integration/**',
            'src/__tests__/ai-integration/**',
          ],
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          testTimeout: 15000,
        },
      },
      {
        extends: true,
        test: {
          name: 'rls',
          include: ['src/db/__tests__/rls/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['./src/db/__tests__/rls/setup.ts'],
          testTimeout: 30000,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['src/__tests__/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['./src/__tests__/integration/setup.ts'],
          testTimeout: 60000,
        },
      },
      {
        extends: true,
        test: {
          name: 'ai-integration',
          include: ['src/__tests__/ai-integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['./src/__tests__/ai-integration/setup.ts'],
          testTimeout: 60000, // AI calls can be slow (30s+ for L3)
        },
      },
    ],
  },
})
