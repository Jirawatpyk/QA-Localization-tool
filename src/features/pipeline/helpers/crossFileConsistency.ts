// Stub: Story 2.7 — cross-file consistency checker
// TODO: Implement in Story 2.7

type CrossFileConsistencyInput = {
  projectId: string
  tenantId: string
  batchId: string
  fileIds: string[]
}

type CrossFileConsistencyResult = {
  findingCount: number
}

export async function crossFileConsistency(
  _input: CrossFileConsistencyInput,
): Promise<CrossFileConsistencyResult> {
  return { findingCount: 0 }
}
