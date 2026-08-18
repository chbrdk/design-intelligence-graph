import type { SectionDescription, SectionLookItem, VisualCraft, VisionPageSummary } from './dig-api'
import { paths } from './paths'

export type SpecAtomId =
  | 'type_image'
  | 'type'
  | 'imagery'
  | 'space'
  | 'chrome'
  | 'ux_job'
  | 'ux_flow'
  | 'ux_strengths'
  | 'ux_risks'
  | 'functionality'
  | 'rebuild'

export type SpecAtom = {
  id: SpecAtomId
  index: string
  label: string
  value: string
  spanning?: boolean
}

type Copy = typeof paths.libraryCopy

function numbered(atoms: Array<Omit<SpecAtom, 'index'>>): SpecAtom[] {
  return atoms.map((atom, index) => ({
    ...atom,
    index: String(index + 1).padStart(2, '0'),
  }))
}

function pushAtom(
  atoms: Array<Omit<SpecAtom, 'index'>>,
  id: SpecAtomId,
  label: string,
  value: string | null | undefined,
  spanning = false,
) {
  const trimmed = value?.trim()
  if (!trimmed) return
  atoms.push({ id, label, value: trimmed, ...(spanning ? { spanning: true } : {}) })
}

export function stripVisionDetectedPreamble(text: string | null | undefined): string {
  const raw = (text ?? '').trim()
  if (!raw) return ''
  const vision = raw.match(/Vision:\s*([\s\S]+)/i)
  if (vision?.[1]?.trim()) return vision[1].trim()
  return raw
    .replace(/^[^·\n]*Vision-detected[^.]*\.\s*/i, '')
    .replace(/\s*Full-width band y=\S+ h=\S+\.?/gi, '')
    .replace(/\s*Full-width band[^.]*\./gi, '')
    .trim()
}

export function visualCraftAtoms(
  craft: VisualCraft | null | undefined,
  copy: Copy = paths.libraryCopy,
): SpecAtom[] {
  if (!craft) return []
  const atoms: Array<Omit<SpecAtom, 'index'>> = []
  pushAtom(atoms, 'type_image', copy.screenInsightTypeImage, craft.type_image_relationship)
  pushAtom(atoms, 'type', copy.screenInsightTypeCraft, craft.typography_composition)
  pushAtom(atoms, 'imagery', copy.screenInsightImagery, craft.imagery_craft)
  pushAtom(atoms, 'space', copy.screenInsightSpace, craft.spatial_craft)
  pushAtom(atoms, 'chrome', copy.screenInsightChrome, craft.chrome_vs_content)
  return numbered(atoms)
}

export function visualCraftRebuildSpec(craft: VisualCraft | null | undefined): string | null {
  const value = craft?.rebuild_spec?.trim()
  return value || null
}

export function uxAssessmentAtoms(
  page: VisionPageSummary | null | undefined,
  summary?: string | null,
  copy: Copy = paths.libraryCopy,
): SpecAtom[] {
  const atoms: Array<Omit<SpecAtom, 'index'>> = []
  const summaryUx = summary?.match(/UX flow:\s*([^.]+\.)/i)?.[1]
  const flow =
    page?.ux_flow?.filter(Boolean).join(' → ') ||
    summaryUx?.replace(/\.\s*$/, '') ||
    null
  pushAtom(atoms, 'ux_job', copy.screenInsightUxJob, page?.above_fold_job)
  pushAtom(atoms, 'ux_flow', copy.screenInsightUxFlow, flow)
  pushAtom(atoms, 'space', copy.screenInsightUxSpacing, [page?.spacing_feel, page?.alignment].filter(Boolean).join(' · '))
  pushAtom(atoms, 'ux_strengths', copy.screenInsightUxStrengths, page?.ux_strengths?.filter(Boolean).join(' · '))
  pushAtom(atoms, 'ux_risks', copy.screenInsightUxRisks, page?.ux_risks?.filter(Boolean).join(' · '))
  pushAtom(atoms, 'chrome', copy.screenInsightChrome, page?.interaction_chrome)
  return numbered(atoms)
}

function uniqueNames(names: string[], max = 8): string[] {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, max)
}

export function functionalityAtoms(
  input: { ui?: string[]; patterns?: string[]; modules?: string[] } | string[],
  copy: Copy = paths.libraryCopy,
): SpecAtom[] {
  const groups = Array.isArray(input)
    ? { ui: input, patterns: [] as string[], modules: [] as string[] }
    : input
  const atoms: Array<Omit<SpecAtom, 'index'>> = []
  pushAtom(atoms, 'functionality', copy.screenInsightFunctionalityItem, uniqueNames(groups.ui ?? []).join(' · '))
  pushAtom(
    atoms,
    'functionality',
    copy.screenInsightFunctionalityPattern,
    uniqueNames(groups.patterns ?? []).join(' · '),
  )
  pushAtom(
    atoms,
    'functionality',
    copy.screenInsightFunctionalityModules,
    uniqueNames(groups.modules ?? []).join(' · '),
  )
  return numbered(atoms)
}

function usefulNotes(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (/^crop\s/i.test(trimmed) || /^vision band$/i.test(trimmed)) return null
  if (/^(none|n\/a|null)$/i.test(trimmed)) return null
  return trimmed
}

function stubStackSummary(value: string | null | undefined): boolean {
  return /^\w[\w-]* band\s*·/i.test((value ?? '').trim())
}

function visionFromLook(item: SectionLookItem | null | undefined): NonNullable<SectionLookItem['gaps']>['vision_section'] {
  const stored = item?.gaps?.vision_section
  if (stored?.composition || stored?.media_subject || stored?.atmosphere) return stored
  const blob = stripVisionDetectedPreamble(item?.interpretation)
  if (!blob) return null
  const field = (label: string) =>
    blob.match(new RegExp(`${label}:\\s*([^]*?)(?=\\s+(?:Atmosphere|Media|Overlay|CTA):|$)`, 'i'))?.[1]?.trim()
  const composition =
    field('Vision') ||
    blob
      .split(/\s+(?:Atmosphere|Media|Overlay|CTA):/i)[0]
      ?.trim()
  return {
    composition: usefulNotes(composition),
    atmosphere: usefulNotes(field('Atmosphere')),
    media_subject: usefulNotes(field('Media')),
    overlay: usefulNotes(field('Overlay')),
    cta_chrome: usefulNotes(field('CTA')),
  }
}

export function sectionSpecAtoms(
  item: SectionLookItem | null | undefined,
  desc: SectionDescription | null | undefined,
  copy: Copy = paths.libraryCopy,
): SpecAtom[] {
  const atoms: Array<Omit<SpecAtom, 'index'>> = []
  const gaps = item?.gaps
  const vision = visionFromLook(item)
  const overlay =
    usefulNotes(desc?.overlay?.notes) ||
    usefulNotes(gaps?.overlay?.notes) ||
    (desc?.overlay?.present ? desc.overlay.kind : null) ||
    usefulNotes(vision?.overlay)
  const typeNotes = [
    desc?.alignment?.text ? `Text ${desc.alignment.text}` : '',
    gaps?.alignment?.text ? `Text ${gaps.alignment.text}` : '',
    ...(desc?.typography_emphasis ?? gaps?.typography_emphasis ?? []),
  ]
    .filter(Boolean)
    .join(' · ')
  const spaceNotes = [
    desc?.layout?.notes,
    desc?.spacing?.notes,
    desc?.layout?.mode,
    gaps?.layout?.notes,
    gaps?.spacing?.notes,
    vision?.atmosphere,
  ]
    .filter(Boolean)
    .join(' · ')
  const roles = [...(desc?.role_notes ?? []), ...(gaps?.role_notes ?? [])]
    .map((note) => `${note.role}: ${note.notes}`.trim())
    .filter((line) => line.length > 3)
    .join(' · ')
  const stack =
    (desc?.stack_summary && !stubStackSummary(desc.stack_summary) ? desc.stack_summary : null) ||
    (vision?.visible_text?.length ? vision.visible_text.join(' · ') : null) ||
    roles
  const look =
    usefulNotes(stripVisionDetectedPreamble(desc?.look_summary)) ||
    usefulNotes(vision?.composition) ||
    stripVisionDetectedPreamble(item?.interpretation)

  pushAtom(atoms, 'functionality', copy.screenInsightFunctionality, stack)
  pushAtom(atoms, 'type_image', copy.screenInsightTypeImage, overlay || usefulNotes(vision?.composition))
  pushAtom(atoms, 'type', copy.screenInsightTypeCraft, typeNotes)
  pushAtom(
    atoms,
    'imagery',
    copy.screenInsightImagery,
    usefulNotes(desc?.media?.notes) || usefulNotes(vision?.media_subject),
  )
  pushAtom(atoms, 'space', copy.screenInsightSpace, spaceNotes || usefulNotes(desc?.color_notes) || usefulNotes(gaps?.color_notes))
  pushAtom(atoms, 'chrome', copy.screenInsightChrome, desc?.interaction_summary || usefulNotes(vision?.cta_chrome))
  if (!atoms.length) {
    pushAtom(atoms, 'functionality', copy.screenInsightFunctionality, look)
  } else if (look && look !== atoms.find((atom) => atom.id === 'type_image')?.value) {
    pushAtom(atoms, 'rebuild', copy.screenInsightSectionLook, look, true)
  }
  return numbered(atoms)
}

export function pageFlowFromItems(
  items: Array<{ kind?: string; section_label?: string | null; label?: string | null; name?: string | null; signature?: string | null; step_index?: number | null }>,
): Array<{ section_label?: string; signature?: string | null }> {
  return items
    .filter((item) => item.kind === 'page_flow')
    .sort((a, b) => (a.step_index ?? 0) - (b.step_index ?? 0))
    .map((item) => ({
      section_label: item.section_label || item.label || item.name || undefined,
      signature: item.signature ?? null,
    }))
    .filter((step) => step.section_label)
}
