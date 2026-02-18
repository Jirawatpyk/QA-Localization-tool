'use client'

import { useSearchParams } from 'next/navigation'
import { type ChangeEvent, type FormEvent, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { GoogleLogo } from '@/components/icons/GoogleLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrowserClient } from '@/lib/supabase/client'

const ERROR_MESSAGES: Record<string, string> = {
  rate_limit: 'Too many requests. Please wait a moment and try again.',
  auth_callback_failed: 'Authentication failed. Please try again.',
}

export function LoginForm() {
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Read redirect destination from query param (set by proxy.ts when redirecting unauthenticated users)
  const redirectTo = searchParams.get('redirect') ?? '/dashboard'
  // Validate: must start with / and not // (prevent open redirect)
  const safeRedirect =
    redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/dashboard'

  // Show toast for error query params (e.g., rate_limit, auth_callback_failed)
  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam && ERROR_MESSAGES[errorParam]) {
      toast.error(ERROR_MESSAGES[errorParam])
    }
  }, [searchParams])

  function handleEmailLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const supabase = createBrowserClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        toast.error(error.message)
        return
      }

      // Full page reload to pick up fresh JWT claims from custom_access_token_hook
      window.location.href = safeRedirect
    })
  }

  function handleGoogleLogin() {
    startTransition(async () => {
      const supabase = createBrowserClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/callback` },
      })

      if (error) {
        toast.error(error.message)
      }
    })
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleEmailLogin} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background text-muted-foreground px-2">Or continue with</span>
        </div>
      </div>

      <Button variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={isPending}>
        <GoogleLogo className="size-4" />
        Continue with Google
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        Don&apos;t have an account?{' '}
        <a href="/signup" className="text-primary underline-offset-4 hover:underline">
          Sign up
        </a>
      </p>
    </div>
  )
}
