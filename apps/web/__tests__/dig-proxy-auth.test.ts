import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { paths, withPlatformProject } from '../lib/paths'
import { PLEXON_SERVICE_SECRET_HEADER } from '../lib/plexon-contract'

describe('island dig proxy machine auth helpers', () => {
  it('documents DIG_API_TOKEN env for live proxy inject', () => {
    assert.equal(paths.envDigApiToken, 'DIG_API_TOKEN')
    assert.equal(paths.envPlexonServiceSecret, 'PLEXON_SERVICE_SECRET')
    assert.equal(PLEXON_SERVICE_SECRET_HEADER, 'X-Service-Secret')
    assert.equal(paths.digApiLibraryReferences, '/api/library/references')
  })

  it('withPlatformProject preserves Collection on nav hrefs', () => {
    assert.equal(withPlatformProject('/library', null), '/library')
    assert.equal(
      withPlatformProject('/library', 'pp-abc'),
      `/library?${paths.platformProjectQueryParam}=pp-abc`,
    )
    assert.equal(
      withPlatformProject('/capture', 'pp-1'),
      `/capture?${paths.platformProjectQueryParam}=pp-1`,
    )
  })
})
