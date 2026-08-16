import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { paths } from '../lib/paths'

describe('rebuild demo', () => {
  it('exposes rebuild route and brief-aligned copy', () => {
    assert.equal(paths.routes.rebuild, '/rebuild')
    assert.equal(paths.rebuildDemo.brand, 'Porsche')
    assert.match(paths.rebuildDemo.headline, /Flachbau RS/i)
    assert.match(paths.rebuildDemo.primaryCta, /Alle anzeigen/i)
    assert.equal(paths.rebuildDemo.heroImage, '/rebuild/hero-night-car.png')
    assert.ok(paths.rebuildDemo.captureRunId.startsWith('cap_'))
  })

  it('ships hero asset and brief knowledge file', () => {
    const hero = resolve(__dirname, '../public/rebuild/hero-night-car.png')
    const brief = resolve(__dirname, '../../../knowledge/porsche-germany-rebuild-brief.md')
    assert.equal(existsSync(hero), true)
    assert.match(readFileSync(brief, 'utf8'), /Brand Hero|full-bleed/i)
  })

  it('page wires RebuildDemoPage', () => {
    const page = readFileSync(resolve(__dirname, '../app/rebuild/page.tsx'), 'utf8')
    assert.match(page, /RebuildDemoPage/)
    assert.match(page, /rebuild-demo\.css/)
  })
})
