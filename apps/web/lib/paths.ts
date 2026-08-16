/** Central path and shell configuration for DIG Next island — never hardcode URLs in call sites. */

export const paths = {
  railInsetRem: 1,
  railGapRem: 4,
  railWidthRem: 4.25,
  mainGutterRem: 2.5,
  railDockEdge: 'left' as const,
  railDockStorageKey: 'dig.v1.railDock',
  brandCornerRadiusPx: 32,
  brandLabel: 'DIG',
  productId: 'dig' as const,
  devPort: 3010,
  defaultDisplayName: 'DIG',
  displayNameStorageKey: 'dig.v1.displayName',
  themeStorageKey: 'dig.v1.theme',
  localeStorageKey: 'dig.v1.locale',
  defaultTheme: 'msqdx-dark' as const,
  defaultLocale: 'en' as const,
  themeChoices: ['msqdx', 'msqdx-dark', 'msqdx-v2', 'msqdx-v2-dark'] as const,
  localeChoices: ['en', 'de'] as const,
  federationContract: '2026-05-plexon-federation-v3' as const,
  federationMode: 'dummy' as const,
  authDevFallbackSecret: 'dig-local-dev-auth-secret-min-32-chars!!',
  envPlexonBase: 'NEXT_PLEXON_BASE_URL',
  envPlexonPublicUrl: 'NEXT_PUBLIC_PLEXON_URL',
  envDigPublicUrl: 'NEXT_PUBLIC_DIG_URL',
  envDigApiUrl: 'DIG_API_URL',
  envPlexonServiceSecret: 'PLEXON_SERVICE_SECRET',
  envDigApiToken: 'DIG_API_TOKEN',
  envPlexonAuthUrl: 'PLEXON_AUTH_URL',
  envPlexonRegisterUrl: 'NEXT_PUBLIC_PLEXON_REGISTER_URL',
  envAuthSecret: 'AUTH_SECRET',
  envFederationMode: 'DIG_FEDERATION_MODE',
  pathAssistantEmbed: '/assistant/embed',
  pathAssistantExpand: '/assistant',
  /** Browser calls go through Next proxy → DIG Node API. */
  digProxyBase: '/api/dig',
  digApiJobs: '/api/jobs',
  digApiLibrary: '/api/library',
  digApiLibraryFlows: '/api/library/flows',
  digApiLibraryPageFlows: '/api/library/page-flows',
  digApiLibraryReferences: '/api/library/references',
  digApiEnrichment: '/api/enrichment',
  libraryModes: ['screens', 'sections', 'flows'] as const,
  libraryCopy: {
    flowsLabel: 'Flows',
    pageNarrativeLabel: 'Page narrative',
    flowsSupport: 'Multi-screen design journeys indexed from captures',
  },
  apiPlatformProvisioningProjects: '/api/platform/provisioning/projects',
  platformProjectQueryParam: 'platformProjectId',
  defaultDigApiUrl: 'http://127.0.0.1:8787',
  msqdxUiSibling: '../../../msqdx-ui',
  bindingTicket: 'knowledge/plexon-dig-binding-ticket.md',
  platformDoc: 'docs/DIG-013-plexon-app.md',
  routes: {
    home: '/',
    login: '/login',
    projects: '/projects',
    capture: '/capture',
    library: '/library',
    enrichment: '/enrichment',
    analyses: '/analyses',
    settings: '/settings',
    rebuild: '/rebuild',
    apiAuthNextAuth: '/api/auth',
    apiHealth: '/api/health',
  },
  /** Luxury-auto rebuild mock from DIG capture brief (not production marketing). */
  rebuildDemo: {
    brand: 'Porsche',
    headline: 'Flachbau RS.',
    support: 'Cinematic full-bleed hero, dark scrim, one clear action — rebuilt from measured DIG evidence.',
    primaryCta: 'Alle anzeigen',
    secondaryCta: 'Konfigurieren',
    heroImage: '/rebuild/hero-night-car.png',
    briefPath: 'knowledge/porsche-germany-rebuild-brief.md',
    captureRunId: 'cap_3f48fbb23e074fd6ae68540760f01b92',
  },
} as const

/** Append Collection query to island routes so nav keeps platformProjectId. */
export function withPlatformProject(
  href: string,
  platformProjectId: string | null | undefined,
): string {
  const id = platformProjectId?.trim()
  if (!id) return href
  const url = new URL(href, 'http://dig.local')
  url.searchParams.set(paths.platformProjectQueryParam, id)
  return `${url.pathname}${url.search}`
}
