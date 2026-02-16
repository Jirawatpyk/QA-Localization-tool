import { NextResponse } from 'next/server'

type HealthCheck = {
  name: string
  status: 'healthy' | 'degraded' | 'unavailable'
  latencyMs?: number
}

type HealthResponse = {
  status: 'healthy' | 'degraded'
  checks: {
    db: HealthCheck
    auth: HealthCheck
    queue: HealthCheck
  }
  timestamp: string
}

async function checkDatabase(): Promise<HealthCheck> {
  // Placeholder: will check Supabase DB connection in Story 1.2
  return { name: 'database', status: 'healthy', latencyMs: 0 }
}

async function checkAuth(): Promise<HealthCheck> {
  // Placeholder: will check Supabase Auth service in Story 1.2
  return { name: 'auth', status: 'healthy', latencyMs: 0 }
}

async function checkQueue(): Promise<HealthCheck> {
  // Placeholder: will check Inngest connectivity in Epic 2
  return { name: 'queue', status: 'healthy', latencyMs: 0 }
}

export async function GET() {
  const [db, auth, queue] = await Promise.all([
    checkDatabase(),
    checkAuth(),
    checkQueue(),
  ])

  const checks = { db, auth, queue }
  const allHealthy = Object.values(checks).every((c) => c.status === 'healthy')

  const response: HealthResponse = {
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(response, {
    status: allHealthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
