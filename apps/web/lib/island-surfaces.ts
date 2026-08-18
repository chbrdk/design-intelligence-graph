import type { EnrichmentJob, LibraryScreen } from './dig-api'
import { formatLibraryHash } from './library-hash'
import { preferredScreenForCapture } from './library-screen-gallery'
import { paths, withPlatformProject } from './paths'

export function libraryScreenHref(
  viewportCaptureId: string,
  platformProjectId?: string | null,
): string {
  return `${withPlatformProject(paths.routes.library, platformProjectId)}${formatLibraryHash({
    view: 'screen_detail',
    viewportCaptureId,
  })}`
}

export function hrefForCaptureScreen(
  screens: LibraryScreen[],
  captureRunId: string,
  platformProjectId?: string | null,
): string | null {
  const screen = preferredScreenForCapture(screens, captureRunId)
  return screen ? libraryScreenHref(screen.viewport_capture_id, platformProjectId) : null
}

export function recentHomeScreens(screens: LibraryScreen[]): LibraryScreen[] {
  return screens
    .filter((screen) => screen.name === paths.libraryScreenGallery.primaryViewport)
    .slice(0, paths.islandSurfaces.homeRecentCount)
}

export function rankEnrichmentJobs(jobs: EnrichmentJob[]): EnrichmentJob[] {
  const weight = (status: string) => {
    if (status === 'running' || status === 'queued') return 0
    if (status === 'failed') return 1
    return 2
  }
  return [...jobs]
    .sort(
      (left, right) =>
        weight(left.status) - weight(right.status) || right.updated_at.localeCompare(left.updated_at),
    )
    .slice(0, paths.islandSurfaces.enrichmentListCap)
}

export function countByStatus(jobs: Array<{ status: string }>): Array<{ status: string; count: number }> {
  const tallies = new Map<string, number>()
  for (const job of jobs) {
    tallies.set(job.status, (tallies.get(job.status) ?? 0) + 1)
  }
  return [...tallies.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((left, right) => right.count - left.count)
}
