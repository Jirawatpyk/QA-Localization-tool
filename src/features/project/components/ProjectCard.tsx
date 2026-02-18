'use client'

import { FileText, Settings } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AppRole } from '@/lib/auth/getCurrentUser'

import type { ProjectWithFileCount } from './ProjectList'

type ProjectCardProps = {
  project: ProjectWithFileCount
  userRole: AppRole
}

function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function ProjectCard({ project, userRole }: ProjectCardProps) {
  const isAdmin = userRole === 'admin'
  const targetDisplay = project.targetLangs.map((t) => t.toUpperCase()).join(', ')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{project.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
            {project.sourceLang.toUpperCase()} → {targetDisplay}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>{formatRelativeDate(project.createdAt)}</span>
          <span className="flex items-center gap-1">
            <FileText size={12} aria-hidden />
            {project.fileCount} {project.fileCount === 1 ? 'file' : 'files'}
          </span>
        </div>

        {isAdmin && (
          <div className="pt-1">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${project.id}/settings`}>
                <Settings size={14} className="mr-1.5" aria-hidden />
                Settings
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
