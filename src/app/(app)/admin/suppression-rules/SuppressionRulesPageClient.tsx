'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { deactivateSuppressionRule } from '@/features/review/actions/deactivateSuppressionRule.action'
import { getSuppressionRules } from '@/features/review/actions/getSuppressionRules.action'
import { SuppressionRulesList } from '@/features/review/components/SuppressionRulesList'
import type { SuppressionRule } from '@/features/review/types'

export function SuppressionRulesPageClient() {
  const [rules, setRules] = useState<SuppressionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadRules() {
      setLoading(true)
      setError(null)
      const result = await getSuppressionRules(null) // tenant-wide
      if (result.success) {
        setRules(result.data)
      } else {
        setError(result.error) // R2-M5: show error UI
      }
      setLoading(false)
    }
    loadRules().catch(() => {
      setError('Failed to load suppression rules')
      setLoading(false)
    })
  }, [])

  const handleDeactivate = useCallback(async (ruleId: string) => {
    const result = await deactivateSuppressionRule(ruleId)
    if (result.success) {
      setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, isActive: false } : r)))
      toast.success('Suppression rule deactivated')
    } else {
      toast.error(`Failed to deactivate: ${result.error}`)
    }
  }, [])

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Loading suppression rules...
      </div>
    )
  }

  if (error) {
    return <div className="py-8 text-center text-sm text-destructive">{error}</div>
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Manage suppression rules for false positive patterns. Rules are created from the review page
        when recurring patterns are detected.
      </p>
      <SuppressionRulesList rules={rules} onDeactivate={handleDeactivate} />
    </div>
  )
}
