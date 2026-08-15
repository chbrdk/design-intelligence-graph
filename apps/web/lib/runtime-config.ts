import { paths } from './paths'

export function plexonBaseUrl(): string {
  const explicit = process.env[paths.envPlexonBase]?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const auth = process.env[paths.envPlexonAuthUrl]?.trim()
  if (auth) return auth.replace(/\/$/, '')
  return 'http://localhost:3000'
}

export function digPublicUrl(): string {
  return process.env[paths.envDigPublicUrl]?.trim() || `http://localhost:${paths.devPort}`
}

/** Upstream DIG capture/library Node API (not the Next island). */
export function digApiBaseUrl(): string {
  return process.env[paths.envDigApiUrl]?.trim().replace(/\/$/, '') || paths.defaultDigApiUrl
}

export function getPlexonServiceSecret(): string {
  return process.env[paths.envPlexonServiceSecret]?.trim() || ''
}

export function getPlexonAuthUrl(): string {
  return process.env[paths.envPlexonAuthUrl]?.trim() || ''
}

export function getPlexonRegisterUrl(): string | null {
  return process.env[paths.envPlexonRegisterUrl]?.trim() || null
}

export function isPlexonAuthConfigured(): boolean {
  return Boolean(getPlexonAuthUrl() && getPlexonServiceSecret())
}

export type FederationRuntimeMode = 'dummy' | 'live'

export function getFederationMode(): FederationRuntimeMode {
  const raw = process.env[paths.envFederationMode]?.trim().toLowerCase()
  if (raw === 'live' || raw === 'dummy') return raw
  return paths.federationMode
}
