import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { paths } from '../lib/paths'

describe('Bulk image ingest island paths', () => {
  it('keeps upload API and copy in sync with knowledge/paths.json', () => {
    assert.equal(paths.imageIngest.imagesPath, '/images')
    assert.equal(paths.imageIngest.fieldName, 'files')
    assert.equal(paths.imageIngest.assetKindField, 'assetKind')
    assert.equal(paths.imageIngest.defaultAssetKind, 'campaign_keyvisual')
    assert.equal(paths.imageIngest.maxFiles, 40)
    assert.match(paths.imageIngest.accept, /image\/webp/)
    assert.equal(paths.libraryCopy.uploadTitle, 'Graphic & campaign upload')
    assert.match(paths.libraryCopy.uploadHint, /composition_contract/)
    assert.ok(paths.imageIngest.uploadAssetKinds.some((k) => k.value === 'print_ad'))
    const catalog = JSON.parse(
      readFileSync(resolve(__dirname, '../../../knowledge/paths.json'), 'utf8'),
    ) as {
      imageIngest: {
        imagesPath: string
        fieldName: string
        assetKindField: string
        defaultAssetKind: string
        maxFiles: number
        accept: string
        islandProxyMaxBody: string
        uploadAssetKinds: Array<{ value: string; label: string }>
      }
    }
    assert.equal(paths.imageIngest.imagesPath, catalog.imageIngest.imagesPath)
    assert.equal(paths.imageIngest.fieldName, catalog.imageIngest.fieldName)
    assert.equal(paths.imageIngest.assetKindField, catalog.imageIngest.assetKindField)
    assert.equal(paths.imageIngest.defaultAssetKind, catalog.imageIngest.defaultAssetKind)
    assert.equal(paths.imageIngest.maxFiles, catalog.imageIngest.maxFiles)
    assert.equal(paths.imageIngest.accept, catalog.imageIngest.accept)
    assert.deepEqual(
      paths.imageIngest.uploadAssetKinds.map((k) => k.value),
      catalog.imageIngest.uploadAssetKinds.map((k) => k.value),
    )
    const dockerfile = readFileSync(resolve(__dirname, '../../../Dockerfile'), 'utf8')
    assert.match(dockerfile, /knowledge\/paths\.json/)
    const nextConfig = readFileSync(resolve(__dirname, '../next.config.ts'), 'utf8')
    assert.match(nextConfig, /knowledge\/paths\.json/)
    assert.match(catalog.imageIngest.islandProxyMaxBody, /^\d+mb$/)
  })
})
