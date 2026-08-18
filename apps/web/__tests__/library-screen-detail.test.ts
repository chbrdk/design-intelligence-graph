import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { paths } from '../lib/paths'
import {
  clampScreenDetailSideRatio,
  parseStoredScreenDetailSideRatio,
  sideRatioFromPointer,
  stepScreenDetailSideRatio,
} from '../lib/screen-detail-split'

describe('library screen detail section look', () => {
  it('sets compact type on section-look item body copy', () => {
    const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8')
    const block = css.match(/\.dig-section-look-panel \.ds-text-body \{[^}]+\}/)
    assert.ok(block)
    assert.match(block[0], /font-size:\s*var\(--type-sm\)/)
    const component = readFileSync(resolve(__dirname, '../components/library-screen-detail.tsx'), 'utf8')
    assert.match(component, /dig-section-look-panel/)
    assert.match(component, /item\.interpretation/)
  })
})

describe('library screen detail split', () => {
  it('keeps split keys in sync with knowledge/paths.json', () => {
    const catalog = JSON.parse(
      readFileSync(resolve(__dirname, '../../../knowledge/paths.json'), 'utf8'),
    ) as {
      libraryScreenDetail: {
        splitStorageKey: string
        sideRatioDefault: number
        sideRatioMin: number
        sideRatioMax: number
      }
    }
    assert.equal(
      paths.libraryScreenDetail.splitStorageKey,
      catalog.libraryScreenDetail.splitStorageKey,
    )
    assert.equal(
      paths.libraryScreenDetail.sideRatioDefault,
      catalog.libraryScreenDetail.sideRatioDefault,
    )
    assert.equal(paths.libraryScreenDetail.sideRatioMin, catalog.libraryScreenDetail.sideRatioMin)
    assert.equal(paths.libraryScreenDetail.sideRatioMax, catalog.libraryScreenDetail.sideRatioMax)
  })

  it('clamps stored and pointer ratios onto the closed range', () => {
    const { sideRatioDefault, sideRatioMin, sideRatioMax } = paths.libraryScreenDetail
    assert.equal(clampScreenDetailSideRatio(Number.NaN), sideRatioDefault)
    assert.equal(clampScreenDetailSideRatio(0), sideRatioMin)
    assert.equal(clampScreenDetailSideRatio(1), sideRatioMax)
    assert.equal(parseStoredScreenDetailSideRatio(null), sideRatioDefault)
    assert.equal(parseStoredScreenDetailSideRatio('0.4'), 0.4)
    assert.equal(sideRatioFromPointer(700, { left: 0, width: 1000 }), 0.3)
    assert.equal(sideRatioFromPointer(0, { left: 0, width: 1000 }), sideRatioMax)
    assert.equal(stepScreenDetailSideRatio(sideRatioMin, -0.2), sideRatioMin)
  })

  it('wires a col-resize gutter between screenshot and section look', () => {
    const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8')
    assert.match(css, /\.dig-screen-detail-gutter/)
    assert.match(css, /cursor:\s*col-resize/)
    assert.match(css, /--dig-screen-side/)
    const detail = readFileSync(
      resolve(__dirname, '../components/library-screen-detail.tsx'),
      'utf8',
    )
    assert.match(detail, /ScreenDetailSplit/)
    const split = readFileSync(
      resolve(__dirname, '../components/screen-detail-split.tsx'),
      'utf8',
    )
    assert.match(split, /role="separator"/)
    assert.match(split, /splitStorageKey/)
  })
})
