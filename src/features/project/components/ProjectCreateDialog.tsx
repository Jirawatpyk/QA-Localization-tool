'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createProject } from '@/features/project/actions/createProject.action'
import { COMMON_LANGUAGES } from '@/features/project/validation/languages'
import { createProjectSchema } from '@/features/project/validation/projectSchemas'

type ProjectCreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProjectCreateDialog({ open, onOpenChange }: ProjectCreateDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [sourceLang, setSourceLang] = useState('')
  const [targetLangs, setTargetLangs] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  function toggleTargetLang(code: string) {
    setTargetLangs((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    )
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const input = {
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || undefined,
      sourceLang,
      targetLangs,
    }

    const parsed = createProjectSchema.safeParse(input)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (key !== undefined) {
          fieldErrors[String(key)] = issue.message
        }
      }
      setErrors(fieldErrors)
      return
    }

    setErrors({})

    startTransition(async () => {
      const result = await createProject(input)
      if (result.success) {
        toast.success('Project created')
        onOpenChange(false)
        setSourceLang('')
        setTargetLangs([])
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const availableTargetLangs = COMMON_LANGUAGES.filter((lang) => lang.code !== sourceLang)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label="Create new project">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>Set up a new localization QA project.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="project-name"
              name="name"
              placeholder="My Localization Project"
              maxLength={255}
              required
              aria-invalid={!!errors['name']}
              aria-describedby={errors['name'] ? 'project-name-error' : undefined}
            />
            {errors['name'] && (
              <p id="project-name-error" className="text-xs text-destructive">
                {errors['name']}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              name="description"
              placeholder="Optional project description"
              maxLength={1000}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="source-lang">
              Source Language <span className="text-destructive">*</span>
            </Label>
            <Select value={sourceLang} onValueChange={setSourceLang}>
              <SelectTrigger id="source-lang" className="w-full">
                <SelectValue placeholder="Select source language" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.label} ({lang.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors['sourceLang'] && (
              <p id="source-lang-error" className="text-xs text-destructive">
                {errors['sourceLang']}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Target Languages <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {availableTargetLangs.map((lang) => (
                <label key={lang.code} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={targetLangs.includes(lang.code)}
                    onCheckedChange={() => toggleTargetLang(lang.code)}
                  />
                  {lang.label}
                </label>
              ))}
            </div>
            {errors['targetLangs'] && (
              <p id="target-langs-error" className="text-xs text-destructive">
                {errors['targetLangs']}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
