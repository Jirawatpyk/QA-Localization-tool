import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, { prepare: false })

const result = await sql`
  UPDATE file_assignments
  SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
  WHERE file_id = '79b79d59-3f1d-44e2-ba3d-1712daa2f97f'
    AND status IN ('assigned', 'in_progress')
  RETURNING id, status, assigned_to
`
console.log(`✓ Cancelled ${result.length} active row(s)`)
for (const r of result) console.log(' ', r.id, '→', r.status)
await sql.end()
