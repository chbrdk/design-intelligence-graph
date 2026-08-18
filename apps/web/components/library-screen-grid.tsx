'use client'

import { Chip, Text } from '../lib/msqdx-ui'
import { facetChipLabel, islandMediaUrl, type LibraryScreen } from '../lib/dig-api'

export function LibraryScreenGrid({
  screens,
  empty,
  variant = 'desktop',
  onOpen,
}: {
  screens: LibraryScreen[]
  empty: string
  variant?: 'desktop' | 'devices'
  onOpen: (screen: LibraryScreen) => void
}) {
  return (
    <ul className={`dig-screen-grid${variant === 'devices' ? ' dig-screen-grid--devices' : ''}`}>
      {screens.map((screen) => {
        const thumb = islandMediaUrl(screen.primary_url)
        const chips = [
          screen.design_facets?.style,
          screen.design_facets?.layout,
          screen.design_facets?.industry_tags?.[0],
        ].filter((value): value is string => Boolean(value))
        return (
          <li key={screen.viewport_capture_id}>
            <button
              type="button"
              className="dig-screen-card"
              data-viewport={screen.name}
              onClick={() => onOpen(screen)}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element -- package media via dig proxy
                <img src={thumb} alt="" className="dig-screen-thumb" loading="lazy" />
              ) : (
                <div className="dig-screen-thumb dig-screen-thumb--empty">No shot</div>
              )}
              <strong>{screen.title || screen.name}</strong>
              <Text role="meta">
                {screen.name} · {screen.site_domain ?? screen.canonical_url}
              </Text>
              {chips.length ? (
                <span className="dig-screen-card-facets">
                  {chips.map((chip) => (
                    <Chip key={chip} static={true} size="sm">
                      {facetChipLabel(chip)}
                    </Chip>
                  ))}
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
      {!screens.length ? <li>{empty}</li> : null}
    </ul>
  )
}
