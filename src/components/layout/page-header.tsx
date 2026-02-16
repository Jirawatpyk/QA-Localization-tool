import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  breadcrumb?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, breadcrumb, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex flex-col gap-1">
        {breadcrumb && <div className="text-xs text-text-muted">{breadcrumb}</div>}
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
