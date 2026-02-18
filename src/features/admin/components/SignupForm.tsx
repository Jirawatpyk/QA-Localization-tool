'use client'

import { useRouter } from 'next/navigation'
import { type ChangeEvent, type FormEvent, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { GoogleLogo } from '@/components/icons/GoogleLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setupNewUser } from '@/features/admin/actions/setupNewUser.action'
import { createBrowserClient } from '@/lib/supabase/client'

export function SignupForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  function handleGoogleSignup() {
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

  function handleSignup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const supabase = createBrowserClient()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      })

      if (error) {
        toast.error(error.message)
        return
      }

      if (data.user) {
        const result = await setupNewUser()
        if (!result.success) {
          toast.error(result.error)
          return
        }

        toast.success('Account created! Redirecting...')
        router.push('/dashboard')
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSignup} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="displayName">Display Name</Label>
        <Input
          id="displayName"
          type="text"
          placeholder="Your Name"
          value={displayName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
          required
        />
      </div>
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
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Creating account...' : 'Create account'}
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card text-muted-foreground px-2">Or continue with</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleGoogleSignup}
        disabled={isPending}
      >
        <GoogleLogo className="size-4" />
        Continue with Google
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{' '}
        <a href="/login" className="text-primary underline-offset-4 hover:underline">
          Sign in
        </a>
      </p>
    </form>
  )
}
