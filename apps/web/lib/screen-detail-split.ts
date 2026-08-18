import { paths } from './paths'

export function clampScreenDetailSideRatio(value: number): number {
  const { sideRatioDefault, sideRatioMin, sideRatioMax } = paths.libraryScreenDetail
  if (!Number.isFinite(value)) return sideRatioDefault
  return Math.min(sideRatioMax, Math.max(sideRatioMin, value))
}

export function parseStoredScreenDetailSideRatio(raw: string | null | undefined): number {
  if (!raw) return paths.libraryScreenDetail.sideRatioDefault
  return clampScreenDetailSideRatio(Number.parseFloat(raw))
}

/** Side panel sits on the right; ratio is the fraction of the split width it occupies. */
export function sideRatioFromPointer(
  clientX: number,
  rect: { left: number; width: number },
): number {
  if (!Number.isFinite(rect.width) || rect.width <= 0) {
    return paths.libraryScreenDetail.sideRatioDefault
  }
  return clampScreenDetailSideRatio((rect.left + rect.width - clientX) / rect.width)
}

export function stepScreenDetailSideRatio(current: number, delta: number): number {
  return clampScreenDetailSideRatio(current + delta)
}
