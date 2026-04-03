'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment, useEffect, useMemo, useState } from 'react'

import {
  getBreadcrumbEntities,
  type BreadcrumbEntities,
} from '@/components/layout/actions/getBreadcrumbEntities.action'
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

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
  'files',
  'batches',
  'parity',
  'suppression-rules',
])

const SEGMENT_LABELS: Record<string, string> = {
  files: 'History',
  'ai-usage': 'AI Usage',
  'suppression-rules': 'Suppression Rules',
}

type ParsedSegment = {
  label: string
  href: string
  dynamicKey?: 'projectId' | 'sessionId' | undefined
}

function capitalize(s: string): string {
  if (SEGMENT_LABELS[s]) return SEGMENT_LABELS[s]
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
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
  const secondToLast = segments[segments.length - 2]!
  const last = segments[segments.length - 1]!
  return [first, { ellipsis: true as const }, secondToLast, last]
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

  useEffect(() => {
    if (!hasDynamic) return

    let cancelled = false

    getBreadcrumbEntities({ projectId, sessionId })
      .then((result) => {
        if (!cancelled && result.success) setEntities(result.data)
      })
      .catch(() => {
        /* non-critical — breadcrumb falls back to raw IDs */
      })

    return () => {
      cancelled = true
    }
  }, [hasDynamic, projectId, sessionId])

  const resolved = resolveSegments(rawSegments, entities)
  const displayItems = truncateSegments(resolved)

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {displayItems.map((item, index) => {
          if ('ellipsis' in item) {
            return (
              <Fragment key="ellipsis">
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbEllipsis />
                </BreadcrumbItem>
              </Fragment>
            )
          }

          const isLast = index === displayItems.length - 1

          return (
            <Fragment key={item.href}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="font-semibold text-text-primary">
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild className="text-text-secondary hover:text-text-primary">
                    <Link href={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
