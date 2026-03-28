/**
 * ATDD Story 4.8 — Baseline Fix #1: AiSpendByProjectTable (TDD Green Phase)
 * Test: TA-04 (AC2, P0)
 *
 * Verifies that budget status indicator uses icon + text + sr-only label,
 * not color-only dot (WCAG SC 1.4.1 — Guardrail #25).
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'

import type { AiProjectSpend } from '@/features/dashboard/types'

import { AiSpendByProjectTable } from './AiSpendByProjectTable'

function buildProject(overrides?: Partial<AiProjectSpend>): AiProjectSpend {
  return {
    projectId: 'proj-1',
    projectName: 'Test Project',
    totalCostUsd: 50,
    filesProcessed: 10,
    monthlyBudgetUsd: 100,
    budgetAlertThresholdPct: 80,
    ...overrides,
  }
}

describe('AiSpendByProjectTable Accessibility', () => {
  describe('TA-04: Budget status not color-only (AC2 Critical #1, P0)', () => {
    it('should render sr-only status text alongside budget indicator', () => {
      const projects = [
        buildProject({ projectId: 'ok', totalCostUsd: 30 }),
        buildProject({ projectId: 'warn', totalCostUsd: 85 }),
        buildProject({ projectId: 'exceeded', totalCostUsd: 120 }),
      ]
      render(<AiSpendByProjectTable selectedDays={30} projects={projects} />)

      // Each indicator should have visible status text label (Guardrail #25/#36)
      const okIndicator = screen.getByTestId('ai-budget-indicator-ok')
      expect(within(okIndicator).getByText('OK')).toBeVisible()

      const warnIndicator = screen.getByTestId('ai-budget-indicator-warn')
      expect(within(warnIndicator).getByText('Warning')).toBeVisible()

      const exceededIndicator = screen.getByTestId('ai-budget-indicator-exceeded')
      expect(within(exceededIndicator).getByText('Exceeded')).toBeVisible()
    })

    it('should render status icon with distinct shape per status level', () => {
      const projects = [
        buildProject({ projectId: 'ok', totalCostUsd: 30 }),
        buildProject({ projectId: 'warn', totalCostUsd: 85 }),
        buildProject({ projectId: 'exceeded', totalCostUsd: 120 }),
      ]
      render(<AiSpendByProjectTable selectedDays={30} projects={projects} />)

      // Each indicator should contain an SVG icon (lucide renders as SVG)
      const okIndicator = screen.getByTestId('ai-budget-indicator-ok')
      expect(okIndicator.querySelector('svg')).toBeTruthy()

      const warnIndicator = screen.getByTestId('ai-budget-indicator-warn')
      expect(warnIndicator.querySelector('svg')).toBeTruthy()

      const exceededIndicator = screen.getByTestId('ai-budget-indicator-exceeded')
      expect(exceededIndicator.querySelector('svg')).toBeTruthy()

      // Icons should have aria-hidden (Guardrail #36)
      expect(okIndicator.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    })

    it('should support keyboard activation on sortable headers', async () => {
      const user = userEvent.setup()
      const projects = [
        buildProject({ projectId: 'a', totalCostUsd: 50 }),
        buildProject({ projectId: 'b', totalCostUsd: 30 }),
      ]
      render(<AiSpendByProjectTable selectedDays={30} projects={projects} />)

      const costHeader = screen.getByTestId('ai-project-sort-cost')
      expect(costHeader).toHaveAttribute('tabindex', '0')

      // Keyboard activation with Enter
      costHeader.focus()
      await user.keyboard('{Enter}')

      // Should toggle sort (ascending indicator appears)
      expect(costHeader).toHaveTextContent('↑')
    })
  })
})
