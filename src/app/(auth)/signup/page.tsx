import { SignupForm } from '@/features/admin/components/SignupForm'

export const metadata = {
  title: 'Sign Up — QA Localization Tool',
}

export default function SignupPage() {
  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="text-muted-foreground text-sm">
          Sign up to start using the QA Localization Tool
        </p>
      </div>
      <SignupForm />
    </div>
  )
}
