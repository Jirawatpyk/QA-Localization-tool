'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

type ProjectSubNavProps = {
  projectId: string
}

const TABS = [
  { label: 'Settings', href: (id: string) => `/projects/${id}/settings` },
  { label: 'Glossary', href: (id: string) => `/projects/${id}/glossary` },
] as const

export function ProjectSubNav({ projectId }: ProjectSubNavProps) {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 border-b border-border px-4" aria-label="Project navigation">
      {TABS.map((tab) => {
        const href = tab.href(projectId)
        const isActive = pathname === href

        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              'px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-b-2 border-primary text-primary'
                : 'text-text-muted hover:text-text-primary',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
