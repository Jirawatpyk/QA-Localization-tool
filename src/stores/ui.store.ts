import { create } from 'zustand'

type UIState = {
  sidebarOpen: boolean
  detailPanelOpen: boolean
  toggleSidebar: () => void
  toggleDetailPanel: () => void
  setSidebarOpen: (open: boolean) => void
  setDetailPanelOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  detailPanelOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleDetailPanel: () => set((state) => ({ detailPanelOpen: !state.detailPanelOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setDetailPanelOpen: (open) => set({ detailPanelOpen: open }),
}))
