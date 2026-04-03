'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export function AutoFocusHeading({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <h2 ref={ref} tabIndex={-1} className={className}>
      {children}
    </h2>
  )
}
