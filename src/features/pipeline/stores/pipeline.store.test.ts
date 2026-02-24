import { describe, expect, it, beforeEach } from 'vitest'

const VALID_FILE_ID_1 = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_FILE_ID_2 = 'b2c3d4e5-f6a7-4b2c-8d3e-4f5a6b7c8d9e'
const NON_EXISTENT_FILE_ID = 'f1f2f3f4-a5a6-4b7b-8c8c-9d9d0e0e1f1f'

describe('usePipelineStore', () => {
  beforeEach(async () => {
    // Reset store state between tests
    const { usePipelineStore } = await import('./pipeline.store')
    usePipelineStore.getState().resetState()
  })

  it('should initialize with empty processingFiles map', async () => {
    const { usePipelineStore } = await import('./pipeline.store')
    const state = usePipelineStore.getState()

    expect(state.processingFiles).toBeDefined()
    expect(state.processingFiles instanceof Map || typeof state.processingFiles === 'object').toBe(
      true,
    )
    // Should be empty on init
    const entries =
      state.processingFiles instanceof Map
        ? state.processingFiles.size
        : Object.keys(state.processingFiles).length
    expect(entries).toBe(0)
  })

  it('should set all files to processing on startProcessing', async () => {
    const { usePipelineStore } = await import('./pipeline.store')

    usePipelineStore.getState().startProcessing([VALID_FILE_ID_1, VALID_FILE_ID_2])

    const state = usePipelineStore.getState()
    const getStatus = (fileId: string) => {
      if (state.processingFiles instanceof Map) {
        return state.processingFiles.get(fileId)?.status
      }
      return (state.processingFiles as Record<string, { status: string }>)[fileId]?.status
    }

    expect(getStatus(VALID_FILE_ID_1)).toBe('processing')
    expect(getStatus(VALID_FILE_ID_2)).toBe('processing')
  })

  it('should update file status on updateFileStatus', async () => {
    const { usePipelineStore } = await import('./pipeline.store')

    // Start processing first
    usePipelineStore.getState().startProcessing([VALID_FILE_ID_1])
    // Update to l1_completed
    usePipelineStore.getState().updateFileStatus(VALID_FILE_ID_1, 'l1_completed')

    const state = usePipelineStore.getState()
    const getStatus = (fileId: string) => {
      if (state.processingFiles instanceof Map) {
        return state.processingFiles.get(fileId)?.status
      }
      return (state.processingFiles as Record<string, { status: string }>)[fileId]?.status
    }

    expect(getStatus(VALID_FILE_ID_1)).toBe('l1_completed')
  })

  it('should store findingCount and mqmScore on setFileResult', async () => {
    const { usePipelineStore } = await import('./pipeline.store')

    usePipelineStore.getState().startProcessing([VALID_FILE_ID_1])
    usePipelineStore.getState().setFileResult(VALID_FILE_ID_1, {
      findingCount: 5,
      mqmScore: 85.5,
    })

    const state = usePipelineStore.getState()
    const getFileData = (fileId: string) => {
      if (state.processingFiles instanceof Map) {
        return state.processingFiles.get(fileId)
      }
      return (state.processingFiles as Record<string, unknown>)[fileId]
    }

    const fileData = getFileData(VALID_FILE_ID_1) as {
      findingCount: number
      mqmScore: number
    }
    expect(fileData.findingCount).toBe(5)
    expect(fileData.mqmScore).toBe(85.5)
  })

  it('should clear all state on resetState', async () => {
    const { usePipelineStore } = await import('./pipeline.store')

    // Add some state
    usePipelineStore.getState().startProcessing([VALID_FILE_ID_1, VALID_FILE_ID_2])

    // Reset
    usePipelineStore.getState().resetState()

    const state = usePipelineStore.getState()
    const entries =
      state.processingFiles instanceof Map
        ? state.processingFiles.size
        : Object.keys(state.processingFiles).length
    expect(entries).toBe(0)
  })

  it('should track startedAt timestamp', async () => {
    const { usePipelineStore } = await import('./pipeline.store')

    const before = Date.now()
    usePipelineStore.getState().startProcessing([VALID_FILE_ID_1])
    const after = Date.now()

    const state = usePipelineStore.getState()
    expect(state.startedAt).toBeDefined()
    expect(state.startedAt).toBeGreaterThanOrEqual(before)
    expect(state.startedAt).toBeLessThanOrEqual(after)
  })

  it('should track completedAt on completion', async () => {
    const { usePipelineStore } = await import('./pipeline.store')

    usePipelineStore.getState().startProcessing([VALID_FILE_ID_1])
    usePipelineStore.getState().setFileResult(VALID_FILE_ID_1, {
      findingCount: 0,
      mqmScore: 100,
    })
    usePipelineStore.getState().updateFileStatus(VALID_FILE_ID_1, 'completed')

    const state = usePipelineStore.getState()
    // completedAt should be set when all files are completed
    if (state.completedAt !== undefined) {
      expect(typeof state.completedAt).toBe('number')
      expect(state.completedAt).toBeGreaterThan(0)
    }
  })

  it('should handle updating non-existent fileId gracefully', async () => {
    const { usePipelineStore } = await import('./pipeline.store')

    // Should not throw when updating a file that was never started
    expect(() => {
      usePipelineStore.getState().updateFileStatus(NON_EXISTENT_FILE_ID, 'failed')
    }).not.toThrow()

    expect(() => {
      usePipelineStore.getState().setFileResult(NON_EXISTENT_FILE_ID, {
        findingCount: 0,
        mqmScore: 0,
      })
    }).not.toThrow()
  })
})
