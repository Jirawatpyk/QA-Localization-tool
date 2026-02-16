import { describe, it, expect, beforeEach } from 'vitest'

import { useUIStore } from '@/stores/ui.store'

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.getState().setSidebarOpen(true)
    useUIStore.getState().setDetailPanelOpen(false)
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

  it('should toggle detail panel state', () => {
    expect(useUIStore.getState().detailPanelOpen).toBe(false)

    useUIStore.getState().toggleDetailPanel()
    expect(useUIStore.getState().detailPanelOpen).toBe(true)
  })
})
