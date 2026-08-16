/**
 * Chrome / overlay open-state capture — nav menus, search, drawers, accordions, tabs.
 * Complements hover/focus in states.ts: we deliberately open transient UI chrome,
 * screenshot + extract IA labels, then restore (Escape / toggle / outside click).
 */

import type { Page } from "playwright";
import { createHash } from "node:crypto";
import { writeArtifact } from "./io.js";
import { loadDigPaths } from "./runtime-paths.js";
import { screenshotOptions, screenshotSettings } from "./screenshot-settings.js";
import type { ArtifactReference } from "./types.js";

export const CHROME_STATES_VERSION = "0.1.0";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export type ChromeStateKind =
  | "nav_menu"
  | "mobile_nav"
  | "search_overlay"
  | "account_drawer"
  | "cart_drawer"
  | "lang_switcher"
  | "accordion"
  | "tab_panel"
  | "filter_drawer";

export interface ChromeStateCandidate {
  kind: ChromeStateKind;
  selector: string;
  label: string;
  trigger: "click" | "hover";
  score: number;
}

export interface ChromeStateRecord {
  chrome_state_id: string;
  kind: ChromeStateKind;
  label: string;
  trigger: { action: "click" | "hover"; selector: string };
  open_labels: string[];
  open_links: Array<{ text: string; href: string | null }>;
  panel_hint: string | null;
  screenshot: ArtifactReference;
  restoration: { attempted: true; successful: boolean };
  captured_at: string;
  provenance: { layer: "L1"; method: "chrome_state_open"; confidence: number };
}

export interface ChromeStatesDocument {
  schema_version: "0.1.0";
  chrome_states_version: typeof CHROME_STATES_VERSION;
  generated_at: string;
  policy: "safe_open_restore_chrome";
  max_opens: number;
  states: ChromeStateRecord[];
}

const KIND_PRIORITY: ChromeStateKind[] = [
  "nav_menu",
  "mobile_nav",
  "search_overlay",
  "account_drawer",
  "cart_drawer",
  "lang_switcher",
  "filter_drawer",
  "tab_panel",
  "accordion"
];

export function chromeStatesMaxOpens(environment: NodeJS.ProcessEnv = process.env): number {
  const fromEnv = Number(environment.DIG_CHROME_STATES_MAX);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return Math.floor(fromEnv);
  const fromPaths = Number(loadDigPaths().chromeStates?.maxOpens ?? 4);
  return Number.isFinite(fromPaths) && fromPaths >= 0 ? Math.floor(fromPaths) : 4;
}

export function rankChromeCandidates(
  candidates: ChromeStateCandidate[],
  maxOpens = chromeStatesMaxOpens()
): ChromeStateCandidate[] {
  const seenKinds = new Set<ChromeStateKind>();
  const ordered = [...candidates].sort((a, b) => {
    const pa = KIND_PRIORITY.indexOf(a.kind);
    const pb = KIND_PRIORITY.indexOf(b.kind);
    return pa - pb || b.score - a.score;
  });
  const picked: ChromeStateCandidate[] = [];
  for (const candidate of ordered) {
    if (seenKinds.has(candidate.kind)) continue;
    seenKinds.add(candidate.kind);
    picked.push(candidate);
    if (picked.length >= maxOpens) break;
  }
  return picked;
}

/** Pure helper for tests — mirrors browser discovery heuristics in compressed form. */
export function classifyChromeTrigger(input: {
  text: string;
  ariaLabel?: string;
  role?: string;
  tag?: string;
  expanded?: string | null;
  href?: string | null;
}): ChromeStateKind | null {
  const blob = `${input.text} ${input.ariaLabel ?? ""} ${input.role ?? ""}`.toLowerCase();
  if (/cookie|consent|akzeptieren|accept all|datenschutz/.test(blob)) return null;
  if (/search|suche|suchen/.test(blob)) return "search_overlay";
  if (/cart|bag|warenkorb|basket|checkout/.test(blob)) return "cart_drawer";
  if (/account|login|sign in|anmelden|profil|mein porsche|my account/.test(blob)) return "account_drawer";
  if (/language|sprache|region|deutschland|country|locale|de-de|en-us/.test(blob)) return "lang_switcher";
  if (/menu|menü|navigation|modelle|models|produkte|shop|hamburger/.test(blob)) {
    if (/menu|menü|hamburger|navigation/.test(blob) && (input.role === "button" || input.tag === "button")) {
      return "mobile_nav";
    }
    return "nav_menu";
  }
  if (/filter|filt|sortier/.test(blob)) return "filter_drawer";
  if (input.role === "tab" || input.tag === "summary") return input.tag === "summary" ? "accordion" : "tab_panel";
  if (input.expanded === "false" || input.expanded === "true") {
    if (/faq|accordion|mehr erfahren/.test(blob)) return "accordion";
  }
  return null;
}

async function discoverCandidates(page: Page): Promise<ChromeStateCandidate[]> {
  return page.evaluate(() => {
    const out: Array<{
      kind: string;
      selector: string;
      label: string;
      trigger: "click" | "hover";
      score: number;
    }> = [];

    function cssPath(el: Element): string {
      if ((el as HTMLElement).id) return `#${CSS.escape((el as HTMLElement).id)}`;
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && parts.length < 6) {
        const parent: Element | null = node.parentElement;
        const tag = node.tagName.toLowerCase();
        if (!parent) {
          parts.unshift(tag);
          break;
        }
        const siblings = [...parent.children].filter((child) => child.tagName === node!.tagName);
        const index = siblings.indexOf(node) + 1;
        parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
        node = parent;
      }
      return parts.join(" > ");
    }

    function visible(el: Element): boolean {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 8 && rect.height > 8 && rect.bottom > 0 && rect.top < innerHeight + 40;
    }

    function classify(el: Element): { kind: string; score: number; trigger: "click" | "hover" } | null {
      const text = ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const role = (el.getAttribute("role") || "").toLowerCase();
      const tag = el.tagName.toLowerCase();
      const blob = `${text} ${aria} ${role} ${el.className}`.toLowerCase();
      if (/cookie|consent|akzeptieren|accept all|datenschutz|cmp/.test(blob)) return null;
      if (!visible(el)) return null;

      if (/search|suche|suchen/.test(blob) || el.getAttribute("type") === "search") {
        return { kind: "search_overlay", score: 0.9, trigger: "click" };
      }
      if (/cart|bag|warenkorb|basket/.test(blob)) return { kind: "cart_drawer", score: 0.88, trigger: "click" };
      if (/account|login|sign in|anmelden|profil|mein\s/.test(blob)) {
        return { kind: "account_drawer", score: 0.86, trigger: "click" };
      }
      if (/language|sprache|region|locale|country|deutschland|english/.test(blob)) {
        return { kind: "lang_switcher", score: 0.8, trigger: "click" };
      }
      if (/filter|filt|sortier/.test(blob)) return { kind: "filter_drawer", score: 0.75, trigger: "click" };
      if (role === "tab") return { kind: "tab_panel", score: 0.7, trigger: "click" };
      if (tag === "summary") return { kind: "accordion", score: 0.65, trigger: "click" };
      if (
        el.getAttribute("aria-expanded") === "false" ||
        el.getAttribute("aria-haspopup") === "true" ||
        el.getAttribute("aria-haspopup") === "menu"
      ) {
        if (/menu|menü|nav|modelle|models|produkte|shop/.test(blob) || role === "button" || tag === "button") {
          const inHeader = Boolean(el.closest("header, [role='banner'], nav"));
          const kind = /menu|menü|hamburger|navigation/.test(blob) && !/modelle|models|produkte/.test(blob)
            ? "mobile_nav"
            : "nav_menu";
          return { kind, score: inHeader ? 0.95 : 0.7, trigger: kind === "nav_menu" && inHeader ? "hover" : "click" };
        }
      }
      if (inHeaderLike(el) && (tag === "a" || tag === "button" || role === "button") && /modelle|models|fahrzeuge|shop|produkte/.test(blob)) {
        return { kind: "nav_menu", score: 0.84, trigger: "hover" };
      }
      return null;
    }

    function inHeaderLike(el: Element): boolean {
      return Boolean(el.closest("header, [role='banner'], nav, [class*='header' i], [class*='nav' i]"));
    }

    const nodes = document.querySelectorAll(
      "header a, header button, header [role='button'], nav a, nav button, [role='banner'] a, [role='banner'] button, button, [role='button'], summary, [role='tab'], [aria-haspopup], [aria-expanded='false']"
    );
    for (const el of [...nodes].slice(0, 120)) {
      const hit = classify(el);
      if (!hit) continue;
      const label = ((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.tagName)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      out.push({
        kind: hit.kind,
        selector: cssPath(el),
        label: label || hit.kind,
        trigger: hit.trigger,
        score: hit.score
      });
    }
    return out;
  }) as Promise<ChromeStateCandidate[]>;
}

async function extractOpenPanel(page: Page): Promise<{
  open_labels: string[];
  open_links: Array<{ text: string; href: string | null }>;
  panel_hint: string | null;
}> {
  return page.evaluate(() => {
    const panels = [
      ...document.querySelectorAll(
        "[role='menu'], [role='dialog'], [aria-modal='true'], nav[data-open], .is-open, .is-active, [class*='mega' i], [class*='drawer' i], [class*='overlay' i]:not([class*='cookie' i])"
      )
    ].filter((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 40 && rect.height > 40;
    });
    const panel = panels.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] ?? null;
    const root = panel ?? document.body;
    const links = [...root.querySelectorAll("a, button, [role='menuitem']")]
      .slice(0, 40)
      .map((el) => {
        const text = ((el as HTMLElement).innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
        const href = el instanceof HTMLAnchorElement ? el.getAttribute("href") : null;
        return { text: text.slice(0, 80), href };
      })
      .filter((item) => item.text.length > 0);
    const open_labels = [...new Set(links.map((item) => item.text))].slice(0, 24);
    return {
      open_labels,
      open_links: links.slice(0, 24),
      panel_hint: panel
        ? `${panel.tagName.toLowerCase()}.${(panel.className || "").toString().split(/\s+/).slice(0, 3).join(".")}`.slice(0, 120)
        : null
    };
  });
}

async function restoreChrome(page: Page, selector: string): Promise<boolean> {
  try {
    await page.keyboard.press("Escape");
    await sleep(200);
    const stillOpen = await page.evaluate(() => {
      const open = document.querySelector("[aria-expanded='true'], [aria-modal='true'], .is-open");
      if (!open) return false;
      const rect = open.getBoundingClientRect();
      return rect.width > 40 && rect.height > 40;
    });
    if (!stillOpen) return true;
    const locator = page.locator(selector);
    if ((await locator.count()) === 1) {
      await locator.click({ timeout: 1500 }).catch(() => undefined);
      await sleep(200);
    }
    await page.mouse.click(4, 4).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

export async function captureChromeStates(
  page: Page,
  packageRoot: string,
  viewportPrefix: string,
  options: { maxOpens?: number } = {}
): Promise<{
  document: ChromeStatesDocument;
  artifact: ArtifactReference;
  records: ChromeStateRecord[];
  warnings: string[];
}> {
  const maxOpens = options.maxOpens ?? chromeStatesMaxOpens();
  const warnings: string[] = [];
  const records: ChromeStateRecord[] = [];
  if (maxOpens <= 0) {
    const empty = emptyDoc(maxOpens);
    const artifact = await writeArtifact(
      packageRoot,
      `${viewportPrefix}/chrome-states/index.json`,
      JSON.stringify(empty, null, 2),
      "application/json"
    );
    return { document: empty, artifact, records: [], warnings: ["chrome_states_disabled"] };
  }

  let discovered: ChromeStateCandidate[] = [];
  try {
    discovered = await discoverCandidates(page);
  } catch (error: unknown) {
    warnings.push(`chrome_discover_failed:${error instanceof Error ? error.message : String(error)}`);
  }
  const selected = rankChromeCandidates(discovered, maxOpens);
  const shot = screenshotSettings();
  let sequence = 0;

  for (const candidate of selected) {
    const locator = page.locator(candidate.selector);
    try {
      if ((await locator.count()) !== 1) {
        warnings.push(`chrome_target_not_unique:${candidate.kind}`);
        continue;
      }
      if (candidate.trigger === "hover") {
        await locator.hover({ timeout: 2500 });
      } else {
        await locator.click({ timeout: 2500 });
      }
      await sleep(450);
      const panel = await extractOpenPanel(page);
      if (!panel.open_labels.length && !panel.panel_hint) {
        warnings.push(`chrome_open_empty:${candidate.kind}`);
        await restoreChrome(page, candidate.selector);
        continue;
      }
      sequence += 1;
      const bytes = await page.screenshot(screenshotOptions(false));
      const relative = `${viewportPrefix}/chrome-states/${candidate.kind}_${sequence}${shot.extension}`;
      const screenshot = await writeArtifact(packageRoot, relative, bytes, shot.mediaType);
      const restorationOk = await restoreChrome(page, candidate.selector);
      const idSeed = `${candidate.kind}|${candidate.selector}|${sequence}`;
      records.push({
        chrome_state_id: `chs_${createHash("sha256").update(idSeed).digest("hex").slice(0, 16)}`,
        kind: candidate.kind,
        label: candidate.label,
        trigger: { action: candidate.trigger, selector: candidate.selector },
        open_labels: panel.open_labels,
        open_links: panel.open_links,
        panel_hint: panel.panel_hint,
        screenshot,
        restoration: { attempted: true, successful: restorationOk },
        captured_at: new Date().toISOString(),
        provenance: { layer: "L1", method: "chrome_state_open", confidence: candidate.score }
      });
    } catch (error: unknown) {
      warnings.push(`chrome_open_failed:${candidate.kind}:${error instanceof Error ? error.message : String(error)}`);
      await restoreChrome(page, candidate.selector).catch(() => undefined);
    }
  }

  const document: ChromeStatesDocument = {
    schema_version: "0.1.0",
    chrome_states_version: CHROME_STATES_VERSION,
    generated_at: new Date().toISOString(),
    policy: "safe_open_restore_chrome",
    max_opens: maxOpens,
    states: records
  };
  const artifact = await writeArtifact(
    packageRoot,
    `${viewportPrefix}/chrome-states/index.json`,
    JSON.stringify(document, null, 2),
    "application/json"
  );
  // Also mirror a package-level rollup for desktop-first consumers.
  if (viewportPrefix.includes("desktop")) {
    await writeArtifact(packageRoot, "derived/chrome-states.json", JSON.stringify(document, null, 2), "application/json");
  }
  return { document, artifact, records, warnings };
}

function emptyDoc(maxOpens: number): ChromeStatesDocument {
  return {
    schema_version: "0.1.0",
    chrome_states_version: CHROME_STATES_VERSION,
    generated_at: new Date().toISOString(),
    policy: "safe_open_restore_chrome",
    max_opens: maxOpens,
    states: []
  };
}
