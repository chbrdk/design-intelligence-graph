import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  visualCraftAtoms,
  visualCraftHasUiSignal,
  visualCraftRebuildSpec,
} from '../components/visual-craft-panel'
import { paths } from '../lib/paths'

describe('Visual craft library copy', () => {
  it('exposes craft labels and treats empty craft as hidden', () => {
    assert.equal(paths.libraryCopy.screenInsightCraft, 'Visual craft')
    assert.equal(paths.libraryCopy.screenInsightCraftKicker, 'Type, image, space, and chrome')
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

  it('builds numbered magazine atoms and keeps rebuild spec as a spanning chapter', () => {
    const atoms = visualCraftAtoms({
      type_image_relationship: 'Headline sits on a dark overlay.',
      imagery_craft: 'Product still, full-bleed, no collage.',
      rebuild_spec: 'Keep the overlay band; do not card-kit the hero.',
    })
    assert.deepEqual(
      atoms.map((atom) => ({ id: atom.id, index: atom.index, label: atom.label })),
      [
        { id: 'type_image', index: '01', label: paths.libraryCopy.screenInsightTypeImage },
        { id: 'imagery', index: '02', label: paths.libraryCopy.screenInsightImagery },
      ],
    )
    assert.equal(atoms[0]?.value, 'Headline sits on a dark overlay.')
    assert.equal(
      visualCraftRebuildSpec({
        rebuild_spec: '  Keep the overlay band; do not card-kit the hero.  ',
      }),
      'Keep the overlay band; do not card-kit the hero.',
    )
    assert.equal(visualCraftRebuildSpec({ type_image_relationship: 'Type only.' }), null)
  })
})
