import type { Metadata } from 'next'
import { RebuildDemoPage } from '../../components/rebuild-demo-page'
import { paths } from '../../lib/paths'
import '../../components/rebuild-demo.css'

export const metadata: Metadata = {
  title: `${paths.rebuildDemo.brand} — DIG rebuild mock`,
  description: 'Luxury automotive homepage rebuild from DIG capture brief',
}

export default function RebuildPage() {
  return <RebuildDemoPage />
}
