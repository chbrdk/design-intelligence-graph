'use client'

import { isChunkLoadFailure, shouldReloadForStaleChunk } from '../lib/chunk-load-recovery'
import { paths } from '../lib/paths'

function readAttempts(): number {
  try {
    const raw = sessionStorage.getItem(paths.chunkReloadStorageKey)
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function recoverIfStaleChunk(value: unknown): void {
  if (!isChunkLoadFailure(value)) return
  const attempts = readAttempts()
  if (!shouldReloadForStaleChunk(attempts, paths.chunkReloadMaxAttempts)) return
  try {
    sessionStorage.setItem(paths.chunkReloadStorageKey, String(attempts + 1))
  } catch {
    /* private mode */
  }
  window.location.reload()
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => recoverIfStaleChunk(event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => recoverIfStaleChunk(event.reason))
}

/** Import from AppProviders so the window listeners attach with the island shell. */
export function ChunkLoadRecovery() {
  return null
}
