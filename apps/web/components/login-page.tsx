'use client'

import { FormEvent, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Alert, Button, Field, Input, Panel, Text } from '../lib/msqdx-ui'
import { paths } from '../lib/paths'

export function LoginPageClient({
  plexonConfigured,
  registerUrl,
}: {
  plexonConfigured: boolean
  registerUrl?: string | null
}) {
  const router = useRouter()
  const search = useSearchParams()
  const redirect = search.get('redirect') || paths.routes.home
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (!plexonConfigured) {
        router.push(redirect)
        return
      }
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })
      if (result?.error) {
        setError('Sign-in failed. Check email and password.')
        return
      }
      router.push(redirect)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="dig-login-panel">
      <Text as="h1" className="dig-login-title">
        {paths.brandLabel}
      </Text>
      <Text as="p" className="dig-page-lead">
        {plexonConfigured
          ? 'Use your Plexon account. Identity lives on the platform control plane.'
          : 'Local fixture mode — Plexon auth is not configured. Continue to the app.'}
      </Text>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form className="dig-stack" onSubmit={onSubmit}>
        {plexonConfigured ? (
          <>
            <Field label="Email">
              <Input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          </>
        ) : null}
        <Button type="submit" variant="primary" disabled={busy}>
          {plexonConfigured ? (busy ? 'Signing in…' : 'Sign in') : 'Continue to app'}
        </Button>
      </form>
      {registerUrl ? (
        <Text as="p" className="dig-muted">
          <a href={registerUrl}>Create account</a>
        </Text>
      ) : null}
    </Panel>
  )
}
