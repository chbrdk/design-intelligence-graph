/**
 * Craft-eligibility review / allowlist (Welle 2 D3).
 * Spec: plexon knowledge/spirion-campaign-motif-tickets.md Epic D3
 */

export type CraftReviewPatch = {
  craftEligible: boolean;
  reviewNote: string | null;
};

export function parseCraftReviewPatchBody(body: Record<string, unknown>): CraftReviewPatch | { error: string } {
  const raw =
    typeof body.craftEligible === "boolean"
      ? body.craftEligible
      : typeof body.craft_eligible === "boolean"
        ? body.craft_eligible
        : null;
  if (raw === null) {
    return { error: "craftEligible_required" };
  }
  const noteRaw =
    typeof body.reviewNote === "string"
      ? body.reviewNote
      : typeof body.review_note === "string"
        ? body.review_note
        : null;
  const reviewNote = noteRaw?.trim() ? noteRaw.trim().slice(0, 2000) : null;
  return { craftEligible: raw, reviewNote };
}
