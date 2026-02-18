'use client'

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
import type { AppRole } from '@/lib/auth/getCurrentUser'

type UserRow = {
  id: string
  email: string
  displayName: string
  createdAt: Date
  role: string | null
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  qa_reviewer: 'QA Reviewer',
  native_reviewer: 'Native Reviewer',
}

export function UserManagement({ users }: { users: UserRow[] }) {
  const [isPending, startTransition] = useTransition()
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<AppRole>('qa_reviewer')

  function handleAddUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const result = await createUser({ email: newEmail, displayName: newName, role: newRole })
      if (result.success) {
        toast.success(`User ${newEmail} created`)
        setShowAddForm(false)
        setNewEmail('')
        setNewName('')
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
              <th className="px-4 py-3 text-left font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
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
                <td className="px-4 py-3 text-text-muted">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
