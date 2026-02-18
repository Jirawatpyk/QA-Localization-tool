'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { updateLanguagePairConfig } from '@/features/project/actions/updateLanguagePairConfig.action'

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

type LanguagePairConfigTableProps = {
  configs: LanguagePairConfig[]
  projectId: string
  projectSourceLang: string
  projectTargetLangs: string[]
}

type RowState = {
  autoPassThreshold: number
  l2ConfidenceMin: number
  l3ConfidenceMin: number
  wordSegmenter: string
}

const CJK_THAI_CODES = ['th', 'ja', 'ko', 'zh', 'zh-Hant']

function getDefaultRow(): RowState {
  return {
    autoPassThreshold: 95,
    l2ConfidenceMin: 70,
    l3ConfidenceMin: 70,
    wordSegmenter: 'intl',
  }
}

export function LanguagePairConfigTable({
  configs,
  projectId,
  projectSourceLang,
  projectTargetLangs,
}: LanguagePairConfigTableProps) {
  const configMap = new Map(configs.map((c) => [`${c.sourceLang}:${c.targetLang}`, c]))

  const rows = projectTargetLangs.map((targetLang) => {
    const existing = configMap.get(`${projectSourceLang}:${targetLang}`)
    return { targetLang, existing }
  })

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Language Pair</TableHead>
          <TableHead>Auto-Pass</TableHead>
          <TableHead>L2 Min Confidence</TableHead>
          <TableHead>L3 Min Confidence</TableHead>
          <TableHead>Word Segmenter</TableHead>
          <TableHead className="w-20" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ targetLang, existing }) => (
          <ConfigRow
            key={targetLang}
            projectId={projectId}
            sourceLang={projectSourceLang}
            targetLang={targetLang}
            existing={existing}
          />
        ))}
      </TableBody>
    </Table>
  )
}

type ConfigRowProps = {
  projectId: string
  sourceLang: string
  targetLang: string
  existing: LanguagePairConfig | undefined
}

function ConfigRow({ projectId, sourceLang, targetLang, existing }: ConfigRowProps) {
  const [isPending, startTransition] = useTransition()
  const defaults = getDefaultRow()
  const [state, setState] = useState<RowState>({
    autoPassThreshold: existing?.autoPassThreshold ?? defaults.autoPassThreshold,
    l2ConfidenceMin: existing?.l2ConfidenceMin ?? defaults.l2ConfidenceMin,
    l3ConfidenceMin: existing?.l3ConfidenceMin ?? defaults.l3ConfidenceMin,
    wordSegmenter: existing?.wordSegmenter ?? defaults.wordSegmenter,
  })

  const isCjkThai = CJK_THAI_CODES.includes(targetLang)

  function handleSave() {
    startTransition(async () => {
      const result = await updateLanguagePairConfig({
        projectId,
        sourceLang,
        targetLang,
        ...state,
      })
      if (result.success) {
        toast.success(`Config saved for ${sourceLang.toUpperCase()} → ${targetLang.toUpperCase()}`)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {sourceLang.toUpperCase()} → {targetLang.toUpperCase()}
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={100}
          value={state.autoPassThreshold}
          onChange={(e) => setState((s) => ({ ...s, autoPassThreshold: Number(e.target.value) }))}
          className="w-20"
          aria-label={`Auto-pass threshold for ${sourceLang} to ${targetLang}`}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={100}
          value={state.l2ConfidenceMin}
          onChange={(e) => setState((s) => ({ ...s, l2ConfidenceMin: Number(e.target.value) }))}
          className="w-20"
          aria-label={`L2 confidence minimum for ${sourceLang} to ${targetLang}`}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={100}
          value={state.l3ConfidenceMin}
          onChange={(e) => setState((s) => ({ ...s, l3ConfidenceMin: Number(e.target.value) }))}
          className="w-20"
          aria-label={`L3 confidence minimum for ${sourceLang} to ${targetLang}`}
        />
      </TableCell>
      <TableCell>
        <Select
          value={state.wordSegmenter}
          onValueChange={(v) => setState((s) => ({ ...s, wordSegmenter: v }))}
        >
          <SelectTrigger
            className="w-24"
            aria-label={`Word segmenter for ${sourceLang} to ${targetLang}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="intl">intl</SelectItem>
            <SelectItem value="space">space</SelectItem>
          </SelectContent>
        </Select>
        {isCjkThai && state.wordSegmenter === 'space' && (
          <p className="mt-1 text-xs text-destructive">
            CJK/Thai languages require &quot;intl&quot; segmenter
          </p>
        )}
      </TableCell>
      <TableCell>
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? '...' : 'Save'}
        </Button>
      </TableCell>
    </TableRow>
  )
}
