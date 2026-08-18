import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { paths } from '../lib/paths'
import { ASSISTANT_EMBED_PRODUCT } from '../lib/platform-assistant-paths'

describe('SPIRION island paths contract', () => {
  it('uses spirion product id, brand, and federation contract', () => {
    assert.equal(paths.productId, 'spirion')
    assert.equal(paths.brandLabel, 'SPIRION')
    assert.equal(paths.defaultDisplayName, 'SPIRION')
    assert.equal(paths.legacyProductId, 'dig')
    assert.equal(paths.federationContract, '2026-05-plexon-federation-v3')
    assert.equal(ASSISTANT_EMBED_PRODUCT, 'spirion')
    assert.equal(paths.routes.capture, '/capture')
    assert.equal(paths.routes.projects, '/projects')
    assert.equal(paths.digProxyBase, '/api/dig')
    assert.equal(paths.apiPlatformProvisioningProjects, '/api/platform/provisioning/projects')
    assert.equal(paths.platformProjectQueryParam, 'platformProjectId')
    assert.equal(paths.chunkReloadStorageKey, 'spirion.v1.chunkReload')
    assert.equal(paths.chunkReloadMaxAttempts, 1)
  })

  it('barrels point at sibling msqdx-ui source', () => {
    const shell = readFileSync(resolve(__dirname, '../lib/msqdx-ui-shell.ts'), 'utf8')
    assert.match(shell, /msqdx-ui\/packages\/ui\/src\/components\/AppFrame/)
    const client = readFileSync(resolve(__dirname, '../lib/msqdx-ui-client.ts'), 'utf8')
    assert.match(client, /ChatOverlay/)
  })

  it('binding ticket and rename doc are documented', () => {
    const ticket = readFileSync(
      resolve(__dirname, '../../../knowledge/plexon-dig-binding-ticket.md'),
      'utf8',
    )
    assert.match(ticket, /productId.*spirion/s)
    const rename = readFileSync(resolve(__dirname, '../../../knowledge/spirion-rename.md'), 'utf8')
    assert.match(rename, /SPIRION/)
    assert.match(rename, /legacy/i)
  })
})
