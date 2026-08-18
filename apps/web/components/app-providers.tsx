'use client'

import type { ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '../lib/msqdx-ui-client'
import { UserPrefsProvider } from '../lib/user-prefs'
import { ChunkLoadRecovery } from './chunk-load-recovery'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <UserPrefsProvider>
        <ToastProvider>
          <ChunkLoadRecovery />
          {children}
        </ToastProvider>
      </UserPrefsProvider>
    </SessionProvider>
  )
}
