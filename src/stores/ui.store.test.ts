import { describe, it, expect, beforeEach } from 'vitest'

import { useUIStore } from '@/stores/ui.store'

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.getState().setSidebarOpen(true)
  })

  it('should default sidebar to open', () => {
    expect(useUIStore.getState().sidebarOpen).toBe(true)
  })

  it('should toggle sidebar state', () => {
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarOpen).toBe(false)

    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarOpen).toBe(true)
  })

  it('should set sidebar state explicitly', () => {
    useUIStore.getState().setSidebarOpen(false)
    expect(useUIStore.getState().sidebarOpen).toBe(false)
  })
})
