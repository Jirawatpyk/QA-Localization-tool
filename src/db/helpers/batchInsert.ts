import type { PgTable } from 'drizzle-orm/pg-core'

/**
 * Insert rows in batches to avoid exceeding Postgres parameter limits.
 * Used by parser (segments), pipeline (findings), and glossary (terms).
 */
export async function batchInsert<T extends Record<string, unknown>>(
  tx: { insert: (table: PgTable) => { values: (rows: T[]) => Promise<unknown> } },
  table: PgTable,
  rows: T[],
  batchSize: number,
): Promise<void> {
  if (rows.length === 0) return

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    await tx.insert(table).values(batch)
  }
}
