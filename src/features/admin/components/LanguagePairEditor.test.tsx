/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// ResizeObserver polyfill for jsdom — cmdk requires it.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
  if (typeof Element.prototype.scrollIntoView === 'undefined') {
    Element.prototype.scrollIntoView = function () {}
  }
})

// ── Mock the server action import chain ──
const mockUpdateUserLanguages = vi.fn()
vi.mock('@/features/admin/actions/updateUserLanguages.action', () => ({
  updateUserLanguages: (input: unknown) => mockUpdateUserLanguages(input),
}))

// ── Mock sonner so we can assert toast calls ──
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (msg: string) => mockToastSuccess(msg),
    error: (msg: string) => mockToastError(msg),
  },
}))

import { LanguagePairEditor } from './LanguagePairEditor'

const USER_ID = '550e8400-e29b-41d4-a716-446655440001'

describe('LanguagePairEditor', () => {
  beforeEach(() => {
    // R3-P3: `vi.clearAllMocks` only resets call history — implementations
    // persist across tests. One test uses `mockReturnValue(new Promise(()=>{}))`
    // to hold the action pending, and without `resetAllMocks` that hanging
    // promise would leak into any subsequent test that doesn't explicitly
    // re-mock. Use `resetAllMocks` to wipe implementations too, then re-seed
    // the default success response below.
    vi.resetAllMocks()
    mockUpdateUserLanguages.mockResolvedValue({
      success: true,
      data: { userId: USER_ID, nativeLanguages: [] },
    })
  })

  describe('popover mode — display', () => {
    it('renders "None assigned" when currentLanguages is empty', () => {
      render(
        <LanguagePairEditor
          userId={USER_ID}
          displayName="Alice"
          currentLanguages={[]}
          availableLanguages={['th', 'ja', 'en']}
        />,
      )
      expect(screen.getByTestId('language-pair-empty-label')).toHaveTextContent('None assigned')
    })

    it('renders badges for each currentLanguage', () => {
      render(
        <LanguagePairEditor
          userId={USER_ID}
          displayName="Alice"
          currentLanguages={['th', 'ja']}
          availableLanguages={['th', 'ja', 'en']}
        />,
      )
      const badges = screen.getAllByTestId('language-pair-badge')
      expect(badges).toHaveLength(2)
      expect(badges[0]!).toHaveTextContent('th')
      expect(badges[1]!).toHaveTextContent('ja')
    })

    it('uses displayName in trigger aria-label (R1-P7)', () => {
      render(
        <LanguagePairEditor
          userId={USER_ID}
          displayName="Alice Example"
          currentLanguages={[]}
          availableLanguages={['th']}
        />,
      )
      const trigger = screen.getByTestId(`language-pair-trigger-${USER_ID}`)
      expect(trigger).toHaveAttribute('aria-label', 'Edit language pairs for Alice Example')
    })

    it('falls back to "user" in aria-label when displayName omitted', () => {
      render(
        <LanguagePairEditor userId={USER_ID} currentLanguages={[]} availableLanguages={['th']} />,
      )
      const trigger = screen.getByTestId(`language-pair-trigger-${USER_ID}`)
      expect(trigger).toHaveAttribute('aria-label', 'Edit language pairs for user')
    })
  })

  describe('toggle — optimistic update', () => {
    it('calls onUpdate optimistically BEFORE the server action resolves', async () => {
      const user = userEvent.setup()
      const onUpdate = vi.fn()
      // Leave the action promise pending so we can observe the optimistic call
      let resolveAction!: (value: unknown) => void
      mockUpdateUserLanguages.mockReturnValue(
        new Promise((res) => {
          resolveAction = res
        }),
      )

      render(
        <LanguagePairEditor
          userId={USER_ID}
          displayName="Alice"
          currentLanguages={[]}
          availableLanguages={['th', 'ja']}
          mode="inline"
          onUpdate={onUpdate}
        />,
      )

      await user.click(screen.getByTestId('language-option-th'))

      // Optimistic onUpdate fires before the server resolves
      expect(onUpdate).toHaveBeenCalledWith(['th'])

      // Resolve and flush
      resolveAction({ success: true, data: { userId: USER_ID, nativeLanguages: ['th'] } })
    })

    it('toggles OFF an already-selected language (removes from array)', async () => {
      const user = userEvent.setup()
      const onUpdate = vi.fn()

      render(
        <LanguagePairEditor
          userId={USER_ID}
          displayName="Alice"
          currentLanguages={['th', 'ja']}
          availableLanguages={['th', 'ja']}
          mode="inline"
          onUpdate={onUpdate}
        />,
      )

      await user.click(screen.getByTestId('language-option-th'))

      expect(onUpdate).toHaveBeenCalledWith(['ja'])
    })

    it('shows success toast on successful save', async () => {
      const user = userEvent.setup()

      render(
        <LanguagePairEditor
          userId={USER_ID}
          displayName="Alice"
          currentLanguages={[]}
          availableLanguages={['th']}
          mode="inline"
        />,
      )

      await user.click(screen.getByTestId('language-option-th'))

      expect(mockToastSuccess).toHaveBeenCalledWith('Language pairs updated')
      expect(mockToastError).not.toHaveBeenCalled()
    })
  })

  describe('toggle — error revert (R1-P3)', () => {
    it('reverts optimistic update and shows error toast on server failure', async () => {
      const user = userEvent.setup()
      const onUpdate = vi.fn()

      mockUpdateUserLanguages.mockResolvedValue({
        success: false,
        code: 'INTERNAL_ERROR',
        error: 'Database unavailable',
      })

      render(
        <LanguagePairEditor
          userId={USER_ID}
          displayName="Alice"
          currentLanguages={['th']}
          availableLanguages={['th', 'ja']}
          mode="inline"
          onUpdate={onUpdate}
        />,
      )

      await user.click(screen.getByTestId('language-option-ja'))

      // First call: optimistic add
      expect(onUpdate).toHaveBeenNthCalledWith(1, ['th', 'ja'])
      // Second call: revert to the exact pre-click snapshot
      expect(onUpdate).toHaveBeenNthCalledWith(2, ['th'])
      expect(mockToastError).toHaveBeenCalledWith('Database unavailable')
    })

    it('surfaces CONFLICT errors from the server and calls onSettled in finally (R2-P6)', async () => {
      const user = userEvent.setup()
      const onUpdate = vi.fn()
      const onSettled = vi.fn()

      mockUpdateUserLanguages.mockResolvedValue({
        success: false,
        code: 'CONFLICT',
        error:
          "Another admin updated this user's languages while you were editing. Refresh and try again.",
      })

      render(
        <LanguagePairEditor
          userId={USER_ID}
          displayName="Alice"
          currentLanguages={['th']}
          availableLanguages={['th', 'ja']}
          mode="inline"
          onUpdate={onUpdate}
          onSettled={onSettled}
        />,
      )

      await user.click(screen.getByTestId('language-option-ja'))

      expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('Another admin updated'))
      expect(onSettled).toHaveBeenCalledTimes(1)
    })
  })

  describe('snapshot baseline (R2-P2)', () => {
    it('sends serverLanguages (not optimistic currentLanguages) as previousLanguages', async () => {
      const user = userEvent.setup()

      render(
        <LanguagePairEditor
          userId={USER_ID}
          displayName="Alice"
          // Simulates R2-P2: parent is mid-optimistic-update, so display value
          // differs from server-confirmed baseline.
          currentLanguages={['th', 'ja']}
          serverLanguages={['th']}
          availableLanguages={['th', 'ja', 'ko']}
          mode="inline"
        />,
      )

      await user.click(screen.getByTestId('language-option-ko'))

      expect(mockUpdateUserLanguages).toHaveBeenCalledWith({
        userId: USER_ID,
        nativeLanguages: ['th', 'ja', 'ko'],
        // Critical: baseline is the server-truth `serverLanguages`, NOT the
        // optimistic `currentLanguages`. Without this, rapid double-click
        // would send a stale optimistic state as the lock snapshot.
        previousLanguages: ['th'],
      })
    })

    it('falls back to currentLanguages when serverLanguages is omitted', async () => {
      const user = userEvent.setup()

      render(
        <LanguagePairEditor
          userId={USER_ID}
          displayName="Alice"
          currentLanguages={['th']}
          availableLanguages={['th', 'ja']}
          mode="inline"
        />,
      )

      await user.click(screen.getByTestId('language-option-ja'))

      expect(mockUpdateUserLanguages).toHaveBeenCalledWith(
        expect.objectContaining({ previousLanguages: ['th'] }),
      )
    })
  })

  describe('empty available languages', () => {
    it('shows empty-tenant guidance when availableLanguages is empty (R1-D4)', () => {
      render(
        <LanguagePairEditor
          userId={USER_ID}
          displayName="Alice"
          currentLanguages={[]}
          availableLanguages={[]}
          mode="inline"
        />,
      )
      expect(screen.getByText(/No language pairs configured/i)).toBeInTheDocument()
    })
  })
})
