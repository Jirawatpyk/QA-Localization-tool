import { and, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { suppressionRules } from '@/db/schema/suppressionRules'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'

const requestSchema = z.object({
  ruleIds: z.array(z.string().uuid()).min(1).max(50),
})

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('qa_reviewer')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tenantId } = user

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { ruleIds } = parsed.data

  try {
    // Deactivate session-only rules (Guardrail #1: withTenant, Guardrail #5: ruleIds length already guarded by .min(1))
    await db
      .update(suppressionRules)
      .set({ isActive: false })
      .where(
        and(
          inArray(suppressionRules.id, ruleIds),
          eq(suppressionRules.duration, 'session'),
          withTenant(suppressionRules.tenantId, tenantId),
        ),
      )
  } catch (err) {
    logger.error({ err, ruleIds }, 'Failed to deactivate session rules')
    return NextResponse.json({ error: 'Failed to deactivate' }, { status: 500 })
  }

  // CR-L4: best-effort audit log for session deactivation (Guardrail #2)
  try {
    await writeAuditLog({
      tenantId,
      userId: user.id,
      entityType: 'suppression_rule',
      entityId: ruleIds[0]!,
      action: 'suppression_rule.session_deactivated',
      newValue: { ruleIds, count: ruleIds.length },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr, ruleIds }, 'Audit log failed for session rule deactivation')
  }

  return NextResponse.json({ ok: true })
}
