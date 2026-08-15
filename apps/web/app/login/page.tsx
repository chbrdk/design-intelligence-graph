import { Suspense } from 'react'
import { LoginPageClient } from '../../components/login-page'
import { isPlexonAuthConfigured } from '../../lib/plexon-auth'
import { getPlexonRegisterUrl } from '../../lib/runtime-config'
export const dynamic = 'force-dynamic'
export default function LoginPage() {
  return (
    <main>
      <Suspense fallback={null}>
        <LoginPageClient plexonConfigured={isPlexonAuthConfigured()} registerUrl={getPlexonRegisterUrl()} />
      </Suspense>
    </main>
  )
}
