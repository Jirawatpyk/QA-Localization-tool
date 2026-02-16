import { type NextRequest, NextResponse } from 'next/server'

// Proxy (replaces deprecated middleware convention in Next.js 16)
// Runtime: Node.js (NOT Edge — proxy runs on Node.js by default)
// Flow: 1. Rate limit (Upstash) -> 2. Read session -> 3. Verify JWT
//       -> 4. Extract tenant_id -> 5. Pass through
// Full implementation in Story 1.2

export async function proxy(_request: NextRequest) {
  // Placeholder: pass through all requests
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/).*)'],
}
