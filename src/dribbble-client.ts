/**
 * Dribbble API v2 client — authenticated user shots only (no scrape).
 */
import { dribbbleConfig } from "./runtime-paths.js";

export type DribbbleShot = {
  id: number;
  title: string;
  description: string | null;
  html_url: string;
  images: { hidpi?: string | null; normal?: string | null; teaser?: string | null };
  width?: number;
  height?: number;
};

export async function dribbbleApiGet<T>(
  path: string,
  accessToken: string,
  root = process.cwd()
): Promise<T> {
  const cfg = dribbbleConfig(root);
  const url = `${cfg.apiBase}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`dribbble_api_${response.status}`);
  }
  return (await response.json()) as T;
}

export async function listDribbbleUserShots(
  accessToken: string,
  options: { page?: number; perPage?: number } = {},
  root = process.cwd()
): Promise<DribbbleShot[]> {
  const cfg = dribbbleConfig(root);
  const page = options.page ?? 1;
  const perPage = Math.min(cfg.pageSize, options.perPage ?? cfg.pageSize);
  return dribbbleApiGet<DribbbleShot[]>(
    `/user/shots?page=${page}&per_page=${perPage}`,
    accessToken,
    root
  );
}

export async function fetchDribbbleUser(
  accessToken: string,
  root = process.cwd()
): Promise<{ username?: string; name?: string }> {
  return dribbbleApiGet<{ username?: string; name?: string }>("/user", accessToken, root);
}

export async function downloadDribbbleImage(imageUrl: string, root = process.cwd()): Promise<Buffer> {
  const cfg = dribbbleConfig(root);
  const host = new URL(imageUrl).hostname.toLowerCase();
  const allowed = cfg.imageHostSuffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
  if (!allowed) {
    throw new Error("dribbble_image_host_not_allowed");
  }
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`dribbble_image_download_${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
