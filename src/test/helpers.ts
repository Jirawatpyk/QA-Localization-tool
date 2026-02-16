// Test helpers for common test utilities
export function createMockResponse<T>(data: T) {
  return { success: true as const, data }
}

export function createMockError(error: string, code: string) {
  return { success: false as const, error, code }
}
