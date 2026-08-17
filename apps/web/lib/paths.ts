/** Central path and shell configuration for SPIRION Next island — never hardcode URLs in call sites. */

export const paths = {
  railInsetRem: 1,
  railGapRem: 4,
  railWidthRem: 4.25,
  mainGutterRem: 2.5,
  railDockEdge: 'left' as const,
  railDockStorageKey: 'spirion.v1.railDock',
  brandCornerRadiusPx: 32,
  /** User-facing product name (Plexon sibling to CHECKION / AUDION / BRANDION). */
  brandLabel: 'SPIRION',
  /** Plexon Collection capability id (lowercase, matches sibling product ids). */
  productId: 'spirion' as const,
  /** Legacy capability id — keep until Plexon catalog migrates bindings. */
  legacyProductId: 'dig' as const,
  devPort: 3010,
  defaultDisplayName: 'SPIRION',
  displayNameStorageKey: 'spirion.v1.displayName',
  themeStorageKey: 'spirion.v1.theme',
  localeStorageKey: 'spirion.v1.locale',
  defaultTheme: 'msqdx-dark' as const,
  defaultLocale: 'en' as const,
  themeChoices: ['msqdx', 'msqdx-dark', 'msqdx-v2', 'msqdx-v2-dark'] as const,
  localeChoices: ['en', 'de'] as const,
  federationContract: '2026-05-plexon-federation-v3' as const,
  federationMode: 'dummy' as const,
  authDevFallbackSecret: 'spirion-local-dev-auth-secret-min-32-chars!!',
  envPlexonBase: 'NEXT_PLEXON_BASE_URL',
  envPlexonPublicUrl: 'NEXT_PUBLIC_PLEXON_URL',
  /** Env names kept as DIG_* for Coolify/ops continuity (see knowledge/spirion-rename.md). */
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
  /** Browser calls go through Next proxy → capture/library Node API. */
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
    screenDetailBack: 'Back to screens',
    screenDetailSettled: 'Viewport',
    screenDetailFullPage: 'Full page',
    screenDetailOverlay: 'Section overlay',
    screenDetailSections: 'Section look',
    screenInsightTitle: 'Design profile',
    screenInsightPageType: 'Page type',
    screenInsightIndustry: 'Industry',
    screenInsightStyle: 'Design style',
    screenInsightLayout: 'Layout',
    screenInsightColor: 'Color',
    screenInsightTypography: 'Typography',
    screenInsightAboveFold: 'Above the fold',
    screenInsightSections: 'Sections',
    screenInsightSummary: 'Summary',
    screenInsightMore: 'Notes',
    screenInsightPending: 'Design profile appears after enrichment…',
    screenInsightEmpty: 'No design profile signals yet.',
  },
  apiPlatformProvisioningProjects: '/api/platform/provisioning/projects',
  platformProjectQueryParam: 'platformProjectId',
  defaultDigApiUrl: 'http://127.0.0.1:8787',
  msqdxUiSibling: '../../../msqdx-ui',
  bindingTicket: 'knowledge/plexon-dig-binding-ticket.md',
  renameDoc: 'knowledge/spirion-rename.md',
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
  /** Luxury-auto rebuild mock from capture brief (not production marketing). */
  rebuildDemo: {
    brand: 'Porsche',
    headline: 'Flachbau RS.',
    support:
      'Cinematic full-bleed hero, dark scrim, one clear action — rebuilt from measured SPIRION evidence.',
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
  const url = new URL(href, 'http://spirion.local')
  url.searchParams.set(paths.platformProjectQueryParam, id)
  return `${url.pathname}${url.search}`
}
