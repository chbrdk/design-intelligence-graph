/** Detect stale Next/webpack chunks after an island deploy (404 on hashed `_next/static` files). */

export function isChunkLoadFailure(input: unknown): boolean {
  if (input == null) return false
  if (typeof input === 'object') {
    const rec = input as { name?: unknown; message?: unknown; error?: unknown }
    if (rec.name === 'ChunkLoadError') return true
    if (isChunkLoadFailure(rec.message)) return true
    if (isChunkLoadFailure(rec.error)) return true
    return false
  }
  if (typeof input !== 'string') return false
  return /ChunkLoadError|Loading chunk [\w.-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module/i.test(
    input,
  )
}

export function shouldReloadForStaleChunk(attempts: number, maxAttempts: number): boolean {
  return attempts < maxAttempts
}
