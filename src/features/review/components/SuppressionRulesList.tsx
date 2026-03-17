'use client'

import { Ban } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  SuppressionDuration,
  SuppressionRule,
  SuppressionScope,
} from '@/features/review/types'

type SuppressionRulesListProps = {
  rules: SuppressionRule[]
  onDeactivate: (ruleId: string) => void
}

const SCOPE_LABELS: Record<SuppressionScope, string> = {
  file: 'This file',
  language_pair: 'Language pair',
  all: 'All',
}

const DURATION_LABELS: Record<SuppressionDuration, string> = {
  session: 'Session only',
  permanent: 'Permanent',
  until_improved: 'Until improved',
}

export function SuppressionRulesList({ rules, onDeactivate }: SuppressionRulesListProps) {
  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <Ban className="text-muted-foreground h-8 w-8" aria-hidden="true" />
        <p className="text-muted-foreground text-sm">No active suppression rules</p>
      </div>
    )
  }

  return (
    <div>
      <table className="w-full text-sm" role="grid" aria-label="Suppression rules">
        <thead>
          <tr role="row" className="border-b">
            <th className="px-3 py-2 text-left font-medium">Pattern</th>
            <th className="px-3 py-2 text-left font-medium">Category</th>
            <th className="px-3 py-2 text-left font-medium">Scope</th>
            <th className="px-3 py-2 text-left font-medium">Duration</th>
            <th className="px-3 py-2 text-left font-medium">Created by</th>
            <th className="px-3 py-2 text-right font-medium">Matches</th>
            <th className="px-3 py-2 text-left font-medium">Created</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} role="row" className="border-b last:border-0">
              <td className="max-w-[200px] truncate px-3 py-2" title={rule.pattern}>
                {rule.pattern}
              </td>
              <td className="px-3 py-2">
                <Badge variant="secondary">{rule.category}</Badge>
              </td>
              <td className="px-3 py-2">
                {SCOPE_LABELS[rule.scope] ?? rule.scope}
                {rule.scope === 'language_pair' && rule.sourceLang && rule.targetLang && (
                  <span className="text-muted-foreground ml-1 text-xs">
                    ({rule.sourceLang} → {rule.targetLang})
                  </span>
                )}
              </td>
              <td className="px-3 py-2">{DURATION_LABELS[rule.duration] ?? rule.duration}</td>
              <td className="px-3 py-2">{rule.createdByName ?? rule.createdBy}</td>
              <td className="px-3 py-2 text-right">{rule.matchCount}</td>
              <td className="px-3 py-2 text-xs">{new Date(rule.createdAt).toLocaleDateString()}</td>
              <td className="px-3 py-2 text-right">
                {rule.isActive ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDeactivate(rule.id)}
                    aria-label={`Deactivate ${rule.category} suppression rule`}
                    className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Inactive
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
