import { vi } from 'vitest'

export const mockXMLParser = {
  parse: vi.fn().mockReturnValue({}),
}

vi.mock('fast-xml-parser', () => ({
  XMLParser: vi.fn(() => mockXMLParser),
}))
