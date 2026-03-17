/**
 * Story 4.6: SuppressPatternDialog Component
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { SuppressPatternDialog } from '@/features/review/components/SuppressPatternDialog'
import type { DetectedPattern } from '@/features/review/types'

const MOCK_PATTERN: DetectedPattern = {
  category: 'Terminology',
  keywords: ['bank', 'terminology', 'financial'],
  patternName: 'Terminology: bank, terminology, financial',
  matchingFindingIds: ['f1', 'f2', 'f3'],
  sourceLang: 'en-US',
  targetLang: 'th-TH',
}

const FILE_ID = 'f2000000-0000-4000-8000-000000000001'

describe('SuppressPatternDialog', () => {
  it('[P1] should render with default scope=language_pair and duration=until_improved', () => {
    render(
      <SuppressPatternDialog
        open={true}
        pattern={MOCK_PATTERN}
        fileId={FILE_ID}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('radio', { name: /this language pair/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /until.*improv/i })).toBeChecked()
  })

  it('[P1] should display language pair from pattern', () => {
    render(
      <SuppressPatternDialog
        open={true}
        pattern={MOCK_PATTERN}
        fileId={FILE_ID}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog')).toHaveTextContent('en-US')
    expect(screen.getByRole('dialog')).toHaveTextContent('th-TH')
  })

  it('[P1] should call onConfirm with selected config', async () => {
    const onConfirm = vi.fn()
    render(
      <SuppressPatternDialog
        open={true}
        pattern={MOCK_PATTERN}
        fileId={FILE_ID}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: /suppress/i }))
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'language_pair', duration: 'until_improved' }),
    )
  })

  it('[P1] should close on Escape', async () => {
    const onCancel = vi.fn()
    render(
      <SuppressPatternDialog
        open={true}
        pattern={MOCK_PATTERN}
        fileId={FILE_ID}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )
    await userEvent.setup().keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('[P2] should have aria-modal on dialog', () => {
    render(
      <SuppressPatternDialog
        open={true}
        pattern={MOCK_PATTERN}
        fileId={FILE_ID}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })
})
