import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// Mock server action for threshold editing tests (Story 3.2b6)
type MockUpdateResult = { success: true } | { success: false; code: string; error: string }

const mockUpdateBudgetAlertThreshold = vi.fn<(..._args: unknown[]) => Promise<MockUpdateResult>>(
  async () => ({ success: true }),
)

vi.mock('@/features/pipeline/actions/updateBudgetAlertThreshold.action', () => ({
  updateBudgetAlertThreshold: (...args: unknown[]) => mockUpdateBudgetAlertThreshold(...args),
}))

// ── Test data helpers ──

const TEST_PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

describe('AiBudgetCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P0: Core rendering ──

  it('should render green progress bar when usage is below alert threshold', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={50} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const progressBar = screen.getByTestId('ai-budget-progress')
    // 50% usage — below 80% threshold → green (ok)
    expect(progressBar.getAttribute('aria-valuenow')).toBe('50')
    expect(progressBar.getAttribute('data-status')).toBe('ok')
  })

  it('should render yellow progress bar when usage equals alert threshold (80%)', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={80} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const progressBar = screen.getByTestId('ai-budget-progress')
    // 80% — at threshold → yellow (warning)
    expect(progressBar.getAttribute('aria-valuenow')).toBe('80')
    expect(progressBar.getAttribute('data-status')).toBe('warning')
  })

  it('should render red progress bar when usage is at or above 100%', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={100} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const progressBar = screen.getByTestId('ai-budget-progress')
    // 100% — exceeded → red
    expect(progressBar.getAttribute('aria-valuenow')).toBe('100')
    expect(progressBar.getAttribute('data-status')).toBe('exceeded')
  })

  it("should display spend text: '$X.XX / $Y.YY used'", async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={12.4} monthlyBudgetUsd={50} budgetAlertThresholdPct={80} />)

    const spendText = screen.getByTestId('ai-budget-spend')
    expect(spendText.textContent).toContain('12.40')
    expect(spendText.textContent).toContain('50.00')
  })

  it("should show 'No budget limit set' text when budget is null (unlimited)", async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={25} monthlyBudgetUsd={null} budgetAlertThresholdPct={80} />)

    expect(screen.getByTestId('ai-budget-unlimited')).toBeTruthy()
    expect(screen.getByText(/No budget limit set/i)).toBeTruthy()
    // Progress bar should NOT be shown when unlimited
    expect(screen.queryByTestId('ai-budget-progress')).toBeNull()
  })

  // ── P1: Additional states ──

  it("should show 'Budget exceeded — AI processing paused' when over 100%", async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={101} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const statusBadge = screen.getByTestId('ai-budget-status')
    expect(statusBadge.textContent).toContain('Budget exceeded')
  })

  // ── P1-BV: Boundary value tests (Epic 2 retro A2 mandate) ──

  it('should render green at 79% usage (below 80% threshold)', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={79} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const progressBar = screen.getByTestId('ai-budget-progress')
    // 79% — below threshold → ok (green)
    expect(progressBar.getAttribute('data-status')).toBe('ok')
  })

  it('should render yellow at exactly 80% usage (at threshold)', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={80} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const progressBar = screen.getByTestId('ai-budget-progress')
    // 80% — exactly at threshold → warning (yellow)
    expect(progressBar.getAttribute('data-status')).toBe('warning')
  })

  // ── TA Gap T: 0% usage ──
  it('[P2] should render green progress bar at 0% usage', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={0} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const progressBar = screen.getByTestId('ai-budget-progress')
    expect(progressBar.getAttribute('aria-valuenow')).toBe('0')
    expect(progressBar.getAttribute('data-status')).toBe('ok')
  })

  describe('Threshold Editing (Story 3.2b6)', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    // T1.1 — P0: Admin sees threshold input
    it('[P0] should render threshold input when canEditThreshold is true', async () => {
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      expect(input).toBeTruthy()
      expect((input as HTMLInputElement).value).toBe('80')
    })

    // T1.2 — P0: Non-Admin sees read-only text
    it('[P0] should render read-only threshold text when canEditThreshold is false', async () => {
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={false}
        />,
      )

      expect(screen.getByText(/Alert at 80%/i)).toBeTruthy()
      expect(screen.queryByRole('spinbutton')).toBeNull()
    })

    // T1.3 — P0: Blur triggers save
    it('[P0] should call updateBudgetAlertThreshold with projectId and thresholdPct on blur', async () => {
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.clear(input)
      await user.type(input, '75')
      await user.tab() // triggers blur

      await waitFor(() => {
        expect(mockUpdateBudgetAlertThreshold).toHaveBeenCalledWith({
          projectId: TEST_PROJECT_ID,
          thresholdPct: 75,
        })
      })
    })

    // T1.4 — P1: Enter key triggers save
    it('[P1] should call updateBudgetAlertThreshold when Enter key is pressed', async () => {
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.clear(input)
      await user.type(input, '90')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(mockUpdateBudgetAlertThreshold).toHaveBeenCalledWith({
          projectId: TEST_PROJECT_ID,
          thresholdPct: 90,
        })
      })
    })

    // T1.5 — P0: Success toast
    it('[P0] should show toast.success on successful save', async () => {
      mockUpdateBudgetAlertThreshold.mockResolvedValue({ success: true })
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.clear(input)
      await user.type(input, '75')
      await user.tab()

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Threshold updated')
      })
    })

    // T1.6 — P0: Error toast + revert
    it('[P0] should show toast.error and revert input on action failure', async () => {
      mockUpdateBudgetAlertThreshold.mockResolvedValue({
        success: false,
        code: 'FORBIDDEN',
        error: 'Insufficient permissions',
      })
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.clear(input)
      await user.type(input, '60')
      await user.tab()

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Insufficient permissions')
      })
      // Input must revert to original value (80), not rejected value (60)
      expect((input as HTMLInputElement).value).toBe('80')
    })

    // T1.7 — P1-BV: Reject 0 (below min)
    it('[P1-BV] should NOT call action when threshold is 0 (below min boundary)', async () => {
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.clear(input)
      await user.type(input, '0')
      await user.tab()

      expect(mockUpdateBudgetAlertThreshold).not.toHaveBeenCalled()
    })

    // T1.8 — P1-BV: Accept 1 (at min)
    it('[P1-BV] should call action when threshold is 1 (at min boundary)', async () => {
      mockUpdateBudgetAlertThreshold.mockResolvedValue({ success: true })
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.clear(input)
      await user.type(input, '1')
      await user.tab()

      await waitFor(() => {
        expect(mockUpdateBudgetAlertThreshold).toHaveBeenCalledWith({
          projectId: TEST_PROJECT_ID,
          thresholdPct: 1,
        })
      })
    })

    // T1.9 — P1-BV: Accept 100 (at max)
    it('[P1-BV] should call action when threshold is 100 (at max boundary)', async () => {
      mockUpdateBudgetAlertThreshold.mockResolvedValue({ success: true })
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.clear(input)
      await user.type(input, '100')
      await user.tab()

      await waitFor(() => {
        expect(mockUpdateBudgetAlertThreshold).toHaveBeenCalledWith({
          projectId: TEST_PROJECT_ID,
          thresholdPct: 100,
        })
      })
    })

    // T1.10 — P1-BV: Reject 101 (above max)
    it('[P1-BV] should NOT call action when threshold is 101 (above max boundary)', async () => {
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.clear(input)
      await user.type(input, '101')
      await user.tab()

      expect(mockUpdateBudgetAlertThreshold).not.toHaveBeenCalled()
    })

    // T1.11 — P1-BV: Reject non-integer (50.5)
    it('[P1-BV] should NOT call action when threshold is non-integer (50.5)', async () => {
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.clear(input)
      await user.type(input, '50.5')
      await user.tab()

      expect(mockUpdateBudgetAlertThreshold).not.toHaveBeenCalled()
    })

    // T1.12a — P1: Invalid input reverts to saved value on blur
    it('[P1] should revert input to saved value when invalid threshold is entered and blurred', async () => {
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.clear(input)
      // Don't type anything — leave empty (NaN scenario)
      await user.tab()

      expect(mockUpdateBudgetAlertThreshold).not.toHaveBeenCalled()
      // Should revert to saved value (80), not stay empty
      expect((input as HTMLInputElement).value).toBe('80')
    })

    // T1.12b — P1: Prop change syncs internal state
    it('[P1] should sync threshold state when budgetAlertThresholdPct prop changes', async () => {
      const { AiBudgetCard } = await import('./AiBudgetCard')
      const { rerender } = render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      expect((input as HTMLInputElement).value).toBe('80')

      // Parent re-renders with updated threshold (e.g., from server re-fetch)
      rerender(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={65}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      expect((input as HTMLInputElement).value).toBe('65')
    })

    // CR R1 M2a — isPending disabled state
    it('[P1] should disable threshold input while save is in progress', async () => {
      let resolveAction!: (v: MockUpdateResult) => void
      mockUpdateBudgetAlertThreshold.mockImplementation(
        () =>
          new Promise<MockUpdateResult>((resolve) => {
            resolveAction = resolve
          }),
      )
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.clear(input)
      await user.type(input, '75')
      await user.tab()

      await waitFor(() => expect(input).toBeDisabled())
      resolveAction({ success: true })
      await waitFor(() => expect(input).not.toBeDisabled())
    })

    // CR R1 M2b — same-value no-op guard
    it('[P1] should NOT call action when threshold is blurred without changing value', async () => {
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.click(input)
      await user.tab()

      expect(mockUpdateBudgetAlertThreshold).not.toHaveBeenCalled()
    })

    // CR R1 M2c — T1.5 marker position assertion
    it('[P0] should update progress bar status after successful threshold save', async () => {
      mockUpdateBudgetAlertThreshold.mockResolvedValue({ success: true })
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      // Initially: 25% usage (50/200), threshold 80 → status = 'ok'
      const progressBar = screen.getByTestId('ai-budget-progress')
      expect(progressBar.getAttribute('data-status')).toBe('ok')

      // Change threshold to 20 → 25% usage ≥ 20% threshold → status should become 'warning'
      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.clear(input)
      await user.type(input, '20')
      await user.tab()

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Threshold updated')
      })
      expect(progressBar.getAttribute('data-status')).toBe('warning')
    })

    // CR R1 M1 — try-catch covers unexpected throw
    it('[P1] should show toast.error and revert when action throws unexpected error', async () => {
      mockUpdateBudgetAlertThreshold.mockRejectedValue(new Error('Network failure'))
      const user = userEvent.setup()
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={50}
          monthlyBudgetUsd={200}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
      await user.clear(input)
      await user.type(input, '60')
      await user.tab()

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to update threshold')
      })
      expect((input as HTMLInputElement).value).toBe('80')
    })

    // T1.12 — P1: Unlimited budget hides threshold input
    it('[P1] should NOT render threshold input when monthlyBudgetUsd is null (unlimited)', async () => {
      const { AiBudgetCard } = await import('./AiBudgetCard')
      render(
        <AiBudgetCard
          usedBudgetUsd={25}
          monthlyBudgetUsd={null}
          budgetAlertThresholdPct={80}
          projectId={TEST_PROJECT_ID}
          canEditThreshold={true}
        />,
      )

      expect(screen.queryByRole('spinbutton')).toBeNull()
      expect(screen.getByTestId('ai-budget-unlimited')).toBeTruthy()
    })
  })

  // ── TA Gap Tests (Story 3.2b6) ──

  // G1 — P1-BV: Zero budget division guard
  it('[P1-BV] should render 0% progress with no NaN when monthlyBudgetUsd is 0', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={10} monthlyBudgetUsd={0} budgetAlertThresholdPct={80} />)

    const progressBar = screen.getByTestId('ai-budget-progress')
    expect(progressBar.getAttribute('aria-valuenow')).toBe('0')
    expect(progressBar.getAttribute('data-status')).toBe('ok')

    const spendText = screen.getByTestId('ai-budget-spend')
    expect(spendText.textContent).toContain('$10.00')
    expect(spendText.textContent).toContain('$0.00')
    expect(spendText.textContent).toContain('used')
  })

  // G2 — P2-BV: Negative threshold rejected (defense-in-depth)
  // HTML type="number" min={1} strips `-` in jsdom, so fireEvent.change
  // is used to bypass the constraint and verify isValidThreshold guard
  it('[P2-BV] should NOT call action when threshold is negative (-5)', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(
      <AiBudgetCard
        usedBudgetUsd={50}
        monthlyBudgetUsd={200}
        budgetAlertThresholdPct={80}
        projectId={TEST_PROJECT_ID}
        canEditThreshold={true}
      />,
    )

    const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
    fireEvent.change(input, { target: { value: '-5' } })
    fireEvent.blur(input)

    expect(mockUpdateBudgetAlertThreshold).not.toHaveBeenCalled()
    // Component still renders without crash
    expect(screen.getByTestId('ai-budget-card')).toBeTruthy()
  })

  // G3 — P2: Enter + empty input reverts
  it('[P2] should NOT call action and should revert to saved value when Enter is pressed on empty input', async () => {
    const user = userEvent.setup()
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(
      <AiBudgetCard
        usedBudgetUsd={50}
        monthlyBudgetUsd={200}
        budgetAlertThresholdPct={80}
        projectId={TEST_PROJECT_ID}
        canEditThreshold={true}
      />,
    )

    const input = screen.getByRole('spinbutton', { name: /alert threshold/i })
    await user.clear(input)
    await user.keyboard('{Enter}')

    expect(mockUpdateBudgetAlertThreshold).not.toHaveBeenCalled()
    expect((input as HTMLInputElement).value).toBe('80')
  })

  // G7 — P3: Negative usedBudgetUsd renders without crash
  it('[P3] should render progress bar without crashing when usedBudgetUsd is negative', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={-5} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const progressBar = screen.getByTestId('ai-budget-progress')
    expect(progressBar.getAttribute('aria-valuenow')).toBe('0')
    expect(progressBar.getAttribute('data-status')).toBe('ok')
    expect(screen.getByTestId('ai-budget-card')).toBeTruthy()
  })
})
