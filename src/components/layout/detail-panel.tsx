'use client'

import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui.store'

type DetailPanelProps = {
  children?: ReactNode
}

export function DetailPanel({ children }: DetailPanelProps) {
  const detailPanelOpen = useUIStore((s) => s.detailPanelOpen)
  const setDetailPanelOpen = useUIStore((s) => s.setDetailPanelOpen)

  return (
    <>
      {/* Side panel at 2xl: visible, sticky */}
      <aside
        className={cn(
          'hidden 2xl:block',
          'w-[var(--detail-panel-width)] shrink-0 border-l border-border bg-surface',
          'overflow-y-auto',
        )}
        role="complementary"
        aria-label="Detail panel"
      >
        {children ?? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            Select an item to view details
          </div>
        )}
      </aside>

      {/* Overlay sheet at xl/lg */}
      {detailPanelOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 2xl:hidden"
            onClick={() => setDetailPanelOpen(false)}
            aria-hidden
          />
          <aside
            className={cn(
              'fixed right-0 top-0 z-50 h-full 2xl:hidden',
              'w-[var(--detail-panel-width)] border-l border-border bg-surface',
              'sidebar-transition overflow-y-auto shadow-lg',
            )}
            role="complementary"
            aria-label="Detail panel"
          >
            <div className="flex h-12 items-center justify-between border-b border-border px-3">
              <span className="text-sm font-medium text-text-primary">Details</span>
              <button
                onClick={() => setDetailPanelOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                aria-label="Close detail panel"
              >
                <X size={16} />
              </button>
            </div>
            {children ?? (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">
                Select an item to view details
              </div>
            )}
          </aside>
        </>
      )}
    </>
  )
}
