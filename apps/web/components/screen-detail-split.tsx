'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { paths } from '../lib/paths'
import {
  clampScreenDetailSideRatio,
  parseStoredScreenDetailSideRatio,
  sideRatioFromPointer,
  stepScreenDetailSideRatio,
} from '../lib/screen-detail-split'

const KEYBOARD_STEP = 0.03

export function ScreenDetailSplit(props: { media: ReactNode; side: ReactNode }) {
  const splitRef = useRef<HTMLDivElement>(null)
  const [sideRatio, setSideRatio] = useState(paths.libraryScreenDetail.sideRatioDefault)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    try {
      setSideRatio(
        parseStoredScreenDetailSideRatio(
          window.localStorage.getItem(paths.libraryScreenDetail.splitStorageKey),
        ),
      )
    } catch {
      /* private mode */
    }
  }, [])

  function commit(next: number) {
    const value = clampScreenDetailSideRatio(next)
    setSideRatio(value)
    try {
      window.localStorage.setItem(paths.libraryScreenDetail.splitStorageKey, String(value))
    } catch {
      /* private mode */
    }
  }

  function applyPointer(clientX: number) {
    const rect = splitRef.current?.getBoundingClientRect()
    if (!rect) return
    commit(sideRatioFromPointer(clientX, rect))
  }

  return (
    <div
      ref={splitRef}
      className={`dig-screen-detail-split${dragging ? ' is-resizing' : ''}`}
      style={{ ['--dig-screen-side' as string]: `${(sideRatio * 100).toFixed(1)}%` }}
    >
      {props.media}
      <button
        type="button"
        className="dig-screen-detail-gutter"
        role="separator"
        aria-label={paths.libraryCopy.screenDetailSplit}
        aria-orientation="vertical"
        aria-valuemin={Math.round(paths.libraryScreenDetail.sideRatioMin * 100)}
        aria-valuemax={Math.round(paths.libraryScreenDetail.sideRatioMax * 100)}
        aria-valuenow={Math.round(clampScreenDetailSideRatio(sideRatio) * 100)}
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
          applyPointer(event.clientX)
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          applyPointer(event.clientX)
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          setDragging(false)
        }}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            commit(stepScreenDetailSideRatio(sideRatio, KEYBOARD_STEP))
          } else if (event.key === 'ArrowRight') {
            event.preventDefault()
            commit(stepScreenDetailSideRatio(sideRatio, -KEYBOARD_STEP))
          } else if (event.key === 'Home') {
            event.preventDefault()
            commit(paths.libraryScreenDetail.sideRatioMax)
          } else if (event.key === 'End') {
            event.preventDefault()
            commit(paths.libraryScreenDetail.sideRatioMin)
          }
        }}
      />
      {props.side}
    </div>
  )
}
