import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, { prepare: false })

const [beta] = await sql`SELECT id, email FROM users WHERE email = 'beta@sfix7.test'`
const [alpha] = await sql`SELECT id, email FROM users WHERE email = 'alpha@sfix7.test'`

// Cancel any active row first
await sql`UPDATE file_assignments SET status='cancelled', completed_at=NOW()
  WHERE file_id='79b79d59-3f1d-44e2-ba3d-1712daa2f97f'
    AND status IN ('assigned','in_progress')`

// Insert admin-assigned row: assignedBy=beta (the "admin"), assignedTo=alpha
const [row] = await sql`
  INSERT INTO file_assignments (
    file_id, project_id, tenant_id, assigned_to, assigned_by,
    status, priority, last_active_at
  )
  VALUES (
    '79b79d59-3f1d-44e2-ba3d-1712daa2f97f',
    'e918bd32-a8e6-431b-8ce3-16adf4db00dc',
    'f714c0be-1112-4ad5-9875-b88b6e64ee1c',
    ${alpha.id},
    ${beta.id},
    'in_progress', 'normal', NOW()
  )
  RETURNING id, assigned_to, assigned_by, status
`
console.log('Admin-assigned row created:', row)
console.log('isSelfAssigned =', row.assigned_to === row.assigned_by)
await sql.end()
