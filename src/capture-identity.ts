/**
 * Stable identity for capture URLs so catalogs and skip-existing treat
 * https://www.example.com/ and https://example.com as the same site.
 */
export function captureIdentityKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    let path = url.pathname || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return path === "/" ? host : `${host}${path}`;
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }
}

export function uniqueCaptureUrls(urls: string[]): { urls: string[]; skippedDuplicate: number } {
  const seen = new Set<string>();
  const next: string[] = [];
  let skippedDuplicate = 0;
  for (const raw of urls) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const key = captureIdentityKey(raw);
    if (!key || seen.has(key)) {
      skippedDuplicate += 1;
      continue;
    }
    seen.add(key);
    next.push(raw.trim());
  }
  return { urls: next, skippedDuplicate };
}

export function filterExistingCaptureUrls(
  urls: string[],
  existingKeys: Iterable<string>
): { urls: string[]; skippedExisting: number; skippedDuplicate: number } {
  const existing = new Set(
    [...existingKeys].map((key) => captureIdentityKey(key)).filter(Boolean)
  );
  const seen = new Set<string>();
  const next: string[] = [];
  let skippedExisting = 0;
  let skippedDuplicate = 0;
  for (const raw of urls) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const key = captureIdentityKey(raw);
    if (!key) continue;
    if (existing.has(key)) {
      skippedExisting += 1;
      continue;
    }
    if (seen.has(key)) {
      skippedDuplicate += 1;
      continue;
    }
    seen.add(key);
    next.push(raw.trim());
  }
  return { urls: next, skippedExisting, skippedDuplicate };
}
