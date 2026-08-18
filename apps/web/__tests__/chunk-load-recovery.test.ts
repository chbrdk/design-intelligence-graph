import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { isChunkLoadFailure, shouldReloadForStaleChunk } from '../lib/chunk-load-recovery'
import { paths } from '../lib/paths'

describe('chunk load recovery', () => {
  it('detects webpack ChunkLoadError from the island console', () => {
    const err = Object.assign(new Error('Loading chunk 119 failed.'), { name: 'ChunkLoadError' })
    assert.equal(isChunkLoadFailure(err), true)
    assert.equal(
      isChunkLoadFailure(
        'Uncaught ChunkLoadError: Loading chunk 119 failed.\n(error: https://spirion.projects-a.plygrnd.tech/_next/static/chunks/119-ea90efa242fba65d.js)',
      ),
      true,
    )
    assert.equal(isChunkLoadFailure('Failed to fetch dynamically imported module'), true)
    assert.equal(isChunkLoadFailure('Empty response (502)'), false)
  })

  it('reloads at most twice per tab session so a mid-deploy miss can retry', () => {
    assert.equal(paths.chunkReloadMaxAttempts, 2)
    assert.equal(shouldReloadForStaleChunk(0, paths.chunkReloadMaxAttempts), true)
    assert.equal(shouldReloadForStaleChunk(1, paths.chunkReloadMaxAttempts), true)
    assert.equal(shouldReloadForStaleChunk(2, paths.chunkReloadMaxAttempts), false)
  })

  it('mounts recovery in AppProviders', () => {
    const src = readFileSync(resolve(__dirname, '../components/app-providers.tsx'), 'utf8')
    assert.match(src, /ChunkLoadRecovery/)
  })

  it('keeps the storage key in sync with knowledge/paths.json', () => {
    const catalog = JSON.parse(
      readFileSync(resolve(__dirname, '../../../knowledge/paths.json'), 'utf8'),
    ) as { islandChunkReload: { storageKey: string; maxAttempts: number } }
    assert.equal(paths.chunkReloadStorageKey, catalog.islandChunkReload.storageKey)
    assert.equal(paths.chunkReloadMaxAttempts, catalog.islandChunkReload.maxAttempts)
  })
})
