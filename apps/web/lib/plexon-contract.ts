import { paths } from './paths'

export const PLEXON_FEDERATION_CONTRACT_VERSION = paths.federationContract
export const PLEXON_CONTRACT_VERSION_HEADER = 'X-Plexon-Contract-Version'
export const PLEXON_SERVICE_SECRET_HEADER = 'X-Service-Secret'

export function getPlexonContractHeaders(secret?: string): HeadersInit {
  return {
    [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
    ...(secret ? { [PLEXON_SERVICE_SECRET_HEADER]: secret } : {}),
  }
}
