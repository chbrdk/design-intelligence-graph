'use client'

import { useEffect } from 'react'
import { isChunkLoadFailure, shouldReloadForStaleChunk } from '../lib/chunk-load-recovery'
import { paths } from '../lib/paths'

function readAttempts(): number {
  const raw = sessionStorage.getItem(paths.chunkReloadStorageKey)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

function recoverIfStaleChunk(value: unknown): void {
  if (!isChunkLoadFailure(value)) return
  const attempts = readAttempts()
  if (!shouldReloadForStaleChunk(attempts, paths.chunkReloadMaxAttempts)) return
  sessionStorage.setItem(paths.chunkReloadStorageKey, String(attempts + 1))
  window.location.reload()
}

/** One hard reload when webpack asks for a chunk the previous Coolify build no longer serves. */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => recoverIfStaleChunk(event.error ?? event.message)
    const onRejection = (event: PromiseRejectionEvent) => recoverIfStaleChunk(event.reason)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
