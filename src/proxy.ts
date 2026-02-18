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

  // Rate limiting for auth endpoints
  if (AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
    try {
      const { authLimiter } = await import('@/lib/ratelimit')
      const ip =
        request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '127.0.0.1'
      const { success } = await authLimiter.limit(ip)
      if (!success) {
        logger.warn({ pathname, ip }, 'Rate limit exceeded for auth endpoint')
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
      }
    } catch {
      // Redis unavailable — fail-closed for auth endpoints (brute-force protection)
      logger.warn('Rate limiting unavailable — blocking auth request (fail-closed)')
      return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
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
