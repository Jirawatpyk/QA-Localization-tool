import { describe, it, expect, vi } from 'vitest'

import { batchInsert } from './batchInsert'

function createMockTx() {
  const insertFn = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  })
  return { insert: insertFn }
}

const fakeTable = {} as never

describe('batchInsert', () => {
  it('should insert all rows in a single batch when count <= batchSize', async () => {
    const tx = createMockTx()
    const valuesMock = tx.insert(fakeTable).values
    tx.insert.mockClear() // reset count after capturing reference
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }]

    await batchInsert(tx as never, fakeTable, rows, 100)

    expect(tx.insert).toHaveBeenCalledTimes(1)
    expect(tx.insert).toHaveBeenCalledWith(fakeTable)
    expect(valuesMock).toHaveBeenCalledWith(rows)
  })

  it('should split into multiple batches when count > batchSize', async () => {
    const tx = createMockTx()
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: i }))

    await batchInsert(tx as never, fakeTable, rows, 100)

    expect(tx.insert).toHaveBeenCalledTimes(3)
  })

  it('should handle exactly batchSize rows in one batch', async () => {
    const tx = createMockTx()
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i }))

    await batchInsert(tx as never, fakeTable, rows, 100)

    expect(tx.insert).toHaveBeenCalledTimes(1)
  })

  it('should do nothing for empty array', async () => {
    const tx = createMockTx()

    await batchInsert(tx as never, fakeTable, [], 100)

    expect(tx.insert).not.toHaveBeenCalled()
  })
})
