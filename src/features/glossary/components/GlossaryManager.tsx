'use client'

import { useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import type { AppRole } from '@/lib/auth/getCurrentUser'

import { GlossaryImportDialog } from './GlossaryImportDialog'
import { GlossaryList } from './GlossaryList'

type GlossaryWithTermCount = {
  id: string
  name: string
  sourceLang: string
  targetLang: string
  createdAt: Date
  termCount: number
}

type GlossaryManagerProps = {
  project: {
    id: string
    name: string
    sourceLang: string
    targetLangs: string[]
  }
  glossaries: GlossaryWithTermCount[]
  userRole: AppRole
}

export function GlossaryManager({ project, glossaries, userRole }: GlossaryManagerProps) {
  const [importOpen, setImportOpen] = useState(false)
  const isAdmin = userRole === 'admin'

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Glossary"
        breadcrumb={<span>{project.name}</span>}
        actions={
          isAdmin ? <Button onClick={() => setImportOpen(true)}>Import Glossary</Button> : undefined
        }
      />

      {glossaries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-text-muted text-sm">No glossaries imported yet.</p>
          {isAdmin && (
            <Button variant="outline" className="mt-4" onClick={() => setImportOpen(true)}>
              Import your first glossary
            </Button>
          )}
        </div>
      ) : (
        <GlossaryList glossaries={glossaries} userRole={userRole} />
      )}

      {isAdmin && (
        <GlossaryImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          projectId={project.id}
        />
      )}
    </div>
  )
}
