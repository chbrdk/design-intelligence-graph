import type { Metadata } from 'next'
import { RebuildDemoPage } from '../../components/rebuild-demo-page'
import { paths } from '../../lib/paths'
import '../../components/rebuild-demo.css'

export const metadata: Metadata = {
  title: `${paths.rebuildDemo.brand} — ${paths.brandLabel} rebuild mock`,
  description: `Luxury automotive homepage rebuild from ${paths.brandLabel} capture brief`,
}

export default function RebuildPage() {
  return <RebuildDemoPage />
}
