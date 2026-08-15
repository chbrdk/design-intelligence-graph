import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { islandMediaUrl } from '../lib/dig-api'
import { paths } from '../lib/paths'

describe('island media URLs', () => {
  it('rewrites dig-api library media paths through the Next proxy', () => {
    const apiPath =
      '/api/library/media?capture_run_id=cap_1&path=viewports%2Fdesktop%2Fscreenshots%2Ffull-page.webp'
    assert.equal(islandMediaUrl(apiPath), `${paths.digProxyBase}${apiPath}`)
    assert.equal(islandMediaUrl(null), null)
    assert.equal(
      islandMediaUrl(`${paths.digProxyBase}/api/library/media?x=1`),
      `${paths.digProxyBase}/api/library/media?x=1`,
    )
  })
})
