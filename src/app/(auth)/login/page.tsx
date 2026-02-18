import { LoginForm } from '@/features/admin/components/LoginForm'

export const metadata = {
  title: 'Sign In — QA Localization Tool',
}

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm">
          Enter your credentials to access the QA tool
        </p>
      </div>
      <LoginForm />
    </div>
  )
}
