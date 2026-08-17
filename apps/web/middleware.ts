import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from './auth'
import { isPlexonAuthConfigured } from './lib/plexon-auth'
import { paths } from './lib/paths'

const gated = auth((req) => {
  const { pathname } = req.nextUrl
  const authHeader = req.headers.get('authorization')?.toLowerCase() ?? ''
  const hasBearer = authHeader.startsWith('bearer ')
  const isPublic =
    pathname === paths.routes.login ||
    pathname === paths.routes.rebuild ||
    pathname === paths.routes.privacy ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/dig') ||
    pathname.startsWith('/api/pinterest') ||
    pathname.startsWith('/api/platform/provisioning') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    (pathname.startsWith('/api/') && hasBearer)

  if (isPublic) {
    return NextResponse.next()
  }

  if (!req.auth) {
    const login = new URL(paths.routes.login, req.nextUrl.origin)
    login.searchParams.set('redirect', pathname)
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
})

export default function middleware(req: NextRequest) {
  if (!isPlexonAuthConfigured()) {
    return NextResponse.next()
  }
  return gated(req, {} as never)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
