'use client'

import Link from 'next/link'
import { type FormEvent, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { updateProject } from '@/features/project/actions/updateProject.action'

import { LanguagePairConfigTable } from './LanguagePairConfigTable'

type Project = {
  id: string
  name: string
  description: string | null
  sourceLang: string
  targetLangs: string[]
  processingMode: string
  status: string
  autoPassThreshold: number
}

type LanguagePairConfig = {
  id: string
  tenantId: string
  sourceLang: string
  targetLang: string
  autoPassThreshold: number
  l2ConfidenceMin: number
  l3ConfidenceMin: number
  mutedCategories: string[] | null
  wordSegmenter: string
  createdAt: Date
  updatedAt: Date
}

type ProjectSettingsProps = {
  project: Project
  languagePairConfigs: LanguagePairConfig[]
}

export function ProjectSettings({ project, languagePairConfigs }: ProjectSettingsProps) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [processingMode, setProcessingMode] = useState(project.processingMode)
  const [autoPassThreshold, setAutoPassThreshold] = useState(project.autoPassThreshold)

  function handleGeneralSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    startTransition(async () => {
      const result = await updateProject(project.id, {
        name,
        description: description || null,
        processingMode,
        autoPassThreshold,
      })
      if (result.success) {
        toast.success('Project settings saved')
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <PageHeader
        title={`${project.name} — Settings`}
        breadcrumb={
          <Link href="/projects" className="hover:underline">
            Projects
          </Link>
        }
      />

      <div className="space-y-8 p-4">
        <section>
          <h3 className="mb-4 text-base font-semibold text-text-primary">General Settings</h3>
          <form onSubmit={handleGeneralSave} className="max-w-lg space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-name">Project Name</Label>
              <Input
                id="settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={255}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-description">Description</Label>
              <Textarea
                id="settings-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Processing Mode</Label>
              <RadioGroup value={processingMode} onValueChange={setProcessingMode}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="economy" id="settings-economy" />
                  <Label htmlFor="settings-economy" className="font-normal">
                    Economy (L1 + L2)
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="thorough" id="settings-thorough" />
                  <Label htmlFor="settings-thorough" className="font-normal">
                    Thorough (L1 + L2 + L3)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-threshold">Auto-Pass Threshold</Label>
              <Input
                id="settings-threshold"
                type="number"
                min={0}
                max={100}
                value={autoPassThreshold}
                onChange={(e) => setAutoPassThreshold(Number(e.target.value))}
                aria-label="Auto-pass threshold percentage"
              />
              <p className="text-xs text-text-muted">
                Files scoring above this threshold auto-pass review
              </p>
            </div>

            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </form>
        </section>

        <Separator />

        <section>
          <h3 className="mb-2 text-base font-semibold text-text-primary">
            Language Pair Configuration
          </h3>
          <p className="mb-4 text-xs text-text-muted">
            Provisional thresholds — calibration recommended after beta testing
          </p>
          <LanguagePairConfigTable
            configs={languagePairConfigs}
            projectId={project.id}
            projectSourceLang={project.sourceLang}
            projectTargetLangs={project.targetLangs}
          />
        </section>
      </div>
    </>
  )
}
