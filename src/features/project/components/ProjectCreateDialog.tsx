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
import { canonicalizeBcp47, displayBcp47 } from '@/lib/language/bcp47'

// G1: canonicalize `COMMON_LANGUAGES` entries once at module load so the
// `value` passed to Radix Select matches the canonical form held in local
// state. Without this, `COMMON_LANGUAGES.code = 'zh-Hant'` would render as
// `SelectItem value='zh-Hant'` but state (after `onValueChange` canonicalize)
// would be `'zh-hant'` — Radix fails to find the matching item and silently
// displays the placeholder instead of the user's selection.
const COMMON_LANGUAGES_CANONICAL: { code: string; label: string }[] = COMMON_LANGUAGES.map(
  (lang) => ({
    code: canonicalizeBcp47(lang.code),
    label: lang.label,
  }),
)

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

  // Guardrail #11: reset form state on dialog re-open via key-based remount
  const [formResetKey, setFormResetKey] = useState(0)

  function toggleTargetLang(code: string) {
    // RC-5: canonicalize at the entry point so `targetLangs` state is always
    // in the same form as the canonical display values below. Without this,
    // state from URL params or form defaults could hold mixed-case tags that
    // break the `.includes()` checkbox check.
    const canonical = canonicalizeBcp47(code)
    setTargetLangs((prev) =>
      prev.includes(canonical) ? prev.filter((c) => c !== canonical) : [...prev, canonical],
    )
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    // processingMode intentionally omitted — new projects default to 'economy' (schema default)
    // User changes processing mode in Project Settings after creation
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

  // G1: both sides are canonical — `sourceLang` via `onValueChange`, and
  // `COMMON_LANGUAGES_CANONICAL.code` via module-load transform. Simple
  // equality is safe here.
  const availableTargetLangs = COMMON_LANGUAGES_CANONICAL.filter((lang) => lang.code !== sourceLang)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setFormResetKey((k) => k + 1)
          setSourceLang('')
          setTargetLangs([])
          setErrors({})
        }
        // I3: Reset form state on cancel/close (Guardrail #11)
        if (!next) {
          setSourceLang('')
          setTargetLangs([])
          setErrors({})
        }
        onOpenChange(next)
      }}
    >
      <DialogContent key={formResetKey} aria-label="Create new project">
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
            <Select
              value={sourceLang}
              // RC-5: canonicalize on input so state matches canonical form.
              onValueChange={(value) => setSourceLang(canonicalizeBcp47(value))}
            >
              <SelectTrigger id="source-lang" className="w-full">
                <SelectValue placeholder="Select source language" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_LANGUAGES_CANONICAL.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {/* TD2: display canonical-cased form in the parenthetical. */}
                    {lang.label} ({displayBcp47(lang.code)})
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
                    // G1: `lang.code` is now canonical (from
                    // `COMMON_LANGUAGES_CANONICAL`) and `targetLangs` state is
                    // canonical (via `toggleTargetLang`). Plain `.includes()`
                    // is safe.
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
