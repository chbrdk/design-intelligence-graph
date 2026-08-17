import { NextRequest, NextResponse } from 'next/server'
import { digApiBaseUrl } from '../../../../lib/runtime-config'
import { paths } from '../../../../lib/paths'
import { PLEXON_SERVICE_SECRET_HEADER } from '../../../../lib/plexon-contract'

export const dynamic = 'force-dynamic'

function captureRedirect(request: NextRequest, extra: Record<string, string>): NextResponse {
  const url = new URL(paths.routes.capture, request.url)
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value)
  const collection = request.nextUrl.searchParams.get(paths.platformProjectQueryParam)
  if (collection) url.searchParams.set(paths.platformProjectQueryParam, collection)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim() ?? ''
  const state = request.nextUrl.searchParams.get('state')?.trim() ?? ''
  const oauthError = request.nextUrl.searchParams.get('error')?.trim()
  if (oauthError) {
    return captureRedirect(request, { pinterest: 'error', reason: oauthError })
  }
  if (!code || !state) {
    return captureRedirect(request, { pinterest: 'error', reason: 'missing_code' })
  }

  const headers = new Headers({ 'content-type': 'application/json' })
  const token = process.env[paths.envDigApiToken]?.trim()
  if (token) headers.set('authorization', `Bearer ${token}`)
  const secret = process.env[paths.envPlexonServiceSecret]?.trim()
  if (secret) headers.set(PLEXON_SERVICE_SECRET_HEADER, secret)

  const upstream = await fetch(`${digApiBaseUrl()}${paths.digApiPinterest}/oauth/exchange`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code, state }),
  })
  if (!upstream.ok) {
    return captureRedirect(request, { pinterest: 'error', reason: 'exchange_failed' })
  }
  return captureRedirect(request, { pinterest: 'connected' })
}
