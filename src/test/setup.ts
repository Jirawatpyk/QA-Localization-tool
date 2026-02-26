import { afterEach, vi } from 'vitest'

import { useKeyboardStore } from '@/stores/keyboard.store'
import { useUIStore } from '@/stores/ui.store'

import { createDrizzleMock } from './drizzleMock'
import { createAIMock } from './mocks/ai-providers'

// Attach shared mock factories to globalThis so vi.hoisted() can access them
// (setupFiles run before vi.hoisted() blocks in test files)
;(globalThis as unknown as Record<string, unknown>).createDrizzleMock = createDrizzleMock
;(globalThis as unknown as Record<string, unknown>).createAIMock = createAIMock

// Clear all Zustand stores to prevent state leak between tests
afterEach(() => {
  useUIStore.getState().setSidebarOpen(true)
  useUIStore.getState().setDetailPanelOpen(false)
  useKeyboardStore.getState().clearAll()
})

// Reset all mocks after each test
afterEach(() => {
  vi.restoreAllMocks()
})
