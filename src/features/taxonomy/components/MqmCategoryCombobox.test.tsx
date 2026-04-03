/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { MqmCategoryCombobox } from './MqmCategoryCombobox'

const SUGGESTIONS = ['Accuracy', 'Fluency', 'Style', 'Terminology']

// cmdk uses ResizeObserver + scrollIntoView internally — polyfill for jsdom
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Element.prototype.scrollIntoView = vi.fn()
})

// NOTE: Radix Popover requires real DOM positioning (Floating UI) which jsdom cannot
// provide. Open/close, suggestion selection, and type-to-filter behaviors are tested
// via E2E (taxonomy-admin.spec.ts) and manual Playwright MCP verification.
// These unit tests cover: rendering, props, aria attributes, and placeholder display.

describe('MqmCategoryCombobox', () => {
  let onValueChange: (val: string) => void

  beforeEach(() => {
    onValueChange = vi.fn<(val: string) => void>()
  })

  it('[P0] should render combobox trigger with current value', () => {
    render(
      <MqmCategoryCombobox
        value="Accuracy"
        onValueChange={onValueChange}
        suggestions={SUGGESTIONS}
      />,
    )

    const trigger = screen.getByRole('combobox')
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent('Accuracy')
  })

  it('[P0] should render placeholder when value is empty', () => {
    render(
      <MqmCategoryCombobox
        value=""
        onValueChange={onValueChange}
        suggestions={SUGGESTIONS}
        placeholder="Select category"
      />,
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('Select category')
  })

  it('[P0] should use default placeholder when none provided', () => {
    render(<MqmCategoryCombobox value="" onValueChange={onValueChange} suggestions={SUGGESTIONS} />)

    expect(screen.getByRole('combobox')).toHaveTextContent('Select or type...')
  })

  it('[P1] should have correct aria-label', () => {
    render(
      <MqmCategoryCombobox
        value=""
        onValueChange={onValueChange}
        suggestions={SUGGESTIONS}
        aria-label="MQM parent category"
      />,
    )

    expect(screen.getByRole('combobox', { name: 'MQM parent category' })).toBeInTheDocument()
  })

  it('[P1] should use default aria-label when none provided', () => {
    render(<MqmCategoryCombobox value="" onValueChange={onValueChange} suggestions={SUGGESTIONS} />)

    expect(screen.getByRole('combobox', { name: 'MQM category' })).toBeInTheDocument()
  })

  it('[P1] should have aria-expanded attribute', () => {
    render(<MqmCategoryCombobox value="" onValueChange={onValueChange} suggestions={SUGGESTIONS} />)

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  })

  it('[P2] should render with custom className', () => {
    render(
      <MqmCategoryCombobox
        value="Test"
        onValueChange={onValueChange}
        suggestions={SUGGESTIONS}
        className="custom-class"
      />,
    )

    expect(screen.getByRole('combobox').className).toContain('custom-class')
  })
})
