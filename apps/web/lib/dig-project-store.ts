import {
  PLEXON_FEDERATION_CONTRACT_VERSION,
  PLEXON_CONTRACT_VERSION_HEADER,
  PLEXON_SERVICE_SECRET_HEADER,
  PLEXON_USER_HEADER,
} from './plexon-contract'
import { digApiBaseUrl, getPlexonServiceSecret } from './runtime-config'
import { paths } from './paths'

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

function memoryGetByPlatformId(platformProjectId: string): DigProject | null {
  const found = projects().find((p) => p.platformProjectId === platformProjectId)
  return found ? { ...found } : null
}

function memoryUpsert(platformProjectId: string, input: DigProjectUpsertInput): DigProject {
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

function apiProvisioningUrl(platformProjectId: string): string {
  return `${digApiBaseUrl()}${paths.apiPlatformProvisioningProjects}/${encodeURIComponent(platformProjectId)}`
}

async function digApiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${digApiBaseUrl()}/api/health`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

/** Prefer durable dig-api Postgres; fall back to island memory for local/CI. */
export async function getProjectByPlatformId(platformProjectId: string): Promise<DigProject | null> {
  const secret = getPlexonServiceSecret()
  if (secret && (await digApiAvailable())) {
    try {
      const res = await fetch(apiProvisioningUrl(platformProjectId), {
        method: 'GET',
        headers: {
          [PLEXON_SERVICE_SECRET_HEADER]: secret,
          [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
          [PLEXON_USER_HEADER]: 'dig-island',
        },
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`dig-api GET ${res.status}`)
      const body = (await res.json()) as {
        externalProjectId: string
        platformProjectId: string
        name: string
        domain: string | null
        status: DigProjectStatus
        captureCount: number
        referenceCount: number
        lastActivityAt: string | null
      }
      return {
        id: body.externalProjectId,
        name: body.name,
        domain: body.domain,
        status: body.status,
        platformProjectId: body.platformProjectId,
        capabilityStatus: 'in_sync',
        ownerPlexonUserId: null,
        platformCompanyId: null,
        captureCount: body.captureCount,
        referenceCount: body.referenceCount,
        lastActivityAt: body.lastActivityAt,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    } catch {
      /* fall through to memory */
    }
  }
  return memoryGetByPlatformId(platformProjectId)
}

export async function upsertByPlatformProjectId(
  platformProjectId: string,
  input: DigProjectUpsertInput,
): Promise<DigProject> {
  const secret = getPlexonServiceSecret()
  if (secret && (await digApiAvailable())) {
    try {
      const res = await fetch(apiProvisioningUrl(platformProjectId), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          [PLEXON_SERVICE_SECRET_HEADER]: secret,
          [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
        },
        body: JSON.stringify({
          contractVersion: PLEXON_FEDERATION_CONTRACT_VERSION,
          name: input.name,
          domain: input.domain,
          status: input.status,
          platformCompanyId: input.platformCompanyId,
          ownerUserId: input.ownerPlexonUserId,
        }),
      })
      if (!res.ok) throw new Error(`dig-api PUT ${res.status}`)
      const body = (await res.json()) as { externalProjectId: string; platformProjectId: string }
      const loaded = await getProjectByPlatformId(platformProjectId)
      if (loaded) return loaded
      return {
        id: body.externalProjectId,
        name: input.name.trim(),
        domain: normalizeProjectDomain(input.domain),
        status: input.status ?? 'active',
        platformProjectId: body.platformProjectId,
        capabilityStatus: 'in_sync',
        ownerPlexonUserId: input.ownerPlexonUserId?.trim() || null,
        platformCompanyId: input.platformCompanyId?.trim() || null,
        captureCount: 0,
        referenceCount: 0,
        lastActivityAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    } catch {
      /* fall through to memory */
    }
  }
  return memoryUpsert(platformProjectId, input)
}

/** Sync helpers kept for unit tests that exercise memory path. */
export function getProjectByPlatformIdSync(platformProjectId: string): DigProject | null {
  return memoryGetByPlatformId(platformProjectId)
}

export function upsertByPlatformProjectIdSync(
  platformProjectId: string,
  input: DigProjectUpsertInput,
): DigProject {
  return memoryUpsert(platformProjectId, input)
}
