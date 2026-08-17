import { pinterestConfig } from "./runtime-paths.js";

export type PinImageCandidate = {
  url: string;
  width: number;
  height: number;
};

export type PinterestBoard = {
  id: string;
  name: string;
  pin_count?: number;
  privacy?: string;
};

export type PinterestPin = {
  id: string;
  title: string;
  description: string;
  link: string | null;
  board_id: string | null;
  image: PinImageCandidate | null;
};

type PinterestImageEntry = {
  url?: unknown;
  width?: unknown;
  height?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numeric(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function pinPageUrl(pinId: string, root = process.cwd()): string {
  return pinterestConfig(root).pinUrlTemplate.replace("{pin_id}", encodeURIComponent(pinId));
}

export function isAllowedPinImageHost(url: string, root = process.cwd()): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return pinterestConfig(root).imageHostSuffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

export function pickLargestPinImage(media: unknown, root = process.cwd()): PinImageCandidate | null {
  const record = asRecord(media);
  const images = asRecord(record?.images) ?? asRecord(record);
  if (!images) return null;
  let best: PinImageCandidate | null = null;
  let bestArea = 0;
  for (const value of Object.values(images)) {
    const entry = asRecord(value) as PinterestImageEntry | null;
    const url = typeof entry?.url === "string" ? entry.url.trim() : "";
    if (!url || !isAllowedPinImageHost(url, root)) continue;
    const width = numeric(entry?.width);
    const height = numeric(entry?.height);
    const area = width * height || 1;
    if (area >= bestArea) {
      best = { url, width: width || 1, height: height || 1 };
      bestArea = area;
    }
  }
  return best;
}

export function parsePinterestBoard(raw: unknown): PinterestBoard | null {
  const record = asRecord(raw);
  const id = typeof record?.id === "string" ? record.id.trim() : "";
  const name = typeof record?.name === "string" ? record.name.trim() : "";
  if (!id || !name) return null;
  const board: PinterestBoard = { id, name };
  const pinCount = numeric(record?.pin_count);
  if (pinCount) board.pin_count = pinCount;
  if (typeof record?.privacy === "string") board.privacy = record.privacy;
  return board;
}

export function parsePinterestPin(raw: unknown, root = process.cwd()): PinterestPin | null {
  const record = asRecord(raw);
  const id = typeof record?.id === "string" ? record.id.trim() : "";
  if (!id) return null;
  const media = record?.media ?? record;
  return {
    id,
    title: typeof record?.title === "string" ? record.title.trim() : "",
    description: typeof record?.description === "string" ? record.description.trim() : "",
    link: typeof record?.link === "string" && record.link.trim() ? record.link.trim() : null,
    board_id: typeof record?.board_id === "string" ? record.board_id : null,
    image: pickLargestPinImage(media, root)
  };
}

async function pinterestGet(
  accessToken: string,
  pathname: string,
  query: Record<string, string | undefined> = {},
  root = process.cwd()
): Promise<Record<string, unknown>> {
  const cfg = pinterestConfig(root);
  const url = new URL(`${cfg.apiBase}${pathname.startsWith("/") ? pathname : `/${pathname}`}`);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json"
    }
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof body.message === "string" ? body.message : `Pinterest HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

export async function listPinterestBoards(
  accessToken: string,
  root = process.cwd()
): Promise<PinterestBoard[]> {
  const cfg = pinterestConfig(root);
  const boards: PinterestBoard[] = [];
  let bookmark: string | undefined;
  do {
    const page = await pinterestGet(
      accessToken,
      "/boards",
      { page_size: String(cfg.pageSize), bookmark },
      root
    );
    const items = Array.isArray(page.items) ? page.items : [];
    for (const item of items) {
      const board = parsePinterestBoard(item);
      if (board) boards.push(board);
    }
    bookmark = typeof page.bookmark === "string" && page.bookmark ? page.bookmark : undefined;
  } while (bookmark);
  return boards;
}

export async function listPinterestBoardPins(
  accessToken: string,
  boardId: string,
  limit: number,
  root = process.cwd()
): Promise<PinterestPin[]> {
  const cfg = pinterestConfig(root);
  const cap = Math.min(cfg.maxPinsPerImport, Math.max(1, limit));
  const pins: PinterestPin[] = [];
  let bookmark: string | undefined;
  while (pins.length < cap) {
    const page = await pinterestGet(
      accessToken,
      `/boards/${encodeURIComponent(boardId)}/pins`,
      {
        page_size: String(Math.min(cfg.pageSize, cap - pins.length)),
        bookmark
      },
      root
    );
    const items = Array.isArray(page.items) ? page.items : [];
    if (!items.length) break;
    for (const item of items) {
      const pin = parsePinterestPin(item, root);
      if (pin) pins.push(pin);
      if (pins.length >= cap) break;
    }
    bookmark = typeof page.bookmark === "string" && page.bookmark ? page.bookmark : undefined;
    if (!bookmark) break;
  }
  return pins;
}

export async function fetchPinterestUserAccount(
  accessToken: string,
  root = process.cwd()
): Promise<{ username: string | null }> {
  const body = await pinterestGet(accessToken, "/user_account", {}, root);
  return { username: typeof body.username === "string" ? body.username : null };
}

export async function downloadPinImage(imageUrl: string, root = process.cwd()): Promise<Buffer> {
  if (!isAllowedPinImageHost(imageUrl, root)) {
    throw new Error("Pin image host is not allowed");
  }
  const response = await fetch(imageUrl, {
    headers: { accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" }
  });
  if (!response.ok) throw new Error(`Pin image download failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength < 32) throw new Error("Pin image was empty");
  return bytes;
}
