---
name: add-server-action
description: Generate a Server Action with auth, tenant isolation, Zod validation, audit logging, and ActionResult typing
---

# Add Server Action

Generate a new Server Action file following the project's established patterns.

## Arguments

The user provides: `<verb><Entity>` (e.g., `updateFinding`, `deleteGlossary`, `createProject`)

## File Location

Place the action at `src/features/<feature>/actions/<verb><Entity>.action.ts` where `<feature>` is inferred from the entity name. If unclear, ask the user.

## Template

Every server action MUST follow this exact structure:

```typescript
'use server'
import 'server-only'

import { eq, and } from 'drizzle-orm'

import { db } from '@/db/client'
import { <table> } from '@/db/schema/<table>'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import type { ActionResult } from '@/types/actionResult'

export async function <verbEntity>(
  input: unknown
): Promise<ActionResult<T>> {
  // 1. Auth check
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return { success: false, code: 'UNAUTHORIZED', error: 'Not authenticated' }
  }

  // 2. Zod validation (create schema in feature's validation/ directory)
  const parsed = <schema>.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  // 3. Role check (if needed — use requireRole for admin-only actions)

  // 4. DB operation with tenant isolation
  await db
    .<operation>(<table>)
    .set({ ... })
    .where(and(
      eq(<table>.id, parsed.data.id),
      eq(<table>.tenantId, currentUser.tenantId)  // REQUIRED: tenant isolation
    ))

  // 5. Audit log (REQUIRED for state-changing operations)
  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: '<entity>',
    entityId: parsed.data.id,
    action: '<entity>.<verb>',
    newValue: { ... },
  })

  return { success: true, data: ... }
}
```

## Checklist Before Generating

1. Named export only (NO `export default`)
2. `'use server'` + `import 'server-only'` at top
3. `getCurrentUser()` auth check returns UNAUTHORIZED
4. Zod validation returns VALIDATION_ERROR
5. `eq(table.tenantId, currentUser.tenantId)` in every WHERE clause
6. `writeAuditLog()` after state change (skip ONLY for user preferences like tour state)
7. Return `ActionResult<T>` with proper typing
8. Also create Zod schema in `src/features/<feature>/validation/` if it doesn't exist
9. Also create unit test file `<verb><Entity>.action.test.ts` with at least: auth failure test + happy path test

## Reference Files

Look at these existing actions for the exact pattern:

- `src/features/dashboard/actions/markNotificationRead.action.ts`
- `src/features/taxonomy/actions/createMapping.action.ts`
- `src/features/glossary/actions/deleteGlossary.action.ts`
- `src/features/project/actions/createProject.action.ts`
