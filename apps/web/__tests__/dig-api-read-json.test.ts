import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { readJson } from '../lib/dig-api'

describe('readJson', () => {
  it('parses a JSON object', async () => {
    const body = await readJson<{ screens: string[] }>(
      new Response('{"screens":["a"]}', { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    assert.deepEqual(body.screens, ['a'])
    assert.equal(body.error, undefined)
  })

  it('does not throw on an empty body', async () => {
    const body = await readJson<{ screens?: string[] }>(new Response('', { status: 502 }))
    assert.equal(body.error, 'Empty response (502)')
  })

  it('does not throw on truncated JSON', async () => {
    const body = await readJson<{ screens?: string[] }>(
      new Response('{"screens":[{"id":', { status: 200 }),
    )
    assert.equal(body.error, 'Invalid JSON (200): {"screens":[{"id":')
  })

  it('maps Traefik no-available-server to dig-api unavailable', async () => {
    const body = await readJson<{ screens?: string[] }>(
      new Response('no available server\n', { status: 503 }),
    )
    assert.equal(body.error, 'dig-api unavailable (503)')
  })
})
