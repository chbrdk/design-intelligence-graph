import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { paths } from '../lib/paths'

describe('Bulk image ingest island paths', () => {
  it('keeps upload API and copy in sync with knowledge/paths.json', () => {
    assert.equal(paths.imageIngest.imagesPath, '/images')
    assert.equal(paths.imageIngest.fieldName, 'files')
    assert.equal(paths.imageIngest.maxFiles, 40)
    assert.match(paths.imageIngest.accept, /image\/webp/)
    assert.equal(paths.libraryCopy.uploadTitle, 'Bulk image upload')
    assert.match(paths.libraryCopy.uploadHint, /Pinterest/)
    const catalog = JSON.parse(
      readFileSync(resolve(__dirname, '../../../knowledge/paths.json'), 'utf8'),
    ) as {
      imageIngest: {
        imagesPath: string
        fieldName: string
        maxFiles: number
        accept: string
        islandProxyMaxBody: string
      }
    }
    assert.equal(paths.imageIngest.imagesPath, catalog.imageIngest.imagesPath)
    assert.equal(paths.imageIngest.fieldName, catalog.imageIngest.fieldName)
    assert.equal(paths.imageIngest.maxFiles, catalog.imageIngest.maxFiles)
    assert.equal(paths.imageIngest.accept, catalog.imageIngest.accept)
    const dockerfile = readFileSync(resolve(__dirname, '../../../Dockerfile'), 'utf8')
    assert.match(dockerfile, /knowledge\/paths\.json/)
    const nextConfig = readFileSync(resolve(__dirname, '../next.config.ts'), 'utf8')
    assert.match(nextConfig, /knowledge\/paths\.json/)
    assert.match(catalog.imageIngest.islandProxyMaxBody, /^\d+mb$/)
  })
})
