import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import type { LibraryScreen } from '../lib/dig-api'
import {
  filterDeviceGalleryScreens,
  filterPrimaryGalleryScreens,
  parseDeviceGalleryFilter,
  preferredScreenForCapture,
} from '../lib/library-screen-gallery'
import { paths } from '../lib/paths'

function screen(name: string, capture = 'cap_a', vpc = `vpc_${name}`): LibraryScreen {
  return {
    capture_run_id: capture,
    viewport_capture_id: vpc,
    name,
    title: name,
    site_domain: 'example.com',
    canonical_url: 'https://example.com/',
  }
}

describe('library screen gallery split', () => {
  it('keeps island gallery keys in sync with knowledge/paths.json', () => {
    const catalog = JSON.parse(
      readFileSync(resolve(__dirname, '../../../knowledge/paths.json'), 'utf8'),
    ) as {
      libraryScreenGallery: {
        primaryViewport: string
        deviceViewports: string[]
        devicesQueryParam: string
        devicesAllValue: string
      }
    }
    assert.equal(
      paths.libraryScreenGallery.primaryViewport,
      catalog.libraryScreenGallery.primaryViewport,
    )
    assert.deepEqual(
      [...paths.libraryScreenGallery.deviceViewports],
      catalog.libraryScreenGallery.deviceViewports,
    )
    assert.equal(
      paths.libraryScreenGallery.devicesQueryParam,
      catalog.libraryScreenGallery.devicesQueryParam,
    )
    assert.equal(
      paths.libraryScreenGallery.devicesAllValue,
      catalog.libraryScreenGallery.devicesAllValue,
    )
    assert.deepEqual(paths.libraryModes, ['screens', 'devices', 'sections', 'flows'])
  })

  it('shows desktop in the primary gallery and tablet/mobile on the devices page', () => {
    const screens = [screen('desktop'), screen('tablet'), screen('mobile')]
    assert.deepEqual(
      filterPrimaryGalleryScreens(screens).map((item) => item.name),
      ['desktop'],
    )
    assert.deepEqual(
      filterDeviceGalleryScreens(screens).map((item) => item.name),
      ['tablet', 'mobile'],
    )
    assert.deepEqual(
      filterDeviceGalleryScreens(screens, 'tablet').map((item) => item.name),
      ['tablet'],
    )
    assert.deepEqual(
      filterDeviceGalleryScreens(screens, 'mobile').map((item) => item.name),
      ['mobile'],
    )
  })

  it('parses device viewport chips and prefers desktop from search', () => {
    assert.equal(parseDeviceGalleryFilter(null), 'all')
    assert.equal(parseDeviceGalleryFilter('TABLET'), 'tablet')
    assert.equal(parseDeviceGalleryFilter('mobile'), 'mobile')
    assert.equal(parseDeviceGalleryFilter('desktop'), 'all')
    const screens = [screen('mobile', 'cap_a', 'vpc_m'), screen('desktop', 'cap_a', 'vpc_d')]
    assert.equal(preferredScreenForCapture(screens, 'cap_a')?.viewport_capture_id, 'vpc_d')
  })
})
