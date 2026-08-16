'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Manrope, Syne } from 'next/font/google'
import { paths } from '../lib/paths'

const display = Syne({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--rebuild-display',
})

const body = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--rebuild-body',
})

const MODELS = [
  { id: '911', name: '911', line: 'Ikone. Neu interpretiert.', cta: 'Entdecken' },
  { id: 'taycan', name: 'Taycan', line: 'Elektrisch. Unmistakably Porsche.', cta: 'Entdecken' },
  { id: 'cayenne', name: 'Cayenne', line: 'SUV-Performance mit Charakter.', cta: 'Entdecken' },
] as const

export function RebuildDemoPage() {
  const demo = paths.rebuildDemo
  return (
    <div className={`rebuild-demo ${display.variable} ${body.variable}`}>
      <a className="rebuild-skip" href="#inventory">
        Zur Modellübersicht
      </a>

      <header className="rebuild-top">
        <p className="rebuild-brand" aria-label="Brand">
          {demo.brand}
        </p>
        <nav className="rebuild-top-nav" aria-label="Primary">
          <button type="button" className="rebuild-ghost">
            Modelle
          </button>
          <button type="button" className="rebuild-ghost">
            Konfigurator
          </button>
        </nav>
      </header>

      <section className="rebuild-hero" aria-label="Hero">
        <div className="rebuild-hero-media" aria-hidden="true">
          <Image
            src={demo.heroImage}
            alt=""
            fill
            priority
            sizes="100vw"
            className="rebuild-hero-img"
          />
          <div className="rebuild-hero-scrim" />
        </div>

        <div className="rebuild-hero-copy">
          <p className="rebuild-brand rebuild-brand--hero">{demo.brand}</p>
          <h1 className="rebuild-headline">{demo.headline}</h1>
          <p className="rebuild-support">{demo.support}</p>
          <div className="rebuild-cta-row">
            <a className="rebuild-cta rebuild-cta--primary" href="#inventory">
              {demo.primaryCta}
            </a>
            <a className="rebuild-cta rebuild-cta--secondary" href="#inventory">
              {demo.secondaryCta}
            </a>
          </div>
        </div>
      </section>

      <section id="inventory" className="rebuild-inventory" aria-label="Product inventory">
        <div className="rebuild-inventory-head">
          <h2>Modelle</h2>
          <p>Produktübersicht als Card-Grid unter dem Fold — gemessenes Inventory-Muster.</p>
        </div>
        <ul className="rebuild-grid">
          {MODELS.map((model, index) => (
            <li key={model.id} className="rebuild-card" style={{ animationDelay: `${0.08 * index}s` }}>
              <div className="rebuild-card-tone" aria-hidden="true" />
              <h3>{model.name}</h3>
              <p>{model.line}</p>
              <button type="button" className="rebuild-card-cta">
                {model.cta}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="rebuild-foot">
        <p>
          DIG rebuild mock from capture <code>{demo.captureRunId}</code> · brief{' '}
          <code>{demo.briefPath}</code>
        </p>
        <p>
          <Link href={paths.routes.analyses}>Zurück zu Analyses</Link>
          {' · '}
          <Link href={paths.routes.home}>DIG Home</Link>
        </p>
      </footer>
    </div>
  )
}
