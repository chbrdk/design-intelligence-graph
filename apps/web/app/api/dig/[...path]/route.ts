import { digApiBaseUrl } from '../../../../lib/runtime-config'
import { paths } from '../../../../lib/paths'
import { PLEXON_SERVICE_SECRET_HEADER } from '../../../../lib/plexon-contract'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Forward browser → dig-api. In live federation dig-api expects machine auth;
 * inject island-held DIG_API_TOKEN / PLEXON_SERVICE_SECRET when the client
 * did not already send credentials.
 */
function injectMachineAuth(headers: Headers): void {
  if (!headers.has('authorization')) {
    const token = process.env[paths.envDigApiToken]?.trim()
    if (token) headers.set('authorization', `Bearer ${token}`)
  }
  if (!headers.has(PLEXON_SERVICE_SECRET_HEADER.toLowerCase()) && !headers.has(PLEXON_SERVICE_SECRET_HEADER)) {
    const secret = process.env[paths.envPlexonServiceSecret]?.trim()
    if (secret) headers.set(PLEXON_SERVICE_SECRET_HEADER, secret)
  }
}

async function proxy(request: Request, pathSegments: string[]) {
  const upstreamPath = `/${pathSegments.join('/')}`
  const incoming = new URL(request.url)
  const target = new URL(upstreamPath + incoming.search, digApiBaseUrl())

  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  const accept = request.headers.get('accept')
  if (accept) headers.set('accept', accept)
  const auth = request.headers.get('authorization')
  if (auth) headers.set('authorization', auth)
  const serviceSecret = request.headers.get(PLEXON_SERVICE_SECRET_HEADER)
  if (serviceSecret) headers.set(PLEXON_SERVICE_SECRET_HEADER, serviceSecret)
  injectMachineAuth(headers)

  const init: RequestInit = {
    method: request.method,
    headers,
    duplex: 'half',
  } as RequestInit

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
  }

  const upstream = await fetch(target, init)
  const responseHeaders = new Headers()
  const upstreamType = upstream.headers.get('content-type')
  if (upstreamType) responseHeaders.set('content-type', upstreamType)
  const cacheControl = upstream.headers.get('cache-control')
  if (cacheControl) responseHeaders.set('cache-control', cacheControl)

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

type Ctx = { params: Promise<{ path: string[] }> }

export async function GET(request: Request, ctx: Ctx) {
  const { path } = await ctx.params
  return proxy(request, path)
}

export async function POST(request: Request, ctx: Ctx) {
  const { path } = await ctx.params
  return proxy(request, path)
}

export async function PUT(request: Request, ctx: Ctx) {
  const { path } = await ctx.params
  return proxy(request, path)
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { path } = await ctx.params
  return proxy(request, path)
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { path } = await ctx.params
  return proxy(request, path)
}
