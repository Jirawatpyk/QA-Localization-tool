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
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/db/__tests__/**', 'src/__tests__/integration/**'],
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
          testTimeout: 60000,
        },
      },
    ],
  },
})
