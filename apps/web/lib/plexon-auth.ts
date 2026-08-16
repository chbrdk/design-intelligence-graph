import {
  getPlexonAuthUrl,
  getPlexonServiceSecret,
  isPlexonAuthConfigured,
} from './runtime-config'
import { getPlexonContractHeaders } from './plexon-contract'
import { paths } from './paths'

export { isPlexonAuthConfigured, getPlexonAuthUrl, getPlexonServiceSecret }

export type PlexonAuthUser = { id: string; email: string; name?: string }

export async function validateCredentialsWithPlexon(
  email: string,
  password: string,
): Promise<PlexonAuthUser | null> {
  const baseUrl = getPlexonAuthUrl()
  const secret = getPlexonServiceSecret()
  if (!baseUrl || !secret) return null
  const url = `${baseUrl.replace(/\/$/, '')}/api/auth/validate-credentials`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getPlexonContractHeaders(secret),
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { user?: PlexonAuthUser }
    return data?.user ?? null
  } catch (e) {
    console.error(`[${paths.brandLabel}] Plexon auth error:`, e)
    return null
  }
}
