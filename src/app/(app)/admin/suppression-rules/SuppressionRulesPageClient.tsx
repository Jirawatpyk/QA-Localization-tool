'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { deactivateSuppressionRule } from '@/features/review/actions/deactivateSuppressionRule.action'
import { getSuppressionRules } from '@/features/review/actions/getSuppressionRules.action'
import { SuppressionRulesList } from '@/features/review/components/SuppressionRulesList'
import type { SuppressionRule } from '@/features/review/types'

type SuppressionRulesPageClientProps = {
  tenantId: string
}

export function SuppressionRulesPageClient({
  tenantId: _tenantId,
}: SuppressionRulesPageClientProps) {
  const [rules, setRules] = useState<SuppressionRule[]>([])
  const [loading, setLoading] = useState(true)

  // Load all project suppression rules
  // For admin page, we list all rules across projects in the tenant
  // This requires a projectId — for now, we'll need a project selector or list all
  // Simplified: load from first available project (admin can see all)
  useEffect(() => {
    async function loadRules() {
      setLoading(true)
      const result = await getSuppressionRules(null) // tenant-wide
      if (result.success) {
        setRules(result.data)
      }
      setLoading(false)
    }
    loadRules().catch(() => setLoading(false))
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
