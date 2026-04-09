import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, { prepare: false })

// What does Alpha's session see via the getFileAssignment query?
const fileId = '79b79d59-3f1d-44e2-ba3d-1712daa2f97f'
const projectId = 'e918bd32-a8e6-431b-8ce3-16adf4db00dc'
const tenantId = 'f714c0be-1112-4ad5-9875-b88b6e64ee1c'

const rows = await sql`
  SELECT
    fa.id, fa.file_id, fa.project_id, fa.tenant_id, fa.assigned_to, fa.assigned_by,
    fa.status, fa.last_active_at, fa.started_at,
    u.display_name
  FROM file_assignments fa
  INNER JOIN users u ON u.id = fa.assigned_to
  WHERE fa.file_id = ${fileId}
    AND fa.project_id = ${projectId}
    AND fa.tenant_id = ${tenantId}
    AND fa.status IN ('assigned', 'in_progress')
  LIMIT 1
`

console.log('Query returned', rows.length, 'rows')
for (const r of rows) {
  console.log(' id=', r.id, ' status=', r.status, ' assignedTo=', r.assigned_to, ' display=', r.display_name)
}

// Verify Alpha and Beta tenants
const users = await sql`SELECT id, email, tenant_id FROM users WHERE email IN ('alpha@sfix7.test','beta@sfix7.test')`
console.log('Users:')
for (const u of users) console.log(' ', u.email, 'tenant=', u.tenant_id)

await sql.end()
