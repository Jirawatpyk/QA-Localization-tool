import { create } from 'zustand'

type KeyboardState = {
  activeShortcuts: Map<string, () => void>
  registerShortcut: (key: string, handler: () => void) => void
  unregisterShortcut: (key: string) => void
  clearAll: () => void
}

export const useKeyboardStore = create<KeyboardState>((set) => ({
  activeShortcuts: new Map(),
  registerShortcut: (key, handler) =>
    set((state) => {
      const next = new Map(state.activeShortcuts)
      next.set(key, handler)
      return { activeShortcuts: next }
    }),
  unregisterShortcut: (key) =>
    set((state) => {
      const next = new Map(state.activeShortcuts)
      next.delete(key)
      return { activeShortcuts: next }
    }),
  clearAll: () => set({ activeShortcuts: new Map() }),
}))
