import { digApiBaseUrl } from '../../../../lib/runtime-config'

export const dynamic = 'force-dynamic'

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
