import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { paths } from '../lib/paths'

describe('public privacy page (Pinterest app review)', () => {
  it('exposes a public route and policy copy', () => {
    expect(paths.routes.privacy).toBe('/privacy')
    const page = readFileSync(resolve(__dirname, '../app/privacy/page.tsx'), 'utf8')
    expect(page).toContain('paths.pinterest.website')
    expect(page).toMatch(/boards:read/)
    expect(page).toMatch(/OAuth/)
    expect(page).not.toMatch(/https:\/\/spirion/)
  })

  it('submission pack uses the same website and privacy URL', () => {
    const pack = readFileSync(resolve(__dirname, '../../../knowledge/pinterest-app-submission.md'), 'utf8')
    expect(pack).toContain(`${paths.pinterest.website}${paths.routes.privacy}`)
    expect(pack).toContain('boards:read')
    expect(pack).toContain('pins:read')
    expect(pack).toContain('user_accounts:read')
    expect(pack).toContain(`${paths.pinterest.website}${paths.pinterest.islandCallbackPath}`)
  })
})
