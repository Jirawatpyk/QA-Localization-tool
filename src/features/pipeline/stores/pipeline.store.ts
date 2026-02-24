'use client'

import { create } from 'zustand'

type FileStatus =
  | 'processing'
  | 'l1_completed'
  | 'l2_completed'
  | 'l3_completed'
  | 'completed'
  | 'failed'

type FileProcessingState = {
  status: FileStatus
  findingCount?: number
  mqmScore?: number
}

type PipelineState = {
  processingFiles: Map<string, FileProcessingState>
  startedAt: number | undefined
  completedAt: number | undefined
  startProcessing: (fileIds: string[]) => void
  updateFileStatus: (fileId: string, status: FileStatus) => void
  setFileResult: (fileId: string, result: { findingCount: number; mqmScore: number }) => void
  resetState: () => void
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  processingFiles: new Map(),
  startedAt: undefined,
  completedAt: undefined,

  startProcessing: (fileIds: string[]) => {
    const newMap = new Map<string, FileProcessingState>()
    for (const fileId of fileIds) {
      newMap.set(fileId, { status: 'processing' })
    }
    set({ processingFiles: newMap, startedAt: Date.now(), completedAt: undefined })
  },

  updateFileStatus: (fileId: string, status: FileStatus) => {
    const { processingFiles } = get()
    const existing = processingFiles.get(fileId)
    if (!existing) return

    const newMap = new Map(processingFiles)
    newMap.set(fileId, { ...existing, status })

    // Mark completedAt when all files reach a terminal state
    const allCompleted = [...newMap.values()].every(
      (f) => f.status === 'completed' || f.status === 'failed',
    )
    set({
      processingFiles: newMap,
      ...(allCompleted ? { completedAt: Date.now() } : {}),
    })
  },

  setFileResult: (fileId: string, result: { findingCount: number; mqmScore: number }) => {
    const { processingFiles } = get()
    const existing = processingFiles.get(fileId)
    if (!existing) return

    const newMap = new Map(processingFiles)
    newMap.set(fileId, { ...existing, ...result })
    set({ processingFiles: newMap })
  },

  resetState: () => {
    set({ processingFiles: new Map(), startedAt: undefined, completedAt: undefined })
  },
}))
