import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AppProviders } from '../components/app-providers'
import { paths } from '../lib/paths'
import './globals.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: paths.brandLabel,
  description: `${paths.brandLabel} — design graph capability on Plexon`,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={paths.defaultLocale} data-theme={paths.defaultTheme} suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
