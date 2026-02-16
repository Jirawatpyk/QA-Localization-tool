import { vi } from 'vitest'

export const mockAIResponse = {
  text: 'Mock AI response',
  usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
}

export const mockGenerateText = vi.fn().mockResolvedValue(mockAIResponse)

vi.mock('ai', () => ({
  generateText: mockGenerateText,
}))
