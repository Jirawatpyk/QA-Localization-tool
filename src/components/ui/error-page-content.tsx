'use client'

import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { SUPPORT_EMAIL } from '@/lib/constants'

type ErrorLink = {
  href: string
  label: string
  primary?: boolean
}

type ErrorPageContentProps = {
  icon: LucideIcon
  iconClassName?: string
  title: string
  description: string
  digest?: string | undefined
  fullScreen?: boolean
  reset?: (() => void) | undefined
  links?: ErrorLink[]
  children?: ReactNode | undefined
}

export function ErrorPageContent({
  icon: Icon,
  iconClassName = 'text-error',
  title,
  description,
  digest,
  fullScreen = false,
  reset,
  links = [],
  children,
}: ErrorPageContentProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const containerClass = fullScreen
    ? 'flex min-h-screen items-center justify-center'
    : 'flex flex-1 items-center justify-center p-8'

  return (
    <div className={containerClass} role="alert">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <Icon size={48} className={iconClassName} />
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-text-primary outline-none"
        >
          {title}
        </h2>
        <p className="text-sm text-text-secondary">{description}</p>
        {digest && <p className="text-xs text-text-muted">Error reference: {digest}</p>}
        {children}
        <div className="flex flex-col items-center gap-2">
          {reset && (
            <button
              onClick={reset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Try again
            </button>
          )}
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                link.primary
                  ? 'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary'
                  : 'text-sm text-text-secondary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary'
              }
            >
              {link.label}
            </Link>
          ))}
          <span className="text-xs text-text-muted">
            Need help?{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="underline hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Contact support
            </a>
          </span>
        </div>
      </div>
    </div>
  )
}
