import { afterEach, vi } from 'vitest'

import { useKeyboardStore } from '@/stores/keyboard.store'
import { useUIStore } from '@/stores/ui.store'

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
