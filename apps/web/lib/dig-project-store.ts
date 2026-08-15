export type DigProjectStatus = 'active' | 'archived'
export type DigCapabilitySyncStatus = 'in_sync' | 'pending' | 'error'

export type DigProject = {
  id: string
  name: string
  domain: string | null
  status: DigProjectStatus
  platformProjectId: string
  capabilityStatus: DigCapabilitySyncStatus
  ownerPlexonUserId: string | null
  platformCompanyId: string | null
  captureCount: number
  referenceCount: number
  lastActivityAt: string | null
  createdAt: string
  updatedAt: string
}

export type DigProjectUpsertInput = {
  name: string
  domain?: string | null
  status?: DigProjectStatus
  ownerPlexonUserId?: string
  platformCompanyId?: string
}

const globalForProjects = globalThis as typeof globalThis & {
  __digProjectMemory?: DigProject[]
}

function projects(): DigProject[] {
  if (!globalForProjects.__digProjectMemory) {
    globalForProjects.__digProjectMemory = []
  }
  return globalForProjects.__digProjectMemory
}

function setProjects(next: DigProject[]): void {
  globalForProjects.__digProjectMemory = next
}

export function resetDigProjectStore(): void {
  globalForProjects.__digProjectMemory = []
}

export function normalizeProjectDomain(input: string | null | undefined): string | null {
  if (input === undefined || input === null) return null
  const trimmed = String(input).trim()
  if (!trimmed) return null
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    return new URL(withProto).hostname
  } catch {
    return trimmed.replace(/^https?:\/\//i, '').split('/')[0]?.split('?')[0] ?? trimmed
  }
}

export function getProjectByPlatformId(platformProjectId: string): DigProject | null {
  const found = projects().find((p) => p.platformProjectId === platformProjectId)
  return found ? { ...found } : null
}

export function getProjectById(id: string): DigProject | null {
  const found = projects().find((p) => p.id === id)
  return found ? { ...found } : null
}

export function listDigProjects(opts?: { includeArchived?: boolean }): DigProject[] {
  const includeArchived = opts?.includeArchived === true
  return projects()
    .filter((p) => includeArchived || p.status !== 'archived')
    .map((p) => ({ ...p }))
}

export function upsertByPlatformProjectId(
  platformProjectId: string,
  input: DigProjectUpsertInput,
): DigProject {
  const idKey = platformProjectId.trim()
  if (!idKey) throw new Error('platform_project_id_required')
  const name = input.name.trim()
  if (!name) throw new Error('name_required')

  const now = new Date().toISOString()
  const existing = projects().find((p) => p.platformProjectId === idKey)
  if (existing) {
    const updated: DigProject = {
      ...existing,
      name,
      domain: normalizeProjectDomain(input.domain ?? existing.domain),
      status: input.status ?? existing.status,
      ownerPlexonUserId: input.ownerPlexonUserId?.trim() || existing.ownerPlexonUserId,
      platformCompanyId: input.platformCompanyId?.trim() || existing.platformCompanyId,
      capabilityStatus: 'in_sync',
      updatedAt: now,
    }
    setProjects(projects().map((p) => (p.id === existing.id ? updated : p)))
    return { ...updated }
  }

  const created: DigProject = {
    id: `dig-${Date.now().toString(36)}`,
    name,
    domain: normalizeProjectDomain(input.domain),
    status: input.status ?? 'active',
    platformProjectId: idKey,
    capabilityStatus: 'in_sync',
    ownerPlexonUserId: input.ownerPlexonUserId?.trim() || null,
    platformCompanyId: input.platformCompanyId?.trim() || null,
    captureCount: 0,
    referenceCount: 0,
    lastActivityAt: null,
    createdAt: now,
    updatedAt: now,
  }
  setProjects([created, ...projects()])
  return { ...created }
}
