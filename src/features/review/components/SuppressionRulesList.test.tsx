/**
 * Story 4.6: SuppressionRulesList Component
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { SuppressionRulesList } from '@/features/review/components/SuppressionRulesList'
import type { SuppressionRule } from '@/features/review/types'

function makeRule(overrides?: Partial<SuppressionRule>): SuppressionRule {
  return {
    id: crypto.randomUUID(),
    projectId: 'p1',
    tenantId: 't1',
    pattern: 'bank, terminology, financial',
    category: 'Terminology',
    scope: 'language_pair',
    duration: 'until_improved',
    reason: 'False positive pattern',
    fileId: null,
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    matchCount: 5,
    createdBy: 'user1',
    createdByName: 'Mona',
    isActive: true,
    createdAt: '2026-03-17T10:00:00Z',
    ...overrides,
  }
}

describe('SuppressionRulesList', () => {
  it('[P1] should render rules in data table', () => {
    render(
      <SuppressionRulesList
        rules={[makeRule({ category: 'Terminology' }), makeRule({ category: 'Accuracy' })]}
        onDeactivate={vi.fn()}
      />,
    )
    expect(screen.getByText('Terminology')).toBeInTheDocument()
    expect(screen.getByText('Accuracy')).toBeInTheDocument()
  })

  it('[P1] should call onDeactivate on button click', async () => {
    const onDeactivate = vi.fn()
    const rule = makeRule()
    render(<SuppressionRulesList rules={[rule]} onDeactivate={onDeactivate} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /deactivate/i }))
    expect(onDeactivate).toHaveBeenCalledWith(rule.id)
  })

  it('[P1] should show empty state when no rules', () => {
    render(<SuppressionRulesList rules={[]} onDeactivate={vi.fn()} />)
    expect(screen.getByText(/no.*suppression.*rule/i)).toBeInTheDocument()
  })

  it('[P2] should have role="table" on table element', () => {
    render(<SuppressionRulesList rules={[makeRule()]} onDeactivate={vi.fn()} />)
    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()
    expect(table.tagName).toBe('TABLE')
  })
})
