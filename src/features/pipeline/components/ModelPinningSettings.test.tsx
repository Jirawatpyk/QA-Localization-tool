import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock server action ──
const mockUpdateModelPinning = vi.fn<
  (
    ..._args: unknown[]
  ) => Promise<{ success: true } | { success: false; code: string; error: string }>
>(async () => ({ success: true }))

vi.mock('../actions/updateModelPinning.action', () => ({
  updateModelPinning: (...args: unknown[]) => mockUpdateModelPinning(...args),
}))

// ── Mock toast ──
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// ── Test constants ──

const VALID_PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

type _ModelPinningSettingsProps = {
  projectId: string
  l2PinnedModel: string | null
  l3PinnedModel: string | null
  isAdmin: boolean
}

// Lazy import after mocks are set up
// import { ModelPinningSettings } from './ModelPinningSettings'

describe('ModelPinningSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P0: Core rendering ──

  it('should render L2 model select dropdown for admin role', async () => {
    const { ModelPinningSettings } = await import('./ModelPinningSettings')
    render(
      <ModelPinningSettings
        projectId={VALID_PROJECT_ID}
        l2PinnedModel={null}
        l3PinnedModel={null}
        isAdmin={true}
      />,
    )

    // Admin sees select trigger (interactive dropdown)
    expect(screen.getByTestId('model-select-l2')).toBeTruthy()
    expect(screen.getByLabelText(/L2 screening model/i)).toBeTruthy()
    // RED: ModelPinningSettings.tsx not yet created
  })

  it('should render L3 model select dropdown for admin role', async () => {
    const { ModelPinningSettings } = await import('./ModelPinningSettings')
    render(
      <ModelPinningSettings
        projectId={VALID_PROJECT_ID}
        l2PinnedModel={null}
        l3PinnedModel={null}
        isAdmin={true}
      />,
    )

    expect(screen.getByTestId('model-select-l3')).toBeTruthy()
    // RED: L3 dropdown not yet created
  })

  it('should show display-only text (not select) for non-admin role', async () => {
    const { ModelPinningSettings } = await import('./ModelPinningSettings')
    render(
      <ModelPinningSettings
        projectId={VALID_PROJECT_ID}
        l2PinnedModel="gpt-4o-mini-2024-07-18"
        l3PinnedModel="claude-sonnet-4-5-20250929"
        isAdmin={false}
      />,
    )

    // Non-admin sees text display with "(pinned)" badge
    expect(screen.getByTestId('model-display-l2')).toBeTruthy()
    expect(screen.queryByTestId('model-select-l2')).toBeNull()
    expect(screen.getByText(/gpt-4o-mini-2024-07-18/)).toBeTruthy()
    // RED: RBAC rendering not yet implemented
  })

  it('should call updateModelPinning action when model selection changes', async () => {
    const user = userEvent.setup()
    const { ModelPinningSettings } = await import('./ModelPinningSettings')
    render(
      <ModelPinningSettings
        projectId={VALID_PROJECT_ID}
        l2PinnedModel={null}
        l3PinnedModel={null}
        isAdmin={true}
      />,
    )

    // Open L2 dropdown and select a model
    await user.click(screen.getByTestId('model-select-l2'))
    await user.click(screen.getByRole('option', { name: 'gpt-4o-mini-2024-07-18' }))

    await waitFor(() => {
      expect(mockUpdateModelPinning).toHaveBeenCalledWith({
        projectId: VALID_PROJECT_ID,
        layer: 'L2',
        model: 'gpt-4o-mini-2024-07-18',
      })
    })
    // RED: model selection change handler not yet wired
  })

  // ── P1: Display options ──

  it("should show 'System Default' as first option in both dropdowns", async () => {
    const user = userEvent.setup()
    const { ModelPinningSettings } = await import('./ModelPinningSettings')
    render(
      <ModelPinningSettings
        projectId={VALID_PROJECT_ID}
        l2PinnedModel={null}
        l3PinnedModel={null}
        isAdmin={true}
      />,
    )

    await user.click(screen.getByTestId('model-select-l2'))

    // First option should be "System Default"
    const options = screen.getAllByRole('option')
    expect(options[0]?.textContent).toContain('System Default')
    // RED: dropdown options not yet defined
  })

  it('should display current pinned model as selected option', async () => {
    const { ModelPinningSettings } = await import('./ModelPinningSettings')
    render(
      <ModelPinningSettings
        projectId={VALID_PROJECT_ID}
        l2PinnedModel="gpt-4o-mini-2024-07-18"
        l3PinnedModel={null}
        isAdmin={true}
      />,
    )

    // L2 trigger should show current pinned model
    const l2Trigger = screen.getByTestId('model-select-l2')
    expect(l2Trigger.textContent).toContain('gpt-4o-mini-2024-07-18')
    // RED: current value not yet displayed in trigger
  })
})
