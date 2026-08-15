import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLEXON_FEDERATION_CONTRACT_VERSION } from '../lib/plexon-contract'
import {
  getProjectByPlatformId,
  resetDigProjectStore,
} from '../lib/dig-project-store'

vi.mock('../lib/runtime-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/runtime-config')>()
  return {
    ...actual,
    getPlexonServiceSecret: () => 'test-secret',
  }
})

function authHeaders(extra?: Record<string, string>): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Service-Secret': 'test-secret',
    'X-Plexon-Contract-Version': PLEXON_FEDERATION_CONTRACT_VERSION,
    ...extra,
  }
}

describe('platform provisioning projects', () => {
  beforeEach(() => {
    resetDigProjectStore()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('PUT upserts by platform project id and returns external id', async () => {
    const { PUT } = await import('../app/api/platform/provisioning/projects/[id]/route')
    const res = await PUT(
      new Request('http://localhost/api/platform/provisioning/projects/pp-live-1', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          contractVersion: PLEXON_FEDERATION_CONTRACT_VERSION,
          name: 'Live Collection',
          domain: 'https://live.example/',
          platformCompanyId: 'comp-1',
          ownerUserId: 'user-1',
        }),
      }),
      { params: Promise.resolve({ id: 'pp-live-1' }) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('applied')
    expect(body.platformProjectId).toBe('pp-live-1')
    expect(typeof body.externalProjectId).toBe('string')
    expect(body.externalProjectId).toMatch(/^dig-/)

    const project = await getProjectByPlatformId('pp-live-1')
    expect(project?.name).toBe('Live Collection')
    expect(project?.domain).toBe('live.example')
    expect(project?.capabilityStatus).toBe('in_sync')
  })

  it('PUT is idempotent for the same platform project id', async () => {
    const { PUT } = await import('../app/api/platform/provisioning/projects/[id]/route')
    const first = await PUT(
      new Request('http://localhost/api/platform/provisioning/projects/pp-idem', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          contractVersion: PLEXON_FEDERATION_CONTRACT_VERSION,
          name: 'A',
          platformCompanyId: 'comp-1',
          ownerUserId: 'user-1',
        }),
      }),
      { params: Promise.resolve({ id: 'pp-idem' }) },
    )
    const firstBody = await first.json()
    const second = await PUT(
      new Request('http://localhost/api/platform/provisioning/projects/pp-idem', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          contractVersion: PLEXON_FEDERATION_CONTRACT_VERSION,
          name: 'B',
          platformCompanyId: 'comp-1',
          ownerUserId: 'user-1',
          status: 'archived',
        }),
      }),
      { params: Promise.resolve({ id: 'pp-idem' }) },
    )
    const secondBody = await second.json()
    expect(secondBody.externalProjectId).toBe(firstBody.externalProjectId)
    expect((await getProjectByPlatformId('pp-idem'))?.name).toBe('B')
    expect((await getProjectByPlatformId('pp-idem'))?.status).toBe('archived')
  })

  it('PUT rejects unauthorized requests', async () => {
    const { PUT } = await import('../app/api/platform/provisioning/projects/[id]/route')
    const res = await PUT(
      new Request('http://localhost/api/platform/provisioning/projects/pp-x', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'pp-x' }) },
    )
    expect(res.status).toBe(401)
  })

  it('GET returns dig summary for bound project', async () => {
    const { PUT, GET } = await import('../app/api/platform/provisioning/projects/[id]/route')
    await PUT(
      new Request('http://localhost/api/platform/provisioning/projects/pp-get-1', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          contractVersion: PLEXON_FEDERATION_CONTRACT_VERSION,
          name: 'Get Me',
          domain: 'get.example',
          platformCompanyId: 'comp-1',
          ownerUserId: 'user-1',
        }),
      }),
      { params: Promise.resolve({ id: 'pp-get-1' }) },
    )

    const res = await GET(
      new Request('http://localhost/api/platform/provisioning/projects/pp-get-1', {
        method: 'GET',
        headers: authHeaders({ 'X-Plexon-User-Id': 'user-1' }),
      }),
      { params: Promise.resolve({ id: 'pp-get-1' }) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      platformProjectId: 'pp-get-1',
      name: 'Get Me',
      domain: 'get.example',
      captureCount: 0,
      referenceCount: 0,
    })
    expect(typeof body.externalProjectId).toBe('string')
  })

  it('GET requires X-Plexon-User-Id', async () => {
    const { GET } = await import('../app/api/platform/provisioning/projects/[id]/route')
    const res = await GET(
      new Request('http://localhost/api/platform/provisioning/projects/pp-x', {
        method: 'GET',
        headers: authHeaders(),
      }),
      { params: Promise.resolve({ id: 'pp-x' }) },
    )
    expect(res.status).toBe(400)
  })
})
