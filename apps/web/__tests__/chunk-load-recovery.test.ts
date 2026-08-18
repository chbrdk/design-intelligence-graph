import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { isChunkLoadFailure, shouldReloadForStaleChunk } from '../lib/chunk-load-recovery'
import { paths } from '../lib/paths'

describe('chunk load recovery', () => {
  it('detects webpack ChunkLoadError from the island console', () => {
    const err = Object.assign(new Error('Loading chunk 217 failed.'), { name: 'ChunkLoadError' })
    assert.equal(isChunkLoadFailure(err), true)
    assert.equal(
      isChunkLoadFailure(
        'Loading chunk 217 failed.\n(error: https://spirion.projects-a.plygrnd.tech/_next/static/chunks/217-cc152cade55e014e.js)',
      ),
      true,
    )
    assert.equal(isChunkLoadFailure('Failed to fetch dynamically imported module'), true)
    assert.equal(isChunkLoadFailure('Empty response (502)'), false)
  })

  it('reloads at most once per tab session', () => {
    assert.equal(shouldReloadForStaleChunk(0, paths.chunkReloadMaxAttempts), true)
    assert.equal(shouldReloadForStaleChunk(1, paths.chunkReloadMaxAttempts), false)
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
