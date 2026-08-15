import { NextResponse } from 'next/server'
import { paths } from '../../../lib/paths'
import { getFederationMode, isPlexonAuthConfigured } from '../../../lib/runtime-config'

export async function GET() {
  return NextResponse.json({
    ok: true,
    product: paths.productId,
    federationMode: getFederationMode(),
    plexonAuthConfigured: isPlexonAuthConfigured(),
  })
}
