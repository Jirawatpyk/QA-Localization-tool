import { describe, expect, it, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

// ── Hoisted mocks ──
const { dbState, dbMockModule } = vi.hoisted(() => createDrizzleMock())

vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/db/schema/userRoles', () => ({
  userRoles: { tenantId: 'tenant_id', role: 'role', userId: 'user_id' },
}))

vi.mock('@/db/schema/fileAssignments', () => ({
  fileAssignments: {
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    assignedTo: 'assigned_to',
    status: 'status',
  },
}))

const TENANT_ID = asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f')

describe('getAdminRecipients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  it('should return admin users for tenant', async () => {
    dbState.returnValues = [[{ userId: 'admin-1' }, { userId: 'admin-2' }]]

    const { getAdminRecipients } = await import('./recipients')
    const result = await getAdminRecipients(TENANT_ID)

    expect(result).toEqual([{ userId: 'admin-1' }, { userId: 'admin-2' }])
  })

  it('should exclude self when excludeUserId is provided', async () => {
    dbState.returnValues = [[{ userId: 'admin-1' }, { userId: 'admin-2' }]]

    const { getAdminRecipients } = await import('./recipients')
    const result = await getAdminRecipients(TENANT_ID, 'admin-1')

    expect(result).toEqual([{ userId: 'admin-2' }])
  })

  it('should return empty array when no admins exist', async () => {
    dbState.returnValues = [[]]

    const { getAdminRecipients } = await import('./recipients')
    const result = await getAdminRecipients(TENANT_ID)

    expect(result).toEqual([])
  })
})

describe('getFileAssignee', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  it('should return userId when file has active assignee', async () => {
    dbState.returnValues = [[{ userId: 'user-1' }]]

    const { getFileAssignee } = await import('./recipients')
    const result = await getFileAssignee('file-id', TENANT_ID)

    expect(result).toBe('user-1')
  })

  it('should return null when file has no active assignee', async () => {
    dbState.returnValues = [[]]

    const { getFileAssignee } = await import('./recipients')
    const result = await getFileAssignee('file-id', TENANT_ID)

    expect(result).toBeNull()
  })
})

describe('getProjectMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  it('should return admins and assignees deduplicated', async () => {
    // Call 0: getAdminRecipients query
    // Call 1: assignees query
    dbState.returnValues = [
      [{ userId: 'admin-1' }, { userId: 'user-2' }],
      [{ userId: 'user-2' }, { userId: 'user-3' }],
    ]

    const { getProjectMembers } = await import('./recipients')
    const result = await getProjectMembers('project-id', TENANT_ID)

    expect(result).toEqual([{ userId: 'admin-1' }, { userId: 'user-2' }, { userId: 'user-3' }])
  })

  it('should exclude self from combined list', async () => {
    dbState.returnValues = [[{ userId: 'admin-1' }, { userId: 'user-2' }], [{ userId: 'user-3' }]]

    const { getProjectMembers } = await import('./recipients')
    const result = await getProjectMembers('project-id', TENANT_ID, 'admin-1')

    expect(result).toEqual([{ userId: 'user-2' }, { userId: 'user-3' }])
  })

  it('should return empty array when no members exist', async () => {
    dbState.returnValues = [[], []]

    const { getProjectMembers } = await import('./recipients')
    const result = await getProjectMembers('project-id', TENANT_ID)

    expect(result).toEqual([])
  })
})
