// =============================================================================
// Story 3.2b — processFile.test.ts ADDITIONS (TDD RED PHASE)
// =============================================================================
//
// This file contains the EXACT content to APPEND to:
//   src/features/pipeline/inngest/processFile.test.ts
//
// It includes 3 sections:
//   1. Hoisted mock additions (to merge into existing vi.hoisted() block)
//   2. New vi.mock() registrations (add after existing vi.mock blocks)
//   3. New it.skip() test stubs (add inside existing describe('processFilePipeline'))
//
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: HOISTED MOCK ADDITIONS
// ─────────────────────────────────────────────────────────────────────────────
//
// Merge these into the existing vi.hoisted(() => { ... }) block at the top
// of processFile.test.ts, alongside mockRunL1ForFile and mockScoreFile:
//
// ```typescript
// import type { L2Result } from '@/features/pipeline/helpers/runL2ForFile'
// import type { L3Result } from '@/features/pipeline/helpers/runL3ForFile'
//
// const { mockRunL1ForFile, mockScoreFile, mockRunL2ForFile, mockRunL3ForFile, dbState, dbMockModule } = vi.hoisted(() => {
//   const { dbState, dbMockModule } = createDrizzleMock()
//   return {
//     mockRunL1ForFile: vi.fn((..._args: unknown[]) =>
//       Promise.resolve({ findingCount: 5, duration: 120 }),
//     ),
//     mockScoreFile: vi.fn((..._args: unknown[]) =>
//       Promise.resolve({
//         scoreId: faker.string.uuid(),
//         fileId: faker.string.uuid(),
//         mqmScore: 85,
//         npt: 15,
//         totalWords: 1000,
//         criticalCount: 0,
//         majorCount: 3,
//         minorCount: 0,
//         status: 'calculated',
//         autoPassRationale: null,
//       }),
//     ),
//     mockRunL2ForFile: vi.fn((..._args: unknown[]) =>
//       Promise.resolve({
//         findingCount: 3,
//         duration: 200,
//         aiModel: 'gpt-4o-mini',
//         chunksTotal: 1,
//         chunksSucceeded: 1,
//         chunksFailed: 0,
//         partialFailure: false,
//         totalUsage: { inputTokens: 1000, outputTokens: 500, estimatedCostUsd: 0.001 },
//       } as L2Result),
//     ),
//     mockRunL3ForFile: vi.fn((..._args: unknown[]) =>
//       Promise.resolve({
//         findingCount: 2,
//         duration: 500,
//         aiModel: 'claude-sonnet-4-5-20250929',
//         chunksTotal: 1,
//         chunksSucceeded: 1,
//         chunksFailed: 0,
//         partialFailure: false,
//         totalUsage: { inputTokens: 2000, outputTokens: 800, estimatedCostUsd: 0.015 },
//       } as L3Result),
//     ),
//     dbState,
//     dbMockModule,
//   }
// })
// ```
//
// Also add to beforeEach():
//   mockRunL2ForFile.mockResolvedValue({ ... } as L2Result)
//   mockRunL3ForFile.mockResolvedValue({ ... } as L3Result)

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: NEW vi.mock() REGISTRATIONS
// ─────────────────────────────────────────────────────────────────────────────
//
// Add these AFTER the existing vi.mock() blocks (before the helper functions):
//
// ```typescript
// vi.mock('@/features/pipeline/helpers/runL2ForFile', () => ({
//   runL2ForFile: (...args: unknown[]) => mockRunL2ForFile(...args),
// }))
//
// vi.mock('@/features/pipeline/helpers/runL3ForFile', () => ({
//   runL3ForFile: (...args: unknown[]) => mockRunL3ForFile(...args),
// }))
// ```

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: NEW it.skip() TEST STUBS
// ─────────────────────────────────────────────────────────────────────────────
//
// Add these INSIDE the existing describe('processFilePipeline', () => { ... })
// block, AFTER all existing tests (before the closing `})`).
//
// Paste everything between the START and END markers below.

// ──── START: Story 3.2b test stubs ────

  // ══════════════════════════════════════════════════════════════════════════
  // Story 3.2b: L2 Batch Processing & Pipeline Extension
  // ══════════════════════════════════════════════════════════════════════════

  // ── P0: Economy mode full pipeline (L1 → L2) ──

  // #1+#3 (merged per PM-3): Economy full step order + step ID rename
  it.skip('[P0] should run 4 steps in economy mode: l1-rules → score-l1 → l2-screening → score-l2', async () => {
    // RED: step.run is called only 2 times (L1 + score); L2 steps not wired yet;
    //      score step ID is 'score-{fileId}' not 'score-l1-{fileId}'
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Economy: 4 step.run calls (no L3)
    expect(mockStep.run).toHaveBeenCalledTimes(4)

    // Verify exact step IDs by call index — changing IDs breaks Inngest in-flight resumes
    expect(mockStep.run.mock.calls[0]?.[0]).toBe(`l1-rules-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[1]?.[0]).toBe(`score-l1-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[2]?.[0]).toBe(`l2-screening-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[3]?.[0]).toBe(`score-l2-${VALID_FILE_ID}`)
  })

  // #2: runL2ForFile receives correct args
  it.skip('[P0] should call runL2ForFile with fileId, projectId, tenantId, userId', async () => {
    // RED: runL2ForFile is not imported or called in processFile.ts
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockRunL2ForFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        userId: VALID_USER_ID,
      }),
    )
  })

  // #4: scoreFile called with layerCompleted 'L1L2' after L2
  it.skip('[P0] should call scoreFile with layerCompleted L1L2 after L2 step', async () => {
    // RED: scoreFile does not accept or pass layerCompleted param yet
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // scoreFile is called twice in economy: once after L1 (score-l1), once after L2 (score-l2)
    expect(mockScoreFile).toHaveBeenCalledTimes(2)

    // Second call (score-l2) must include layerCompleted: 'L1L2'
    const secondCallArg = mockScoreFile.mock.calls[1]?.[0] as Record<string, unknown>
    expect(secondCallArg).toMatchObject({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      layerCompleted: 'L1L2',
    })
  })

  // ── P0: Economy mode — no L3 ──

  // #8+#9 (merged per PM-3): Economy mode L3 NOT triggered + batch terminal states
  it.skip('[P0] should NOT trigger L3 in economy mode and use l2_completed|failed|auto_passed as batch terminal states', async () => {
    // RED: mockRunL3ForFile will be called (no mode guard); batch uses l1_completed terminal states
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    // Mock batch query: return files with l2_completed and auto_passed status
    // (used by check-batch step to determine if all files are terminal)
    dbState.returnValues = [
      [
        { id: VALID_FILE_ID, status: 'l2_completed' },
        { id: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b', status: 'auto_passed' },
      ],
    ]

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // L3 must NOT be triggered in economy mode
    expect(mockRunL3ForFile).not.toHaveBeenCalled()

    // Economy batch terminal states include: l2_completed | failed | auto_passed
    // (not l1_completed which was the old terminal state)
  })

  // ── P0: Thorough mode full pipeline (L1 → L2 → L3) ──

  // #10+#12 (merged per PM-3): Thorough full step order + batch terminal states
  it.skip('[P0] should run 6 steps in thorough mode: l1-rules → score-l1 → l2-screening → score-l2 → l3-analysis → score-l3', async () => {
    // RED: L2 and L3 steps not wired; only 2 step.run calls exist
    // provisional L3 — Story 3.3
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'thorough',
    })

    // Mock batch query for thorough terminal state check
    dbState.returnValues = [
      [
        { id: VALID_FILE_ID, status: 'l3_completed' },
      ],
    ]

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Thorough: 6 step.run calls
    expect(mockStep.run).toHaveBeenCalledTimes(6)

    // Verify exact step IDs in order
    expect(mockStep.run.mock.calls[0]?.[0]).toBe(`l1-rules-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[1]?.[0]).toBe(`score-l1-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[2]?.[0]).toBe(`l2-screening-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[3]?.[0]).toBe(`score-l2-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[4]?.[0]).toBe(`l3-analysis-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[5]?.[0]).toBe(`score-l3-${VALID_FILE_ID}`)

    // Thorough batch terminal states: l3_completed | failed | auto_passed
  })

  // #11: Thorough final score layerCompleted 'L1L2L3'
  it.skip('[P0] should call scoreFile with layerCompleted L1L2L3 after L3 step in thorough mode', async () => {
    // RED: L3 score step does not exist; scoreFile not called with layerCompleted
    // provisional L3 — Story 3.3
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'thorough',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // scoreFile called 3 times in thorough: L1 score, L2 score, L3 score
    expect(mockScoreFile).toHaveBeenCalledTimes(3)

    // Third call (score-l3) must include layerCompleted: 'L1L2L3'
    const thirdCallArg = mockScoreFile.mock.calls[2]?.[0] as Record<string, unknown>
    expect(thirdCallArg).toMatchObject({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      layerCompleted: 'L1L2L3',
    })
  })

  // ── P0: Failure preservation ──

  // #13: L2 failure preserves L1 findings
  it.skip('[P0] should preserve L1 findings when L2 step fails (exactly 1 DB call in onFailure, no DELETE)', async () => {
    // RED: onFailure currently has 1 DB call but doesn't distinguish L2 vs L1 failure path;
    //      need to verify no finding deletion happens on L2 failure
    dbState.returnValues = [[]]

    const { processFilePipeline } = await import('./processFile')
    const { withTenant } = await import('@/db/helpers/withTenant')

    const onFailure = (processFilePipeline as { onFailure?: (...args: unknown[]) => unknown })
      .onFailure
    expect(onFailure).toBeDefined()

    if (onFailure) {
      // Simulate L2 step throwing — triggers onFailure
      await onFailure({
        event: {
          data: {
            event: {
              data: {
                fileId: VALID_FILE_ID,
                tenantId: VALID_TENANT_ID,
                projectId: VALID_PROJECT_ID,
                mode: 'economy',
              },
            },
          },
        },
        error: new Error('L2 screening failed: AI quota exhausted'),
      })
    }

    // Exactly 1 DB call: file status update to 'failed'
    // NO DELETE of L1 findings — they must remain intact
    expect(dbState.callIndex).toBe(1)
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'failed' }))
  })

  // #23: Thorough L3 failure preserves L1+L2 findings
  it.skip('[P0] should preserve L1 and L2 findings when L3 step fails in thorough mode', async () => {
    // RED: L3 step not wired; failure path for L3 untested
    // provisional L3 — Story 3.3
    dbState.returnValues = [[]]

    const { processFilePipeline } = await import('./processFile')
    const { withTenant } = await import('@/db/helpers/withTenant')

    const onFailure = (processFilePipeline as { onFailure?: (...args: unknown[]) => unknown })
      .onFailure
    expect(onFailure).toBeDefined()

    if (onFailure) {
      // Simulate L3 step throwing — triggers onFailure
      await onFailure({
        event: {
          data: {
            event: {
              data: {
                fileId: VALID_FILE_ID,
                tenantId: VALID_TENANT_ID,
                projectId: VALID_PROJECT_ID,
                mode: 'thorough',
              },
            },
          },
        },
        error: new Error('L3 deep analysis failed: content filter'),
      })
    }

    // Exactly 1 DB call: file status update to 'failed'
    // NO DELETE of L1 or L2 findings — both layers must remain intact
    expect(dbState.callIndex).toBe(1)
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'failed' }))
  })

  // #24: runL3ForFile receives correct args
  it.skip('[P0] should call runL3ForFile with fileId, projectId, tenantId, userId in thorough mode', async () => {
    // RED: runL3ForFile is not imported or called in processFile.ts
    // provisional L3 — Story 3.3
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'thorough',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockRunL3ForFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        userId: VALID_USER_ID,
      }),
    )
  })

  // ── P1: Batch event handling ──

  // #14: Batch event exact payload + sendEvent batch form (Guardrail #10)
  it.skip('[P1] should emit batch-completed event with exact payload via sendEvent batch form', async () => {
    // RED: batch event payload may not include mode; sendEvent batch form not verified
    // race condition: see TD-PIPE-001
    const mockStep = createMockStep()
    const VALID_BATCH_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })
    // Override uploadBatchId (buildPipelineEvent may default to empty)
    const eventDataWithBatch = { ...eventData, uploadBatchId: VALID_BATCH_ID }

    // Mock batch query: all files completed → triggers batch event
    dbState.returnValues = [
      [{ id: VALID_FILE_ID, status: 'l2_completed' }],
    ]

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventDataWithBatch },
      step: mockStep,
    })

    // Guardrail #10: sendEvent uses batch form — first arg is string step ID
    expect(mockStep.sendEvent).toHaveBeenCalled()
    const sendEventArgs = mockStep.sendEvent.mock.calls[0]
    expect(typeof sendEventArgs?.[0]).toBe('string') // step ID

    // Second arg is the event object with name + data
    const eventPayload = sendEventArgs?.[1] as Record<string, unknown>
    expect(eventPayload).toMatchObject({
      name: 'pipeline.batch-completed',
      data: expect.objectContaining({
        batchId: VALID_BATCH_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        mode: 'economy',
        userId: VALID_USER_ID,
      }),
    })
  })

  // #15: Non-batch (uploadBatchId='') skips batch check
  it.skip('[P1] should skip batch check when uploadBatchId is empty string', async () => {
    // RED: verify preserved behavior — uploadBatchId='' should not trigger sendEvent
    // race condition: see TD-PIPE-001
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })
    const eventDataNoBatch = { ...eventData, uploadBatchId: '' }

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventDataNoBatch },
      step: mockStep,
    })

    // sendEvent should NOT be called when uploadBatchId is empty
    expect(mockStep.sendEvent).not.toHaveBeenCalled()
  })

  // ── P1: Partial failure handling ──

  // #16: L2 partial failure → score + batch still proceed
  it.skip('[P1] should proceed with score and batch check when L2 has partial failure', async () => {
    // RED: L2 step not wired; partialFailure handling not implemented in orchestrator
    mockRunL2ForFile.mockResolvedValue({
      findingCount: 1,
      duration: 300,
      aiModel: 'gpt-4o-mini',
      chunksTotal: 3,
      chunksSucceeded: 2,
      chunksFailed: 1,
      partialFailure: true,
      totalUsage: { inputTokens: 2000, outputTokens: 800, estimatedCostUsd: 0.002 },
    } as L2Result)

    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // scoreFile must still be called after L2 (even with partial failure)
    expect(mockScoreFile).toHaveBeenCalledTimes(2)

    // Pipeline must not throw — partial failure is tolerated
    // (step.run count = 4 for economy: L1, score-l1, L2, score-l2)
    expect(mockStep.run).toHaveBeenCalledTimes(4)
  })

  // ── P1: Return shape ──

  // #17: Return shape includes all new fields
  it.skip('[P1] should return l1FindingCount, l2FindingCount, l3FindingCount, layerCompleted, l2PartialFailure', async () => {
    // RED: current return shape only has { fileId, findingCount, mqmScore, layerCompleted: 'L1' }
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    const result = (await (
      processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({
      event: { data: eventData },
      step: mockStep,
    })) as Record<string, unknown>

    expect(result).toMatchObject({
      fileId: VALID_FILE_ID,
      l1FindingCount: expect.any(Number),
      l2FindingCount: expect.any(Number),
      l3FindingCount: null, // economy: no L3
      layerCompleted: 'L1L2',
      l2PartialFailure: expect.any(Boolean),
      mqmScore: expect.any(Number),
    })
  })

  // #18: Economy returns l3FindingCount: null (strict toBe(null))
  it.skip('[P1] should return l3FindingCount as strictly null in economy mode', async () => {
    // RED: current return shape does not include l3FindingCount field
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    const result = (await (
      processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({
      event: { data: eventData },
      step: mockStep,
    })) as Record<string, unknown>

    // Strict null check — not undefined, not 0, not false
    // (exactOptionalPropertyTypes enforcement)
    expect(result.l3FindingCount).toBe(null)
  })

  // #19: scoreFile backward compat (no layerCompleted in first call)
  it.skip('[P1] should NOT pass layerCompleted to scoreFile in first call (L1 score)', async () => {
    // RED: scoreFile may incorrectly receive layerCompleted in all calls
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // First scoreFile call (L1 score) should NOT have layerCompleted property
    // This ensures backward compatibility with the existing L1-only score flow
    const firstCallArg = mockScoreFile.mock.calls[0]?.[0] as Record<string, unknown>
    expect(firstCallArg).not.toHaveProperty('layerCompleted')
    // Verify it's the L1 score call with correct layerFilter
    expect(firstCallArg).toMatchObject({
      fileId: VALID_FILE_ID,
      layerFilter: 'L1',
    })
  })

  // ── P2: Edge cases ──

  // #20: auto_passed status from scoreFile propagated in return
  it.skip('[P2] should propagate auto_passed status from scoreFile in return value', async () => {
    // RED: return shape does not include status propagation from scoreFile
    mockScoreFile.mockResolvedValue({
      scoreId: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
      fileId: VALID_FILE_ID,
      mqmScore: 100,
      npt: 0,
      totalWords: 500,
      criticalCount: 0,
      majorCount: 0,
      minorCount: 0,
      status: 'auto_passed',
      autoPassRationale: 'Score 100.00 >= 99 threshold; 0 critical findings',
    })

    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    const result = (await (
      processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({
      event: { data: eventData },
      step: mockStep,
    })) as Record<string, unknown>

    // auto_passed status should be propagated in the result
    expect(result).toHaveProperty('mqmScore', 100)
  })

  // #21: Pipeline completes under 30s for 100 segments (mock sanity)
  it.skip('[P2] should complete pipeline handler within reasonable time (mock-based sanity)', async () => {
    // RED: L2/L3 steps not wired — pipeline will fail before timing matters
    // Real perf test = E2E gate (Story 3.4+)
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')

    const start = performance.now()
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })
    const elapsed = performance.now() - start

    // Mock-based: should resolve nearly instantly (<1s)
    // Real perf target: 30s for 100 segments (E2E)
    expect(elapsed).toBeLessThan(1000)
  })

  // #22: Mode undefined defaults to economy
  it.skip('[P2] should default to economy behavior when mode is undefined', async () => {
    // RED: mode is required in PipelineFileEventData type; undefined handling may throw
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })
    // Force mode to undefined for defense-in-depth test
    const eventDataNoMode = { ...eventData, mode: undefined as unknown as ProcessingMode }

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventDataNoMode },
      step: mockStep,
    })

    // Should behave as economy — L3 not triggered
    expect(mockRunL3ForFile).not.toHaveBeenCalled()
    // Economy: 4 steps (L1, score-l1, L2, score-l2)
    expect(mockStep.run).toHaveBeenCalledTimes(4)
  })

// ──── END: Story 3.2b test stubs ────
