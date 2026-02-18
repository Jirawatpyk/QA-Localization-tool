import { createServerClient as _createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

import { logger } from '@/lib/logger'

// Proxy (replaces deprecated middleware convention in Next.js 16)
// Runtime: Node.js (NOT Edge — proxy runs on Node.js by default)
// Flow: 1. Rate limit (Upstash) -> 2. Read session -> 3. Verify JWT
//       -> 4. Extract tenant_id -> 5. Pass through

const PUBLIC_ROUTES = ['/login', '/signup', '/callback']
const AUTH_ROUTES = ['/login', '/signup', '/callback']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static assets
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/fonts/') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
  ) {
    return NextResponse.next()
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Server actions use Next-Action header — always pass through (they handle auth internally)
  const isServerAction = request.headers.has('Next-Action')
  if (isServerAction) {
    return response
  }

  // Rate limiting for auth form submissions only (POST), not page loads (GET)
  if (request.method === 'POST' && AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
    try {
      const { authLimiter } = await import('@/lib/ratelimit')
      // Extract first (client) IP from x-forwarded-for (format: "client, proxy1, proxy2")
      // Assumes deployment behind a trusted reverse proxy that sets these headers
      const xff = request.headers.get('x-forwarded-for')
      const ip = xff?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? '127.0.0.1'
      const { success } = await authLimiter.limit(ip)
      if (!success) {
        logger.warn({ pathname, ip }, 'Rate limit exceeded for auth endpoint')
        const rateLimitUrl = new URL('/login', request.url)
        rateLimitUrl.searchParams.set('error', 'rate_limit')
        return NextResponse.redirect(rateLimitUrl)
      }
    } catch {
      // Redis unavailable — fail-open in dev, fail-closed in prod
      if (process.env.NODE_ENV === 'production') {
        logger.error('Rate limiting unavailable — blocking auth request (fail-closed)')
        return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
      }
      logger.warn('Rate limiting unavailable — allowing request (fail-open, dev mode)')
    }
  }

  // Create Supabase server client with cookie handling
  // NOTE: process.env used directly — proxy runs before app init; env.ts Proxy may not be ready.
  const supabase = _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Validate JWT via getClaims — local validation, no network call (~1ms)
  const { data: claimsData, error } = await supabase.auth.getClaims()

  const isPublicRoute = PUBLIC_ROUTES.some((r) => pathname.startsWith(r))

  if (error || !claimsData) {
    // Not authenticated
    if (!isPublicRoute) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return response
  }

  // Authenticated user trying to access auth pages — redirect to dashboard
  if (isPublicRoute && pathname !== '/callback') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Extract tenant_id from JWT claims for downstream use
  const claims = claimsData.claims as Record<string, unknown>
  const tenantId = claims.tenant_id as string | undefined
  if (tenantId) {
    response.headers.set('x-tenant-id', tenantId)
  }

  const userId = claims.sub as string | undefined
  logger.debug({ pathname, userId, tenantId }, 'Proxy: authenticated request')

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/).*)'],
}
