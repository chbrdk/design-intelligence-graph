import type { LibraryScreen, LibrarySection } from './dig-api'
import { paths } from './paths'

export type CropBox = { x: number; y: number; width: number; height: number }

export type ModuleGalleryFilter = 'all' | (typeof paths.libraryModuleGallery.categories)[number]

export type ModuleGalleryCard = {
  key: string
  section: LibrarySection
  screen: LibraryScreen
  crop: CropBox | null
  imageWidth: number
  imageHeight: number
}

export function parseModuleGalleryFilter(raw: string | null | undefined): ModuleGalleryFilter {
  const value = raw?.trim().toLowerCase() ?? ''
  if ((paths.libraryModuleGallery.categories as readonly string[]).includes(value)) {
    return value as ModuleGalleryFilter
  }
  return paths.libraryModuleGallery.allValue
}

export function isThinModule(section: Pick<LibrarySection, 'category' | 'signature'>): boolean {
  const thinCategory = (paths.libraryModuleGallery.thinCategories as readonly string[]).includes(
    section.category,
  )
  const thinSignature = (paths.libraryModuleGallery.thinSignatures as readonly string[]).includes(
    section.signature,
  )
  return thinCategory && thinSignature
}

export function isGalleryModuleCategory(category: string): boolean {
  return (paths.libraryModuleGallery.categories as readonly string[]).includes(category)
}

export function intersectBox(box: CropBox, imageWidth: number, imageHeight: number): CropBox | null {
  const x = Math.max(0, box.x)
  const y = Math.max(0, box.y)
  const width = Math.min(imageWidth, box.x + box.width) - x
  const height = Math.min(imageHeight, box.y + box.height) - y
  if (width < 8 || height < 8) return null
  return { x, y, width, height }
}

/** Grow a measured band toward a card aspect so nav/CTA strips still fill a 16:9 tile. */
export function expandBoxToAspect(
  box: CropBox,
  imageWidth: number,
  imageHeight: number,
  aspect: number = paths.libraryModuleGallery.cardAspect,
): CropBox {
  let { x, y, width, height } = box
  const current = width / Math.max(height, 1)
  if (current < aspect) {
    width = Math.min(imageWidth, height * aspect)
    x = Math.min(Math.max(0, x - (width - box.width) / 2), Math.max(0, imageWidth - width))
  } else if (current > aspect) {
    height = Math.min(imageHeight, width / aspect)
    y = Math.min(Math.max(0, y - (height - box.height) / 2), Math.max(0, imageHeight - height))
  }
  return intersectBox({ x, y, width, height }, imageWidth, imageHeight) ?? box
}

export function cropImageStyle(
  box: CropBox,
  imageWidth: number,
  imageHeight: number,
): { width: string; height: string; left: string; top: string } {
  return {
    width: `${(imageWidth / box.width) * 100}%`,
    height: `${(imageHeight / box.height) * 100}%`,
    left: `${(-box.x / box.width) * 100}%`,
    top: `${(-box.y / box.height) * 100}%`,
  }
}

export function moduleImageSize(
  section: LibrarySection,
  screen: LibraryScreen,
): { width: number; height: number } {
  const width = Number(screen.width ?? section.viewport_width ?? 1440)
  const height = Number(screen.document_height ?? screen.height ?? 1000)
  return {
    width: Number.isFinite(width) && width > 0 ? width : 1440,
    height: Number.isFinite(height) && height > 0 ? height : 1000,
  }
}

function screenForSection(screens: LibraryScreen[], section: LibrarySection): LibraryScreen | undefined {
  return screens.find(
    (screen) =>
      screen.capture_run_id === section.capture_run_id && screen.name === section.viewport_name,
  )
}

export function buildModuleGalleryCards(
  sections: LibrarySection[],
  screens: LibraryScreen[],
  filter: ModuleGalleryFilter = paths.libraryModuleGallery.allValue,
): ModuleGalleryCard[] {
  const primary = paths.libraryScreenGallery.primaryViewport
  const chosen = new Map<string, LibrarySection>()
  for (const section of sections) {
    if (section.viewport_name !== primary) continue
    if (isThinModule(section)) continue
    if (filter === paths.libraryModuleGallery.allValue) {
      if (!isGalleryModuleCategory(section.category)) continue
    } else if (section.category !== filter) {
      continue
    }
    const key = `${section.capture_run_id}:${section.category}`
    const prev = chosen.get(key)
    if (!prev || section.confidence > prev.confidence) chosen.set(key, section)
  }

  const grouped = new Map<string, ModuleGalleryCard[]>()
  for (const section of chosen.values()) {
    const screen = screenForSection(screens, section)
    if (!screen) continue
    const size = moduleImageSize(section, screen)
    const raw = section.root_box
      ? intersectBox(section.root_box, size.width, size.height)
      : null
    const crop = raw ? expandBoxToAspect(raw, size.width, size.height) : null
    const card: ModuleGalleryCard = {
      key: `${section.capture_run_id}-${section.section_id ?? section.signature}-${section.category}`,
      section,
      screen,
      crop,
      imageWidth: size.width,
      imageHeight: size.height,
    }
    const bucket = grouped.get(section.category) ?? []
    bucket.push(card)
    grouped.set(section.category, bucket)
  }

  const cap =
    filter === paths.libraryModuleGallery.allValue
      ? paths.libraryModuleGallery.maxPerCategory
      : paths.libraryModuleGallery.maxFiltered
  const order =
    filter === paths.libraryModuleGallery.allValue
      ? paths.libraryModuleGallery.categories
      : ([filter] as const)
  const cards: ModuleGalleryCard[] = []
  for (const category of order) {
    const bucket = (grouped.get(category) ?? []).sort(
      (left, right) => right.section.confidence - left.section.confidence,
    )
    cards.push(...bucket.slice(0, cap))
  }
  return cards
}
