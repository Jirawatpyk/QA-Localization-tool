'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  getBreadcrumbEntities,
  type BreadcrumbEntities,
} from '@/components/layout/actions/getBreadcrumbEntities.action'

const STATIC_SEGMENTS = new Set([
  'dashboard',
  'projects',
  'glossary',
  'settings',
  'upload',
  'admin',
  'taxonomy',
  'review',
  'ai-usage',
  'batch',
  'details',
  'findings',
])

type ParsedSegment = {
  label: string
  href: string
  dynamicKey?: 'projectId' | 'sessionId' | undefined
}

function capitalize(s: string): string {
  if (s === 'ai-usage') return 'AI Usage'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function parsePath(pathname: string): {
  segments: ParsedSegment[]
  projectId: string | undefined
  sessionId: string | undefined
} {
  const parts = pathname.split('/').filter(Boolean)
  const segments: ParsedSegment[] = [{ label: 'Dashboard', href: '/dashboard' }]
  let projectId: string | undefined
  let sessionId: string | undefined
  let pathSoFar = ''
  let i = 0

  while (i < parts.length) {
    const part = parts[i]!

    if (part === 'dashboard') {
      pathSoFar = '/dashboard'
      i++
      continue
    }

    if (part === 'projects' && i + 1 < parts.length) {
      const id = parts[i + 1]!
      pathSoFar = `/projects/${id}`
      projectId = id
      segments.push({ label: id, href: pathSoFar, dynamicKey: 'projectId' })
      i += 2
      continue
    }

    pathSoFar += `/${part}`

    if (STATIC_SEGMENTS.has(part)) {
      segments.push({ label: capitalize(part), href: pathSoFar })
    } else {
      sessionId = part
      segments.push({ label: part, href: pathSoFar, dynamicKey: 'sessionId' })
    }
    i++
  }

  return { segments, projectId, sessionId }
}

function resolveSegments(segments: ParsedSegment[], entities: BreadcrumbEntities): ParsedSegment[] {
  return segments.map((seg) => {
    if (seg.dynamicKey === 'projectId' && entities.projectName) {
      return { ...seg, label: entities.projectName }
    }
    if (seg.dynamicKey === 'sessionId' && entities.sessionName) {
      return { ...seg, label: entities.sessionName }
    }
    return seg
  })
}

type DisplayItem = ParsedSegment | { ellipsis: true }

function truncateSegments(segments: ParsedSegment[]): DisplayItem[] {
  if (segments.length <= 4) {
    return segments
  }
  const first = segments[0]!
  const last = segments[segments.length - 1]!
  return [first, { ellipsis: true as const }, last]
}

export function AppBreadcrumb() {
  const pathname = usePathname()
  const [entities, setEntities] = useState<BreadcrumbEntities>({})
  const [prevPathname, setPrevPathname] = useState(pathname)

  const {
    segments: rawSegments,
    projectId,
    sessionId,
  } = useMemo(() => parsePath(pathname), [pathname])

  const hasDynamic = projectId !== undefined || sessionId !== undefined

  // Reset entities when pathname changes (render-time state derivation — React recommended)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setEntities({})
  }

  const fetchEntities = useCallback(() => {
    getBreadcrumbEntities({ projectId, sessionId })
      .then(setEntities)
      .catch(() => {
        /* non-critical — breadcrumb falls back to raw IDs */
      })
  }, [projectId, sessionId])

  useEffect(() => {
    if (!hasDynamic) return
    fetchEntities()
  }, [hasDynamic, fetchEntities])

  const resolved = resolveSegments(rawSegments, entities)
  const displayItems = truncateSegments(resolved)

  return (
    <nav aria-label="breadcrumb">
      <ol className="flex items-center gap-1.5 text-sm">
        {displayItems.map((item, index) => {
          if ('ellipsis' in item) {
            return (
              <li key="ellipsis" className="flex items-center gap-1.5">
                <span aria-hidden="true" className="text-muted-foreground">
                  /
                </span>
                <span>...</span>
              </li>
            )
          }

          const isLast = index === displayItems.length - 1

          return (
            <li key={item.href} className="flex items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden="true" className="text-muted-foreground">
                  /
                </span>
              )}
              {isLast ? (
                <span className="font-semibold text-text-primary">{item.label}</span>
              ) : (
                <Link
                  href={item.href}
                  className="text-text-secondary hover:text-text-primary transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
