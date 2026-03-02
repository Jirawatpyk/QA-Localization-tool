// ========================================================================
// Story 3.2b — scoreFile.test.ts ATDD P0 stubs (TDD RED PHASE)
// Insert these 3 tests into src/features/scoring/helpers/scoreFile.test.ts
// right after the existing layerCompleted tests (after line 727).
// ========================================================================

  // ── ATDD P0: layerCompleted override (Story 3.2b AC4, FM-1) ──

  it.skip('[P0] should use input.layerCompleted=L1L2 over prev layerCompleted=L1', async () => {
    // RED: input.layerCompleted override not implemented yet
    //
    // Setup: previousScore has layerCompleted: 'L1' (after L1-only score).
    // Call scoreFile with { layerCompleted: 'L1L2' } (L2 just completed).
    // Expected: INSERT values has layerCompleted: 'L1L2' (NOT 'L1' from prev).
    const previousScore = { ...mockNewScore, layerCompleted: 'L1' }
    dbState.returnValues = [
      mockSegments,
      [],
      [previousScore],
      [],
      [{ ...mockNewScore, layerCompleted: 'L1L2' }],
    ]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      layerCompleted: 'L1L2',
    })

    // Assert: INSERT values must contain layerCompleted: 'L1L2' from input,
    // NOT 'L1' from prev score
    expect(dbState.valuesCaptures).toContainEqual(
      expect.objectContaining({ layerCompleted: 'L1L2' }),
    )
  })

  it.skip('[P0] should fall back to prev.layerCompleted when input.layerCompleted is undefined', async () => {
    // RED: input.layerCompleted override not implemented yet
    //
    // Setup: previousScore has layerCompleted: 'L1L2'.
    // Call scoreFile WITHOUT layerCompleted (backward compat — existing callers).
    // Expected: INSERT values has layerCompleted: 'L1L2' (from prev, not reset to 'L1').
    const previousScore = { ...mockNewScore, layerCompleted: 'L1L2' }
    dbState.returnValues = [
      mockSegments,
      [],
      [previousScore],
      [],
      [{ ...mockNewScore, layerCompleted: 'L1L2' }],
    ]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      // No layerCompleted — verify fallback chain: input.layerCompleted ?? prev?.layerCompleted
    })

    // Assert: INSERT values must contain layerCompleted: 'L1L2' from prev score,
    // verifying the fallback chain works when input.layerCompleted is not provided
    expect(dbState.valuesCaptures).toContainEqual(
      expect.objectContaining({ layerCompleted: 'L1L2' }),
    )
  })

  it.skip('[P0] should use input.layerCompleted=L1L2L3 over prev layerCompleted=L1L2', async () => {
    // RED: input.layerCompleted override not implemented yet
    //
    // Setup: previousScore has layerCompleted: 'L1L2' (after L2 score).
    // Call scoreFile with { layerCompleted: 'L1L2L3' } (L3 just completed).
    // Expected: INSERT values has layerCompleted: 'L1L2L3' (NOT 'L1L2' from prev).
    const previousScore = { ...mockNewScore, layerCompleted: 'L1L2' }
    dbState.returnValues = [
      mockSegments,
      [],
      [previousScore],
      [],
      [{ ...mockNewScore, layerCompleted: 'L1L2L3' }],
    ]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      layerCompleted: 'L1L2L3',
    })

    // Assert: INSERT values must contain layerCompleted: 'L1L2L3' from input,
    // NOT 'L1L2' from prev score
    expect(dbState.valuesCaptures).toContainEqual(
      expect.objectContaining({ layerCompleted: 'L1L2L3' }),
    )
  })
