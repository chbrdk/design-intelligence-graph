import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('next.config.ts', () => {
  it('does not webpack-alias react (Next 16 /_global-error prerender)', () => {
    const src = readFileSync(join(__dirname, '../next.config.ts'), 'utf8')
    expect(src).not.toMatch(/react:\s*path\.resolve/)
    expect(src).not.toMatch(/['"]react-dom['"]\s*:/)
    expect(src).toMatch(/@msqdx\/ui/)
  })

  it('build script is full next build --webpack (not compile-only)', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
      scripts: { build: string }
    }
    expect(pkg.scripts.build).toBe('next build --webpack')
    expect(pkg.scripts.build).not.toContain('experimental-build-mode')
  })
})
