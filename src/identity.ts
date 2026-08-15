import { sha256 } from "./io.js";

const shortHash = (value: string): string => sha256(value).slice("sha256:".length, "sha256:".length + 20);

export function createSiteIdentity(url: string): { site_id: string; domain: string; scheme: string; canonical_origin: string } {
  const parsed = new URL(url);
  return { site_id: `site_${shortHash(parsed.origin)}`, domain: parsed.hostname, scheme: parsed.protocol.slice(0, -1), canonical_origin: parsed.origin };
}

export function createPageIdentity(url: string, siteId: string): { page_id: string; site_id: string; url: string; canonical_url: string; route: string } {
  const parsed = new URL(url);
  return { page_id: `pg_${shortHash(url)}`, site_id: siteId, url, canonical_url: url, route: parsed.pathname };
}
