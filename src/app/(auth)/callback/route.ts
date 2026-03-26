import { type NextRequest, NextResponse } from 'next/server'

import { setupNewUser } from '@/features/admin/actions/setupNewUser.action'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Validate redirect target to prevent open redirect attacks
  // Reject: protocol-relative (//), backslash (/\), fragment (#), non-path chars
  const rawNext = searchParams.get('next') ?? '/dashboard'
  const isSafePath =
    /^\/[a-zA-Z0-9\-._~:/?[\]@!$&'()*+,;=%]+$/.test(rawNext) &&
    !rawNext.startsWith('//') &&
    !rawNext.includes('\\') &&
    !rawNext.includes('#')
  const next = isSafePath ? rawNext : '/dashboard'

  if (code) {
    const supabase = await createServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Ensure first-time OAuth users get tenant + admin role (AC2)
      await setupNewUser()
      // Refresh session to get updated JWT claims (tenant_id + role from hook)
      await supabase.auth.refreshSession()
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Auth code exchange failed — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
