'use client'

import { FolderPlus } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { AppRole } from '@/lib/auth/getCurrentUser'

import { ProjectCard } from './ProjectCard'
import { ProjectCreateDialog } from './ProjectCreateDialog'

export type ProjectWithFileCount = {
  id: string
  name: string
  description: string | null
  sourceLang: string
  targetLangs: string[]
  processingMode: string
  status: string
  autoPassThreshold: number
  createdAt: Date
  updatedAt: Date
  fileCount: number
}

type ProjectListProps = {
  projects: ProjectWithFileCount[]
  userRole: AppRole
}

export function ProjectList({ projects, userRole }: ProjectListProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const isAdmin = userRole === 'admin'

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={() => setDialogOpen(true)}>
            <FolderPlus size={16} className="mr-2" aria-hidden />
            Create Project
          </Button>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
          <FolderPlus size={40} className="mb-3 text-text-muted" aria-hidden />
          <p className="text-sm text-text-secondary">
            No projects yet.{' '}
            {isAdmin ? 'Create your first project.' : 'Contact your admin to create a project.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} userRole={userRole} />
          ))}
        </div>
      )}

      {isAdmin && <ProjectCreateDialog open={dialogOpen} onOpenChange={setDialogOpen} />}
    </div>
  )
}
