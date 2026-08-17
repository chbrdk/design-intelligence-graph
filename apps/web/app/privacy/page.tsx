import type { Metadata } from 'next'
import { paths } from '../../lib/paths'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `Privacy policy — ${paths.brandLabel}`,
  description: `${paths.brandLabel} privacy policy for Pinterest OAuth and design-library imports.`,
}

export default function PrivacyPage() {
  const site = paths.pinterest.website
  return (
    <main className="dig-legal">
      <p className="dig-legal-kicker">{paths.brandLabel}</p>
      <h1>Privacy policy</h1>
      <p>
        Effective 17 August 2026. This policy describes how {paths.brandLabel} (
        <a href={site}>{site}</a>) handles information when you connect a Pinterest account or use
        the design-library product.
      </p>

      <h2>Who we are</h2>
      <p>
        {paths.brandLabel} is a design-intelligence product in the Plexon Collection. It helps
        design teams capture live websites and, with explicit authorization, import image Pins from
        Pinterest boards they own into their private design library.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account identity from the host platform (email / display name when you sign in).</li>
        <li>
          Pinterest OAuth tokens (access and refresh) after you click Connect Pinterest and approve
          scopes <code>boards:read</code>, <code>pins:read</code>, and <code>user_accounts:read</code>
          .
        </li>
        <li>Pinterest username of the connected account.</li>
        <li>
          Pin metadata and image files from boards you choose to import (pin id, title, board id,
          and the image URL returned by the Pinterest API).
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        We use this information only to provide the service you requested: list your boards, import
        selected Pins into your collection, run design analysis, and show results in your library.
        We do not sell Pinterest data, do not use it for advertising, and do not combine one
        customer&apos;s Pinterest data with another customer&apos;s.
      </p>

      <h2>Storage</h2>
      <p>
        OAuth tokens are stored on the {paths.brandLabel} API server (not in the browser, not in
        git). Imported Pin images are stored as design-library captures for the collection that
        started the import. We do not collect Pinterest passwords or session cookies.
      </p>

      <h2>Sharing</h2>
      <p>
        We do not share Pinterest API data with advertisers or data brokers. Infrastructure
        providers that host {paths.brandLabel} may process data solely to run the product.
      </p>

      <h2>Your choices</h2>
      <p>
        You can disconnect Pinterest by contacting the operator and requesting token deletion. You
        can delete imported captures from the library. Revoking the app in Pinterest settings
        invalidates future API calls.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: use the operator contact on your {paths.brandLabel} Collection
        workspace, or the support channel documented for your staging environment.
      </p>
      <p>
        <a href={paths.routes.home}>Back to {paths.brandLabel}</a>
      </p>
    </main>
  )
}
