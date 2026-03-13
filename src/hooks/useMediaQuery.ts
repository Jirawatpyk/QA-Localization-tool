'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Reusable media query hook — SSR-safe, listens to `change` events.
 * Pattern based on useReducedMotion.ts.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  const handleChange = useCallback((e: MediaQueryListEvent) => {
    setMatches(e.matches)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    setMatches(mql.matches) // eslint-disable-line react-hooks/set-state-in-effect -- sync initial matchMedia value after hydration (external system subscription)
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [query, handleChange])

  return matches
}

/** >= 1440px — full 3-column desktop layout */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1440px)')
}

/** >= 1024px — laptop layout (dropdown nav, Sheet overlay) */
export function useIsLaptop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}

/** < 768px — mobile layout (single column + MobileBanner) */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
