'use client'

import Link from 'next/link'
import { type ChangeEvent, type FormEvent, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createUser } from '@/features/admin/actions/createUser.action'
import { updateUserRole } from '@/features/admin/actions/updateUserRole.action'
import { LanguagePairEditor } from '@/features/admin/components/LanguagePairEditor'
import type { AppRole } from '@/lib/auth/getCurrentUser'

type UserRow = {
  id: string
  email: string
  displayName: string
  createdAt: Date
  role: string | null
  nativeLanguages: string[] | null
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  qa_reviewer: 'QA Reviewer',
  native_reviewer: 'Native Reviewer',
}

const REVIEWER_ROLES = new Set<string>(['qa_reviewer', 'native_reviewer'])

export function UserManagement({
  users,
  availableLanguages,
}: {
  users: UserRow[]
  availableLanguages: string[]
}) {
  const [isPending, startTransition] = useTransition()
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<AppRole>('qa_reviewer')
  const [newLanguages, setNewLanguages] = useState<string[]>([])

  // Local optimistic overrides: only holds rows with in-flight save. Non-pending
  // rows read directly from the `users` prop (server is the source of truth).
  const [languagesByUser, setLanguagesByUser] = useState<Record<string, string[]>>({})
  // Pending set: rows whose optimistic value has not yet been confirmed by the server.
  // `revalidatePath` reconciliation MUST NOT wipe these — otherwise a sibling row's
  // in-flight toggle flickers/reverts while its own save is still resolving.
  const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(() => new Set())

  function handleAddUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const result = await createUser({
        email: newEmail,
        displayName: newName,
        role: newRole,
        nativeLanguages: newRole === 'admin' ? [] : newLanguages,
      })
      if (result.success) {
        toast.success(`User ${newEmail} created`)
        setShowAddForm(false)
        setNewEmail('')
        setNewName('')
        setNewLanguages([])
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleRoleChange(userId: string, role: string) {
    startTransition(async () => {
      const result = await updateUserRole({ userId, newRole: role })
      if (result.success) {
        toast.success('Role updated')
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleLanguagesUpdate(userId: string, next: string[]) {
    setLanguagesByUser((prev) => ({ ...prev, [userId]: next }))
    setPendingUserIds((prev) => {
      if (prev.has(userId)) return prev
      const nextSet = new Set(prev)
      nextSet.add(userId)
      return nextSet
    })
  }

  function handleLanguagesSettled(userId: string) {
    // Server action resolved — drop the optimistic override and let the server
    // prop (refreshed by revalidatePath) become authoritative on next render.
    setPendingUserIds((prev) => {
      if (!prev.has(userId)) return prev
      const nextSet = new Set(prev)
      nextSet.delete(userId)
      return nextSet
    })
    setLanguagesByUser((prev) => {
      if (!(userId in prev)) return prev
      const { [userId]: _drop, ...rest } = prev
      return rest
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Users</h2>
        <Button onClick={() => setShowAddForm(!showAddForm)} variant="outline" size="sm">
          {showAddForm ? 'Cancel' : 'Add User'}
        </Button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddUser}
          className="rounded-lg border border-border bg-card p-4 space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="newName">Name</Label>
              <Input
                id="newName"
                value={newName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newEmail">Email</Label>
              <Input
                id="newEmail"
                type="email"
                value={newEmail}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={(v: string) => setNewRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="qa_reviewer">QA Reviewer</SelectItem>
                  <SelectItem value="native_reviewer">Native Reviewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {newRole !== 'admin' && (
            <div className="space-y-2" data-testid="new-user-languages-section">
              <Label>Language Pairs</Label>
              <p className="text-text-muted text-xs">
                Optional — assign here or edit later from the user list.
              </p>
              <NewUserLanguageChips
                selected={newLanguages}
                available={availableLanguages}
                onChange={setNewLanguages}
              />
            </div>
          )}

          <Button type="submit" disabled={isPending}>
            {isPending ? 'Creating...' : 'Create User'}
          </Button>
        </form>
      )}

      <div className="rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Language Pairs</th>
              <th className="px-4 py-3 text-left font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              // Read from optimistic override only while a save is in-flight for this row.
              // Non-pending rows read directly from server props so sibling writes cannot
              // wipe or revert another row's live state (P4).
              const currentLanguages = pendingUserIds.has(user.id)
                ? (languagesByUser[user.id] ?? user.nativeLanguages ?? [])
                : (user.nativeLanguages ?? [])
              const isReviewer = REVIEWER_ROLES.has(user.role ?? 'qa_reviewer')
              return (
                <tr key={user.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{user.displayName}</td>
                  <td className="px-4 py-3 text-text-muted">{user.email}</td>
                  <td className="px-4 py-3">
                    <Select
                      value={user.role ?? 'qa_reviewer'}
                      onValueChange={(v: string) => handleRoleChange(user.id, v)}
                      disabled={isPending}
                    >
                      <SelectTrigger className="h-8 w-[160px]">
                        <SelectValue>{ROLE_LABELS[user.role ?? 'qa_reviewer']}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="qa_reviewer">QA Reviewer</SelectItem>
                        <SelectItem value="native_reviewer">Native Reviewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    {isReviewer ? (
                      <LanguagePairEditor
                        userId={user.id}
                        displayName={user.displayName}
                        currentLanguages={currentLanguages}
                        // R2-P2: server-truth baseline for optimistic lock.
                        // Always read from the raw prop so rapid double-clicks
                        // never snapshot an in-flight optimistic value.
                        serverLanguages={user.nativeLanguages ?? []}
                        availableLanguages={availableLanguages}
                        onUpdate={(next) => handleLanguagesUpdate(user.id, next)}
                        onSettled={() => handleLanguagesSettled(user.id)}
                      />
                    ) : (
                      <span
                        className="text-text-muted text-xs italic"
                        data-testid="language-pair-na"
                      >
                        N/A
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Lightweight local chip toggle for the Create User form.
 * Does NOT call the Server Action — selection is submitted with the createUser call.
 */
function NewUserLanguageChips({
  selected,
  available,
  onChange,
}: {
  selected: string[]
  available: string[]
  onChange: (next: string[]) => void
}) {
  if (available.length === 0) {
    return (
      <div className="space-y-1" data-testid="new-user-language-chips-empty">
        <p className="text-text-muted text-xs">No language pairs configured for this tenant yet.</p>
        <p className="text-text-muted text-xs">
          Configure language pairs in{' '}
          <Link
            href="/projects"
            className="text-primary underline hover:no-underline"
            data-testid="new-user-language-chips-configure-link"
          >
            Projects → Settings
          </Link>{' '}
          first, then assign them to reviewers here.
        </p>
      </div>
    )
  }

  function toggle(lang: string) {
    if (selected.includes(lang)) {
      onChange(selected.filter((l) => l !== lang))
    } else {
      onChange([...selected, lang])
    }
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="new-user-language-chips">
      {available.map((lang) => {
        const active = selected.includes(lang)
        return (
          <button
            key={lang}
            type="button"
            onClick={() => toggle(lang)}
            className={
              active
                ? 'rounded-full border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground'
                : 'rounded-full border border-border bg-background px-3 py-1 text-xs text-text-muted hover:bg-muted'
            }
            aria-pressed={active}
            data-testid={`new-user-language-chip-${lang}`}
          >
            {lang}
          </button>
        )
      })}
    </div>
  )
}
