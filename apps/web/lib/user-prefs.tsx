'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { paths } from './paths'

export type UiThemeId = (typeof paths.themeChoices)[number]
export type UiLocaleId = (typeof paths.localeChoices)[number]

type UserPrefsContextValue = {
  displayName: string
  setDisplayName: (next: string) => void
  theme: UiThemeId
  setTheme: (next: UiThemeId) => void
  locale: UiLocaleId
  setLocale: (next: UiLocaleId) => void
}

const UserPrefsContext = createContext<UserPrefsContextValue | null>(null)

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function applyTheme(theme: UiThemeId) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}

function applyLocale(locale: UiLocaleId) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('lang', locale)
}

export function UserPrefsProvider({ children }: { children: ReactNode }) {
  const [displayName, setDisplayNameState] = useState<string>(paths.defaultDisplayName)
  const [theme, setThemeState] = useState<UiThemeId>(paths.defaultTheme)
  const [locale, setLocaleState] = useState<UiLocaleId>(paths.defaultLocale)

  useEffect(() => {
    const nextTheme = (() => {
      const raw = readStored(paths.themeStorageKey)
      if (raw && (paths.themeChoices as readonly string[]).includes(raw)) return raw as UiThemeId
      return paths.defaultTheme
    })()
    const nextLocale = (() => {
      const raw = readStored(paths.localeStorageKey)
      if (raw && (paths.localeChoices as readonly string[]).includes(raw)) return raw as UiLocaleId
      return paths.defaultLocale
    })()
    const nextName = readStored(paths.displayNameStorageKey)?.trim() || paths.defaultDisplayName
    setThemeState(nextTheme)
    setLocaleState(nextLocale)
    setDisplayNameState(nextName)
    applyTheme(nextTheme)
    applyLocale(nextLocale)
  }, [])

  const setDisplayName = useCallback((next: string) => {
    const value = next.trim() || paths.defaultDisplayName
    setDisplayNameState(value)
    writeStored(paths.displayNameStorageKey, value)
  }, [])

  const setTheme = useCallback((next: UiThemeId) => {
    setThemeState(next)
    writeStored(paths.themeStorageKey, next)
    applyTheme(next)
  }, [])

  const setLocale = useCallback((next: UiLocaleId) => {
    setLocaleState(next)
    writeStored(paths.localeStorageKey, next)
    applyLocale(next)
  }, [])

  const value = useMemo(
    () => ({ displayName, setDisplayName, theme, setTheme, locale, setLocale }),
    [displayName, setDisplayName, theme, setTheme, locale, setLocale],
  )

  return <UserPrefsContext.Provider value={value}>{children}</UserPrefsContext.Provider>
}

export function useUserPrefs(): UserPrefsContextValue {
  const ctx = useContext(UserPrefsContext)
  if (!ctx) throw new Error('useUserPrefs requires UserPrefsProvider')
  return ctx
}
