/**
 * Detect CMP / cookie-consent chrome so look + vision budgets skip it.
 * Complements capture-time dismiss (src/cookie-banner-dismiss.ts).
 */

const CONSENT_TEXT_RE =
  /cookie|cookies|einwilligung|consent|zustimmung|datenschutz.*einstell|ihre cookie|cookie einstellungen|alle akzeptieren|accept all|accept cookies|manage cookies|preferenc(e|es).*cookie|tracking.*(akzept|accept)|zwecke|privatsphäre|gdpr|cmp/i;

export function isConsentOverlayText(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return CONSENT_TEXT_RE.test(text);
}

export function isConsentOverlaySection(input: {
  category?: string | null;
  taxonomy_id?: string | null;
  signature?: string | null;
  text_signals?: string[] | null;
  look_summary?: string | null;
  stack_summary?: string | null;
  role_notes?: Array<{ role?: string; notes?: string }> | null;
}): boolean {
  const taxonomy = (input.taxonomy_id ?? "").toLowerCase();
  if (taxonomy.includes("cookie") || taxonomy.includes("consent")) return true;
  const category = (input.category ?? "").toLowerCase();
  if (category.includes("cookie") || category === "consent") return true;

  const blobs = [
    ...(input.text_signals ?? []),
    input.look_summary ?? "",
    input.stack_summary ?? "",
    ...(input.role_notes ?? []).flatMap((note) => [note.role ?? "", note.notes ?? ""])
  ];
  if (blobs.some((blob) => isConsentOverlayText(blob))) return true;
  return false;
}
