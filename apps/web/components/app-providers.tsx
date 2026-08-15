'use client'

import type { ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '../lib/msqdx-ui-client'
import { UserPrefsProvider } from '../lib/user-prefs'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <UserPrefsProvider>
        <ToastProvider>{children}</ToastProvider>
      </UserPrefsProvider>
    </SessionProvider>
  )
}
