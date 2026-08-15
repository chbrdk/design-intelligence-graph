import { paths } from './paths'

export function getAuthSecret(): string {
  const fromEnv = process.env[paths.envAuthSecret]?.trim()
  if (fromEnv && fromEnv.length >= 32) return fromEnv
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[DIG] AUTH_SECRET is missing or too short (min 32 chars). Set AUTH_SECRET when using Plexon auth.',
    )
  }
  return paths.authDevFallbackSecret
}
