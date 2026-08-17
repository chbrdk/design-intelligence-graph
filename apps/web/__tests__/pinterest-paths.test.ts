import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { paths } from '../lib/paths'

describe('Pinterest island paths', () => {
  it('keeps callback and proxy paths in sync with knowledge/paths.json', () => {
    assert.equal(paths.digApiPinterest, '/api/pinterest')
    assert.equal(paths.pinterest.islandCallbackPath, '/api/pinterest/callback')
    assert.equal(paths.pinterest.oauthStartPath, '/oauth/start')
    assert.equal(paths.pinterest.importPath, '/import')
    assert.equal(paths.pinterest.privacyPath, '/privacy')
    assert.equal(paths.routes.privacy, '/privacy')
    assert.equal(paths.pinterest.website, 'https://spirion.projects-a.plygrnd.tech')
    assert.match(paths.libraryCopy.pinterestHint, /boards:read/)
    const catalog = JSON.parse(
      readFileSync(resolve(__dirname, '../../../knowledge/paths.json'), 'utf8'),
    ) as { coolify: { digFqdn: string }; pinterest: { website: string; privacyPath: string } }
    assert.equal(catalog.pinterest.website, catalog.coolify.digFqdn)
    assert.equal(paths.pinterest.website, catalog.pinterest.website)
    assert.equal(paths.pinterest.privacyPath, catalog.pinterest.privacyPath)
  })
})
