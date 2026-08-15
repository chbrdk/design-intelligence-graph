import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { paths } from '../lib/paths'
import { ASSISTANT_EMBED_PRODUCT } from '../lib/platform-assistant-paths'

describe('DIG island paths contract', () => {
  it('uses dig product id and federation contract', () => {
    assert.equal(paths.productId, 'dig')
    assert.equal(paths.federationContract, '2026-05-plexon-federation-v3')
    assert.equal(ASSISTANT_EMBED_PRODUCT, 'dig')
    assert.equal(paths.routes.capture, '/capture')
    assert.equal(paths.routes.projects, '/projects')
    assert.equal(paths.digProxyBase, '/api/dig')
    assert.equal(paths.apiPlatformProvisioningProjects, '/api/platform/provisioning/projects')
    assert.equal(paths.platformProjectQueryParam, 'platformProjectId')
  })

  it('barrels point at sibling msqdx-ui source', () => {
    const shell = readFileSync(resolve(__dirname, '../lib/msqdx-ui-shell.ts'), 'utf8')
    assert.match(shell, /msqdx-ui\/packages\/ui\/src\/components\/AppFrame/)
    const client = readFileSync(resolve(__dirname, '../lib/msqdx-ui-client.ts'), 'utf8')
    assert.match(client, /ChatOverlay/)
  })

  it('binding ticket is documented in repo knowledge', () => {
    const ticket = readFileSync(
      resolve(__dirname, '../../../knowledge/plexon-dig-binding-ticket.md'),
      'utf8',
    )
    assert.match(ticket, /productId.*dig/s)
    assert.match(ticket, /dig-project-origin/)
  })
})
