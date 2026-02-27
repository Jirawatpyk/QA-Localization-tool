'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'User Management', href: '/admin', testId: 'admin-tab-users' },
  { label: 'Taxonomy Mapping', href: '/admin/taxonomy', testId: 'admin-tab-taxonomy' },
  { label: 'AI Usage', href: '/admin/ai-usage', testId: 'admin-tab-ai-usage' },
] as const

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div>
      <nav className="border-b border-border mb-4" aria-label="Admin navigation">
        <div className="flex gap-1 px-6 pt-2">
          {NAV_ITEMS.map(({ label, href, testId }) => {
            const isActive = pathname === href
            return (
              <Link
                key={href}
                href={href}
                data-testid={testId}
                className={[
                  'px-4 py-2 text-sm font-medium rounded-t-md transition-colors',
                  isActive
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-text-secondary hover:text-text-primary',
                ].join(' ')}
                aria-current={isActive ? 'page' : undefined}
              >
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
      {children}
    </div>
  )
}
