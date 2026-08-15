import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { paths } from './lib/paths'
import { isPlexonAuthConfigured, validateCredentialsWithPlexon } from './lib/plexon-auth'
import { getAuthSecret } from './lib/auth-secret'

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: getAuthSecret(),
  trustHost: true,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        if (!isPlexonAuthConfigured()) return null
        const email = String(credentials.email).trim().toLowerCase()
        const password = String(credentials.password)
        const user = await validateCredentialsWithPlexon(email, password)
        return user ? { id: user.id, email: user.email, name: user.name ?? undefined } : null
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: paths.routes.login },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id
        token.email = user.email
        token.name = user.name
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.email = token.email ?? ''
        session.user.name = token.name ?? null
      }
      return session
    },
  },
})
