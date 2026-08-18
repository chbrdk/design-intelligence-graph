import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import type { LibraryScreen, LibrarySection } from '../lib/dig-api'
import {
  buildModuleGalleryCards,
  cropImageStyle,
  expandBoxToAspect,
  intersectBox,
  isThinModule,
  parseModuleGalleryFilter,
} from '../lib/library-module-gallery'
import { formatLibraryHash, parseLibraryHash } from '../lib/library-hash'
import { paths } from '../lib/paths'

function section(
  partial: Partial<LibrarySection> & Pick<LibrarySection, 'category' | 'signature'>,
): LibrarySection {
  return {
    capture_run_id: 'cap_a',
    viewport_name: 'desktop',
    taxonomy_id: 'dig:pattern.hero',
    confidence: 0.9,
    root_box: { x: 0, y: 40, width: 1440, height: 600 },
    viewport_width: 1440,
    viewport_height: 1000,
    ...partial,
  }
}

function screen(partial: Partial<LibraryScreen> = {}): LibraryScreen {
  return {
    capture_run_id: 'cap_a',
    viewport_capture_id: 'vpc_a',
    name: 'desktop',
    title: 'Home',
    site_domain: 'example.com',
    canonical_url: 'https://example.com/',
    full_page_url: '/api/library/media?path=full.webp',
    width: 1440,
    height: 1000,
    document_width: 1920,
    document_height: 5000,
    ...partial,
  }
}

describe('library module gallery', () => {
  it('keeps island keys in sync with knowledge/paths.json', () => {
    const catalog = JSON.parse(
      readFileSync(resolve(__dirname, '../../../knowledge/paths.json'), 'utf8'),
    ) as {
      libraryModuleGallery: {
        queryParam: string
        allValue: string
        categories: string[]
        thinSignatures: string[]
        maxPerCategory: number
      }
    }
    assert.equal(paths.libraryModuleGallery.queryParam, catalog.libraryModuleGallery.queryParam)
    assert.equal(paths.libraryModuleGallery.allValue, catalog.libraryModuleGallery.allValue)
    assert.deepEqual(
      [...paths.libraryModuleGallery.categories],
      catalog.libraryModuleGallery.categories,
    )
    assert.deepEqual(
      [...paths.libraryModuleGallery.thinSignatures],
      catalog.libraryModuleGallery.thinSignatures,
    )
    assert.equal(paths.libraryModuleGallery.maxPerCategory, catalog.libraryModuleGallery.maxPerCategory)
    assert.equal(paths.libraryCopy.sectionsLabel, 'Modules')
  })

  it('drops content-body dumps and keeps distinctive modules', () => {
    assert.equal(isThinModule({ category: 'content', signature: 'body' }), true)
    assert.equal(isThinModule({ category: 'hero', signature: 'media' }), false)
    const cards = buildModuleGalleryCards(
      [
        section({ category: 'content', signature: 'body', confidence: 0.99 }),
        section({ category: 'hero', signature: 'media', section_id: 'sec_hero' }),
        section({
          category: 'hero',
          signature: 'media>cta',
          section_id: 'sec_hero_weak',
          confidence: 0.4,
        }),
        section({
          category: 'nav',
          signature: 'nav',
          section_id: 'sec_nav',
          capture_run_id: 'cap_a',
          root_box: { x: 0, y: 0, width: 1440, height: 56 },
        }),
        section({
          category: 'hero',
          signature: 'media',
          section_id: 'sec_mobile',
          viewport_name: 'mobile',
        }),
      ],
      [screen()],
      'all',
    )
    assert.deepEqual(
      cards.map((card) => `${card.section.category}:${card.section.section_id}`),
      ['hero:sec_hero', 'nav:sec_nav'],
    )
  })

  it('clamps off-canvas boxes and expands thin nav toward card aspect', () => {
    const vis = intersectBox({ x: -768, y: 78, width: 1543, height: 333 }, 1440, 5000)
    assert.ok(vis)
    assert.equal(vis.x, 0)
    assert.ok(vis.width > 700)
    const nav = expandBoxToAspect({ x: 0, y: 0, width: 1440, height: 50 }, 1440, 5000, 16 / 9)
    assert.ok(nav.height > 50)
    const style = cropImageStyle({ x: 0, y: 40, width: 1440, height: 600 }, 1440, 5000)
    assert.equal(style.width, '100%')
    assert.equal(style.left, '0%')
    assert.match(style.top, /^-/)
  })

  it('parses module chips on the sections hash', () => {
    assert.equal(parseModuleGalleryFilter(null), 'all')
    assert.equal(parseModuleGalleryFilter('HERO'), 'hero')
    assert.equal(parseModuleGalleryFilter('body'), 'all')
    assert.deepEqual(parseLibraryHash('#/library/sections'), { view: 'sections', module: 'all' })
    assert.deepEqual(parseLibraryHash('#/library/sections?module=nav'), {
      view: 'sections',
      module: 'nav',
    })
    assert.equal(formatLibraryHash({ view: 'sections' }), '#/library/sections')
    assert.equal(
      formatLibraryHash({ view: 'sections', module: 'hero' }),
      '#/library/sections?module=hero',
    )
  })

  it('mounts the gallery from Library instead of the body dump', () => {
    const src = readFileSync(resolve(__dirname, '../components/library-page.tsx'), 'utf8')
    assert.match(src, /LibraryModuleGallery/)
    assert.doesNotMatch(src, /Measured section compositions across captures/)
  })
})
