'use client'

import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  LayoutDashboard,
  Shield,
  Upload,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'

import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui.store'

const STORAGE_KEY = 'sidebar-collapsed'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, dataTour: undefined },
  { href: '/projects', label: 'Projects', icon: FolderOpen, dataTour: 'create-project' },
  { href: '/glossary', label: 'Glossary', icon: BookOpen, dataTour: 'nav-glossary' },
  { href: '/upload', label: 'Upload', icon: Upload, dataTour: 'nav-upload' },
  { href: '/admin', label: 'Admin', icon: Shield, dataTour: undefined },
] as const

export function AppSidebar() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      setSidebarOpen(stored !== 'true')
    }
  }, [setSidebarOpen])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(!sidebarOpen))
  }, [sidebarOpen])

  return (
    <aside
      className={cn(
        'sidebar-transition relative flex h-full flex-col border-r border-border bg-surface',
        sidebarOpen ? 'w-[var(--sidebar-width)]' : 'w-[var(--sidebar-width-collapsed)]',
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        {sidebarOpen && <span className="text-sm font-semibold text-text-primary">QA Tool</span>}
        <button
          onClick={toggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-tour={item.dataTour}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-text-secondary',
              'hover:bg-muted hover:text-text-primary',
              'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
              !sidebarOpen && 'justify-center px-0',
            )}
          >
            <item.icon size={18} aria-hidden />
            {sidebarOpen && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
