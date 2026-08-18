import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { visualCraftHasUiSignal } from '../components/visual-craft-panel'
import { paths } from '../lib/paths'

describe('Visual craft library copy', () => {
  it('exposes craft labels and treats empty craft as hidden', () => {
    assert.equal(paths.libraryCopy.screenInsightCraft, 'Visual craft')
    assert.match(paths.libraryCopy.screenPromptPackBrief, /visual_craft/)
    assert.equal(visualCraftHasUiSignal(null), false)
    assert.equal(visualCraftHasUiSignal({}), false)
    assert.equal(
      visualCraftHasUiSignal({
        type_image_relationship: 'Display type cuts through the hero photo.',
      }),
      true,
    )
  })
})
