'use client'

import { Chip, FilterRow, Text } from '../lib/msqdx-ui'
import {
  facetChipLabel,
  islandMediaUrl,
  type LibraryScreen,
  type LibrarySection,
} from '../lib/dig-api'
import {
  buildModuleGalleryCards,
  cropImageStyle,
  parseModuleGalleryFilter,
  type ModuleGalleryCard,
  type ModuleGalleryFilter,
} from '../lib/library-module-gallery'
import { paths } from '../lib/paths'

function ModuleCrop({ card }: { card: ModuleGalleryCard }) {
  const src = islandMediaUrl(card.screen.full_page_url ?? card.screen.primary_url)
  if (!src) return <div className="dig-module-crop dig-screen-thumb--empty">No shot</div>
  if (!card.crop) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- package media via dig proxy
      <img src={src} alt="" className="dig-module-crop-fallback" loading="lazy" />
    )
  }
  const style = cropImageStyle(card.crop, card.imageWidth, card.imageHeight)
  return (
    <div className="dig-module-crop">
      {/* eslint-disable-next-line @next/next/no-img-element -- package media via dig proxy */}
      <img src={src} alt="" className="dig-module-crop-img" style={style} loading="lazy" />
    </div>
  )
}

export function LibraryModuleGallery({
  sections,
  screens,
  filter,
  onFilter,
  onOpen,
}: {
  sections: LibrarySection[]
  screens: LibraryScreen[]
  filter: ModuleGalleryFilter
  onFilter: (next: ModuleGalleryFilter) => void
  onOpen: (screen: LibraryScreen) => void
}) {
  const cards = buildModuleGalleryCards(sections, screens, filter)
  const grouped = new Map<string, ModuleGalleryCard[]>()
  for (const card of cards) {
    const bucket = grouped.get(card.section.category) ?? []
    bucket.push(card)
    grouped.set(card.section.category, bucket)
  }
  const categories =
    filter === paths.libraryModuleGallery.allValue
      ? paths.libraryModuleGallery.categories.filter((category) => grouped.has(category))
      : [filter]

  return (
    <>
      <Text role="title">{paths.libraryCopy.moduleGalleryTitle}</Text>
      <Text role="hint">{paths.libraryCopy.moduleGalleryHint}</Text>
      <FilterRow variant="toolbar" label={paths.libraryCopy.moduleGalleryTitle}>
        <Chip
          size="sm"
          selected={filter === paths.libraryModuleGallery.allValue}
          onClick={() => onFilter(paths.libraryModuleGallery.allValue)}
        >
          {paths.libraryCopy.screenFacetAll}
        </Chip>
        {paths.libraryModuleGallery.categories.map((category) => (
          <Chip
            key={category}
            size="sm"
            selected={filter === category}
            onClick={() => onFilter(parseModuleGalleryFilter(category))}
          >
            {facetChipLabel(category)}
          </Chip>
        ))}
      </FilterRow>
      {categories.map((category) => {
        const bucket = grouped.get(category) ?? []
        return (
          <div key={category} className="dig-module-group">
            {filter === paths.libraryModuleGallery.allValue ? (
              <Text role="meta">{facetChipLabel(category)}</Text>
            ) : null}
            <ul className="dig-screen-grid dig-module-grid">
              {bucket.map((card) => (
                <li key={card.key}>
                  <button
                    type="button"
                    className="dig-screen-card"
                    onClick={() => onOpen(card.screen)}
                  >
                    <ModuleCrop card={card} />
                    <strong>
                      {facetChipLabel(card.section.category)} · `{card.section.signature}`
                    </strong>
                    <Text role="meta">{card.screen.site_domain ?? card.screen.canonical_url}</Text>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {!cards.length ? <Text role="hint">{paths.libraryCopy.moduleGalleryEmpty}</Text> : null}
    </>
  )
}
