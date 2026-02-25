'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

type ProjectSubNavProps = {
  projectId: string
}

const TABS = [
  {
    label: 'Files',
    href: (id: string) => `/projects/${id}/upload`,
    dataTour: 'project-files' as const,
  },
  { label: 'Batches', href: (id: string) => `/projects/${id}/batches`, dataTour: undefined },
  { label: 'History', href: (id: string) => `/projects/${id}/files`, dataTour: undefined },
  { label: 'Parity', href: (id: string) => `/projects/${id}/parity`, dataTour: undefined },
  { label: 'Settings', href: (id: string) => `/projects/${id}/settings`, dataTour: undefined },
  {
    label: 'Glossary',
    href: (id: string) => `/projects/${id}/glossary`,
    dataTour: 'project-glossary' as const,
  },
] as const

export function ProjectSubNav({ projectId }: ProjectSubNavProps) {
  const pathname = usePathname()

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-border px-4"
      aria-label="Project navigation"
    >
      {TABS.map((tab) => {
        const href = tab.href(projectId)
        const isActive = pathname === href || pathname.startsWith(href + '/')

        return (
          <Link
            key={tab.label}
            href={href}
            data-tour={tab.dataTour}
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
