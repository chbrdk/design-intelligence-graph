import { paths } from './paths'
import type { LibraryScreen } from './dig-api'

export type DeviceGalleryFilter = 'all' | 'tablet' | 'mobile'

export function isPrimaryGalleryViewport(name: string): boolean {
  return name === paths.libraryScreenGallery.primaryViewport
}

export function isDeviceGalleryViewport(name: string): boolean {
  return (paths.libraryScreenGallery.deviceViewports as readonly string[]).includes(name)
}

export function parseDeviceGalleryFilter(raw: string | null | undefined): DeviceGalleryFilter {
  const value = raw?.trim().toLowerCase() ?? ''
  if (value === 'tablet' || value === 'mobile') return value
  return 'all'
}

export function filterPrimaryGalleryScreens(screens: LibraryScreen[]): LibraryScreen[] {
  return screens.filter((screen) => isPrimaryGalleryViewport(screen.name))
}

export function filterDeviceGalleryScreens(
  screens: LibraryScreen[],
  viewport: DeviceGalleryFilter = 'all',
): LibraryScreen[] {
  return screens.filter((screen) => {
    if (!isDeviceGalleryViewport(screen.name)) return false
    if (viewport === 'all') return true
    return screen.name === viewport
  })
}

/** Prefer the desktop card for a capture when opening from search. */
export function preferredScreenForCapture(
  screens: LibraryScreen[],
  captureRunId: string,
): LibraryScreen | undefined {
  const matches = screens.filter((screen) => screen.capture_run_id === captureRunId)
  return matches.find((screen) => isPrimaryGalleryViewport(screen.name)) ?? matches[0]
}
