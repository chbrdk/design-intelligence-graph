/**
 * Measured recipe + page flow when the LLM stage returns empty.
 * @see knowledge/design-facets.md
 */
import type { MobbinParityContent } from "./llm-stages.js";
import type { RecipeStep, SectionComposition } from "./section-composition.js";

function gapHint(recipe: RecipeStep[]): string {
  const gaps = recipe.filter((step): step is Extract<RecipeStep, { kind: "gap" }> => step.kind === "gap");
  if (!gaps.length) return "measured stack";
  const px = gaps.map((step) => step.gap_px).filter((value) => Number.isFinite(value));
  if (!px.length) return "measured stack";
  return `gaps ~${Math.round(px.reduce((sum, value) => sum + value, 0) / px.length)}px`;
}

function roleChain(recipe: RecipeStep[]): string {
  const roles = recipe
    .filter((step): step is Extract<RecipeStep, { kind: "role" }> => step.kind === "role")
    .map((step) => step.role)
    .slice(0, 6);
  return roles.length ? roles.join(" → ") : "section stack";
}

export function sectionsFromCompositionDoc(doc: {
  viewports?: Array<{ sections?: SectionComposition[] }>;
}): SectionComposition[] {
  return (doc.viewports ?? []).flatMap((viewport) => viewport.sections ?? []);
}

export function synthesizeRecipeParity(
  sections: SectionComposition[]
): Pick<MobbinParityContent, "recipe_insights" | "page_flow"> {
  const desktopFirst = [...sections].sort((a, b) => {
    if (a.viewport_name === "desktop" && b.viewport_name !== "desktop") return -1;
    if (b.viewport_name === "desktop" && a.viewport_name !== "desktop") return 1;
    return 0;
  });
  const preferred =
    desktopFirst.filter((section) => section.viewport_name === "desktop").length > 0
      ? desktopFirst.filter((section) => section.viewport_name === "desktop")
      : desktopFirst;

  const page_flow = preferred.slice(0, 12).map((section, index) => ({
    step: index + 1,
    section_label: `${section.category} · ${section.signature}`,
    signature: section.signature
  }));

  const seen = new Set<string>();
  const recipe_insights: MobbinParityContent["recipe_insights"] = [];
  for (const section of preferred) {
    const key = `${section.category}|${section.signature}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recipe_insights.push({
      signature: section.signature,
      category: section.category,
      interpretation: `${roleChain(section.recipe)}; ${gapHint(section.recipe)}`.slice(0, 160),
      evidence_refs: [section.taxonomy_id, ...(section.text_signals ?? []).slice(0, 2)]
    });
    if (recipe_insights.length >= 8) break;
  }
  return { recipe_insights, page_flow };
}
