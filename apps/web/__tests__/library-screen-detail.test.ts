import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

describe('library screen detail section look', () => {
  it('sets compact type on section-look item body copy', () => {
    const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8')
    const block = css.match(/\.dig-section-look-panel \.ds-text-body \{[^}]+\}/)
    assert.ok(block)
    assert.match(block[0], /font-size:\s*var\(--type-sm\)/)
    const component = readFileSync(resolve(__dirname, '../components/library-screen-detail.tsx'), 'utf8')
    assert.match(component, /dig-section-look-panel/)
    assert.match(component, /item\.interpretation/)
  })
})
