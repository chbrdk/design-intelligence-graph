/** DIG-011 Library hash routing helpers (client-only). */

import { parseDeviceGalleryFilter, type DeviceGalleryFilter } from './library-screen-gallery'
import { paths } from './paths'

export type LibraryHashState =
  | { view: 'screens' }
  | { view: 'screen_detail'; viewportCaptureId: string }
  | { view: 'devices'; viewport?: DeviceGalleryFilter }
  | { view: 'sections' }
  | { view: 'flows' }
  | { view: 'flow_detail'; flowId: string }
  | { view: 'flow_interactive'; flowId: string; step?: string }

export function parseLibraryHash(hash: string): LibraryHashState {
  const raw = hash.replace(/^#/, '').replace(/^\//, '')
  const [pathPart, queryPart] = raw.split('?')
  const segments = (pathPart || '').split('/').filter(Boolean)
  if (segments[0] !== 'library') return { view: 'screens' }
  if (segments[1] === 'sections') return { view: 'sections' }
  if (segments[1] === 'devices') {
    const params = new URLSearchParams(queryPart || '')
    const viewport = parseDeviceGalleryFilter(
      params.get(paths.libraryScreenGallery.devicesQueryParam),
    )
    return { view: 'devices', viewport }
  }
  if (segments[1] === 'screens' && segments[2]) {
    return { view: 'screen_detail', viewportCaptureId: decodeURIComponent(segments[2]) }
  }
  if (segments[1] === 'flows') {
    const flowId = segments[2] ? decodeURIComponent(segments[2]) : null
    if (!flowId) return { view: 'flows' }
    if (segments[3] === 'interactive') {
      const params = new URLSearchParams(queryPart || '')
      const step = params.get('step')?.trim() || undefined
      return { view: 'flow_interactive', flowId, ...(step ? { step } : {}) }
    }
    return { view: 'flow_detail', flowId }
  }
  return { view: 'screens' }
}

export function formatLibraryHash(state: LibraryHashState): string {
  if (state.view === 'screens') return '#/library/screens'
  if (state.view === 'devices') {
    const param = paths.libraryScreenGallery.devicesQueryParam
    const all = paths.libraryScreenGallery.devicesAllValue
    const viewport =
      state.viewport && state.viewport !== all
        ? `?${param}=${encodeURIComponent(state.viewport)}`
        : ''
    return `#/library/devices${viewport}`
  }
  if (state.view === 'screen_detail') {
    return `#/library/screens/${encodeURIComponent(state.viewportCaptureId)}`
  }
  if (state.view === 'sections') return '#/library/sections'
  if (state.view === 'flows') return '#/library/flows'
  if (state.view === 'flow_detail') return `#/library/flows/${encodeURIComponent(state.flowId)}`
  const step = state.step ? `?step=${encodeURIComponent(state.step)}` : ''
  return `#/library/flows/${encodeURIComponent(state.flowId)}/interactive${step}`
}

export function nextInteractiveStep(input: {
  steps: Array<{ flow_screen_id: string; hotspots: Array<{ to_screen_id: string }>; advance_anywhere: boolean }>
  currentScreenId: string
  hotspotTo?: string
}): string | null {
  const current = input.steps.find((step) => step.flow_screen_id === input.currentScreenId)
  if (!current) return null
  if (input.hotspotTo) {
    const hit = current.hotspots.find((hotspot) => hotspot.to_screen_id === input.hotspotTo)
    return hit ? hit.to_screen_id : null
  }
  if (current.hotspots.length >= 2) return null
  if (current.hotspots.length === 1) return current.hotspots[0]!.to_screen_id
  if (current.advance_anywhere) {
    const index = input.steps.findIndex((step) => step.flow_screen_id === input.currentScreenId)
    return input.steps[index + 1]?.flow_screen_id ?? null
  }
  return null
}
