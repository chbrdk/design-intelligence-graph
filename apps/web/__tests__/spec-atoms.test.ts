import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { paths } from '../lib/paths'
import {
  functionalityAtoms,
  pageFlowFromItems,
  sectionSpecAtoms,
  stripVisionDetectedPreamble,
  uxAssessmentAtoms,
} from '../lib/spec-atoms'

describe('spec atoms', () => {
  it('strips vision-detected band preambles and keeps Vision notes', () => {
    assert.equal(
      stripVisionDetectedPreamble(
        'Vision-detected hero section labeled "Hero". Full-width band y=0.00 h=0.42.',
      ),
      '',
    )
    assert.equal(
      stripVisionDetectedPreamble(
        'Vision-detected feature section labeled "Features". Vision: Type sits on a dark overlay.',
      ),
      'Type sits on a dark overlay.',
    )
  })

  it('builds numbered UX assessment atoms from vision_page', () => {
    const atoms = uxAssessmentAtoms({
      above_fold_job: 'Quote in one screen.',
      ux_flow: ['Hero promise', 'Quote form', 'Trust'],
      spacing_feel: 'airy',
      alignment: 'left',
      ux_strengths: ['Clear CTA'],
      ux_risks: ['Long scroll'],
      interaction_chrome: 'Thin top nav.',
    })
    assert.deepEqual(
      atoms.map((atom) => ({ id: atom.id, index: atom.index, label: atom.label })),
      [
        { id: 'ux_job', index: '01', label: paths.libraryCopy.screenInsightUxJob },
        { id: 'ux_flow', index: '02', label: paths.libraryCopy.screenInsightUxFlow },
        { id: 'space', index: '03', label: paths.libraryCopy.screenInsightUxSpacing },
        { id: 'ux_strengths', index: '04', label: paths.libraryCopy.screenInsightUxStrengths },
        { id: 'ux_risks', index: '05', label: paths.libraryCopy.screenInsightUxRisks },
        { id: 'chrome', index: '06', label: paths.libraryCopy.screenInsightChrome },
      ],
    )
    assert.equal(atoms[1]?.value, 'Hero promise → Quote form → Trust')
  })

  it('groups functionality into UI, patterns, and modules', () => {
    const atoms = functionalityAtoms({
      ui: ['Search', 'Quote CTA', 'Search'],
      patterns: ['hero_banner'],
      modules: ['sticky_nav'],
    })
    assert.equal(atoms.length, 3)
    assert.equal(atoms[0]?.label, paths.libraryCopy.screenInsightFunctionalityItem)
    assert.equal(atoms[0]?.value, 'Search · Quote CTA')
    assert.equal(atoms[1]?.label, paths.libraryCopy.screenInsightFunctionalityPattern)
    assert.equal(atoms[2]?.label, paths.libraryCopy.screenInsightFunctionalityModules)
  })

  it('analyzes each section with the same numbered craft cards', () => {
    const atoms = sectionSpecAtoms(
      {
        interpretation:
          'Vision-detected hero section labeled "Hero". Full-width band y=0.00 h=0.42.',
      },
      {
        section_id: 'band_1',
        stack_summary: 'full-bleed media → left heading → CTA',
        overlay: { present: true, kind: 'scrim', notes: 'Type over shadowed industrial photo.' },
        media: { role: 'hero', notes: 'Low-key factory still.' },
        alignment: { text: 'left' },
        typography_emphasis: ['all_caps'],
        layout: { mode: 'overlay', notes: 'Negative space on the dark half.' },
        interaction_summary: 'Single primary quote CTA.',
        look_summary: 'Editorial type stack over industrial photography.',
      },
    )
    assert.equal(atoms[0]?.id, 'functionality')
    assert.equal(atoms[0]?.index, '01')
    assert.equal(atoms[1]?.id, 'type_image')
    assert.equal(atoms[2]?.id, 'type')
    assert.match(atoms[2]?.value ?? '', /left/)
    assert.equal(atoms.at(-1)?.id, 'rebuild')
    assert.equal(atoms.at(-1)?.spanning, true)
    assert.doesNotMatch(atoms.map((atom) => atom.value).join(' '), /Vision-detected/)
  })

  it('maps per-crop vision_section onto the same numbered cards', () => {
    const atoms = sectionSpecAtoms(
      {
        name: 'band_2',
        interpretation:
          'hero band · Hero Section · Vision-detected hero section labeled "Hero Section". Full-width band y=0.07 h=0.30. Vision: massive sans-serif headline CITY ARCADE. Atmosphere: bright daylight Media: glass modules Overlay: none',
        gaps: {
          vision_section: {
            composition:
              "massive sans-serif headline 'CITY ARCADE' dominates the upper center against a plain white field, while a 3D architectural render occupies the lower half.",
            media_subject: 'futuristic modular glass architecture',
            atmosphere: 'bright natural daylight with high contrast',
            overlay: 'none',
            visible_text: ['CITY', 'ARCADE', 'BEST REAL ESTATE AGENCY'],
          },
        },
      },
      {
        section_id: 'band_2',
        stack_summary: 'hero band · Hero Section',
        look_summary: 'Vision-detected hero section labeled "Hero Section".',
        media: { role: 'hero', notes: 'crop viewports/desktop/sections/vision_band_2.webp' },
      },
    )
    const byId = Object.fromEntries(atoms.map((atom) => [atom.id, atom.value]))
    assert.equal(atoms[0]?.id, 'functionality')
    assert.match(byId.functionality, /CITY/)
    assert.doesNotMatch(byId.functionality, /hero band/)
    assert.match(byId.type_image, /CITY ARCADE/)
    assert.match(byId.imagery, /glass architecture/)
    assert.match(byId.space, /daylight/)
    assert.doesNotMatch(atoms.map((atom) => atom.value).join(' '), /Vision-detected/)
  })

  it('reads page narrative from analysis page_flow items', () => {
    const steps = pageFlowFromItems([
      { kind: 'ui_element', name: 'Search' },
      { kind: 'page_flow', section_label: 'Trust', step_index: 2, signature: 'logo_row' },
      { kind: 'page_flow', section_label: 'Hero', step_index: 1, signature: 'media' },
    ])
    assert.deepEqual(steps, [
      { section_label: 'Hero', signature: 'media' },
      { section_label: 'Trust', signature: 'logo_row' },
    ])
  })
})
