import { vi } from 'vitest'

export const mockStep = {
  run: vi.fn((_id: string, fn: () => unknown) => fn()),
  sleep: vi.fn(),
  sleepUntil: vi.fn(),
  waitForEvent: vi.fn(),
  sendEvent: vi.fn(),
}

export const mockInngestClient = {
  send: vi.fn(),
  createFunction: vi.fn(),
}

vi.mock('@/lib/inngest/client', () => ({
  inngest: mockInngestClient,
}))
