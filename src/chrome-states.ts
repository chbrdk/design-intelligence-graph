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
  haspopup?: string | null;
  href?: string | null;
}): ChromeStateKind | null {
  const blob = `${input.text} ${input.ariaLabel ?? ""} ${input.role ?? ""}`.toLowerCase();
  if (/cookie|consent|akzeptieren|accept all|datenschutz/.test(blob)) return null;
  if (/search|suche|suchen/.test(blob)) return "search_overlay";
  if (/cart|bag|warenkorb|basket|checkout/.test(blob)) return "cart_drawer";
  if (
    /account|login|sign in|anmelden|profil|mein porsche|my account|my porsche menu|open the my porsche/.test(blob)
  ) {
    return "account_drawer";
  }
  if (/language|sprache|region|land oder region|deutschland|country|locale|de-de|en-us/.test(blob)) {
    return "lang_switcher";
  }
  if (/menu|menü|navigation|modelle|models|produkte|shop|hamburger|burger/.test(blob)) {
    if (
      (/menu|menü|hamburger|burger|navigation/.test(blob) && (input.role === "button" || input.tag === "button")) ||
      input.haspopup === "dialog"
    ) {
      return "mobile_nav";
    }
    return "nav_menu";
  }
  if (input.haspopup === "dialog" && (input.role === "button" || input.tag === "button")) {
    return "mobile_nav";
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

    function visible(el: Element): boolean {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 6 && rect.height > 6 && rect.bottom > 0 && rect.top < 160;
    }

    /** Walk open shadow roots — Porsche chrome lives in `phn-header` shadow trees. */
    function deepInteractive(root: ParentNode = document.documentElement): Element[] {
      const found: Element[] = [];
      const stack: Array<ParentNode | Element> = [root];
      while (stack.length && found.length < 220) {
        const node = stack.pop();
        if (!node) continue;
        const children = "children" in node ? [...node.children] : [];
        for (const el of children) {
          const tag = el.tagName;
          const interactive =
            tag === "A" ||
            tag === "BUTTON" ||
            tag === "SUMMARY" ||
            el.getAttribute("role") === "button" ||
            el.getAttribute("role") === "tab" ||
            el.hasAttribute("aria-haspopup") ||
            el.getAttribute("aria-expanded") === "false" ||
            el.getAttribute("type") === "search";
          if (interactive) found.push(el);
          if (el.shadowRoot) stack.push(el.shadowRoot);
          stack.push(el);
        }
      }
      return found;
    }

    function hostBlob(el: Element): string {
      const parts: string[] = [];
      let node: Element | null = el;
      for (let depth = 0; depth < 7 && node; depth += 1) {
        parts.push(((node as HTMLElement).innerText || node.textContent || "").slice(0, 80));
        parts.push(node.getAttribute("aria-label") || "");
        parts.push(node.tagName);
        parts.push(String((node as HTMLElement).className || ""));
        const root = node.getRootNode();
        node = root instanceof ShadowRoot ? root.host : node.parentElement;
      }
      return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 240).toLowerCase();
    }

    function inChromeHost(el: Element): boolean {
      let node: Element | null = el;
      for (let depth = 0; depth < 10 && node; depth += 1) {
        const tag = node.tagName.toLowerCase();
        if (
          tag === "header" ||
          tag === "nav" ||
          tag === "phn-header" ||
          tag.startsWith("phn-") ||
          node.getAttribute("role") === "banner"
        ) {
          return true;
        }
        const root = node.getRootNode();
        node = root instanceof ShadowRoot ? root.host : node.parentElement;
      }
      return false;
    }

    function classify(el: Element): { kind: string; score: number; trigger: "click" | "hover"; label: string } | null {
      if (!visible(el)) return null;
      const text = ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
      const aria = el.getAttribute("aria-label") || "";
      const role = (el.getAttribute("role") || "").toLowerCase();
      const tag = el.tagName.toLowerCase();
      const haspopup = (el.getAttribute("aria-haspopup") || "").toLowerCase();
      const blob = hostBlob(el);
      if (/cookie|consent|akzeptieren|accept all|datenschutz|cmp|uc-/.test(blob)) return null;
      if (/porsche\.com$/.test((aria || text).trim().toLowerCase()) && tag === "a") return null;

      const label = (text || aria || "").replace(/\s+/g, " ").trim().slice(0, 80);

      if (/search|suche|suchen/.test(blob) || el.getAttribute("type") === "search") {
        return { kind: "search_overlay", score: 0.9, trigger: "click", label: label || "Search" };
      }
      if (/cart|bag|warenkorb|basket/.test(blob)) {
        return { kind: "cart_drawer", score: 0.88, trigger: "click", label: label || "Cart" };
      }
      if (/account|login|sign in|anmelden|profil|mein porsche|my porsche menu|open the my porsche/.test(blob)) {
        return { kind: "account_drawer", score: 0.9, trigger: "click", label: label || "Account" };
      }
      if (/language|sprache|region|land oder region|locale|country|deutschland|english/.test(blob)) {
        return { kind: "lang_switcher", score: 0.85, trigger: "click", label: label || "Region" };
      }
      if (/filter|filt|sortier/.test(blob)) {
        return { kind: "filter_drawer", score: 0.75, trigger: "click", label: label || "Filter" };
      }
      if (role === "tab") return { kind: "tab_panel", score: 0.7, trigger: "click", label: label || "Tab" };
      if (tag === "summary") return { kind: "accordion", score: 0.65, trigger: "click", label: label || "Accordion" };

      const popupOpenable = haspopup === "true" || haspopup === "menu" || haspopup === "dialog";
      const expandedClosed = el.getAttribute("aria-expanded") === "false";
      if (popupOpenable || expandedClosed) {
        if (/burger|menu|menü|hamburger|navigation/.test(blob) || haspopup === "dialog") {
          const kind =
            /modelle|models|produkte/.test(blob) && !/menu|menü|burger|hamburger/.test(blob)
              ? "nav_menu"
              : "mobile_nav";
          return {
            kind,
            score: inChromeHost(el) ? 0.96 : 0.8,
            trigger: "click",
            label: label || (kind === "mobile_nav" ? "Menü" : "Nav")
          };
        }
        if (/modelle|models|produkte|shop|fahrzeuge/.test(blob) || role === "button" || tag === "button") {
          return {
            kind: "nav_menu",
            score: inChromeHost(el) ? 0.92 : 0.7,
            trigger: inChromeHost(el) ? "hover" : "click",
            label: label || "Nav"
          };
        }
      }
      if (inChromeHost(el) && (tag === "a" || tag === "button" || role === "button")) {
        if (/modelle|models|fahrzeuge|produkte/.test(blob)) {
          return { kind: "nav_menu", score: 0.84, trigger: "hover", label: label || "Modelle" };
        }
      }
      return null;
    }

    const roots: ParentNode[] = [document.documentElement];
    const headerHost = document.querySelector("phn-header, header, [role='banner']");
    if (headerHost?.shadowRoot) roots.unshift(headerHost.shadowRoot);
    if (headerHost) roots.unshift(headerHost);

    const seen = new Set<Element>();
    for (const root of roots) {
      for (const el of deepInteractive(root)) {
        if (seen.has(el)) continue;
        seen.add(el);
        const hit = classify(el);
        if (!hit) continue;
        const stamp = `digchs_${Math.random().toString(36).slice(2, 10)}`;
        el.setAttribute("data-dig-chrome-id", stamp);
        out.push({
          kind: hit.kind,
          selector: `[data-dig-chrome-id="${stamp}"]`,
          label: hit.label,
          trigger: hit.trigger,
          score: hit.score
        });
        if (out.length >= 40) break;
      }
      if (out.length >= 40) break;
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
    function deepElements(root: ParentNode = document.documentElement): Element[] {
      const found: Element[] = [];
      const stack: Array<ParentNode | Element> = [root];
      while (stack.length && found.length < 400) {
        const node = stack.pop();
        if (!node) continue;
        const children = "children" in node ? [...node.children] : [];
        for (const el of children) {
          found.push(el);
          if (el.shadowRoot) stack.push(el.shadowRoot);
          stack.push(el);
        }
      }
      return found;
    }

    const all = deepElements();
    const panels = all.filter((el) => {
      const role = (el.getAttribute("role") || "").toLowerCase();
      const tag = el.tagName.toLowerCase();
      const cls = String((el as HTMLElement).className || "").toLowerCase();
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (rect.width < 80 || rect.height < 120) return false;
      if (/cookie|consent|uc-/.test(tag + cls + (el.id || ""))) return false;
      return (
        role === "dialog" ||
        role === "menu" ||
        el.getAttribute("aria-modal") === "true" ||
        /drawer|flyout|mega|overlay|navigation-drawer|menu/.test(tag + " " + cls)
      );
    });
    const panel =
      panels.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] ?? null;
    const scanRoots: ParentNode[] = panel ? [panel, ...(panel.shadowRoot ? [panel.shadowRoot] : [])] : [];
    if (!panel) {
      // Fallback: header host often keeps the open drawer in its shadow tree.
      const header = document.querySelector("phn-header, header, [role='banner']");
      if (header?.shadowRoot) scanRoots.push(header.shadowRoot);
      scanRoots.push(document.body);
    }

    const links: Array<{ text: string; href: string | null }> = [];
    for (const root of scanRoots) {
      for (const el of deepElements(root)) {
        const tag = el.tagName;
        if (tag !== "A" && tag !== "BUTTON" && el.getAttribute("role") !== "menuitem") continue;
        const text = ((el as HTMLElement).innerText || el.getAttribute("aria-label") || "")
          .replace(/\s+/g, " ")
          .trim();
        if (!text || text.length > 80) continue;
        if (/cookie|consent|akzeptieren|datenschutz/.test(text.toLowerCase())) continue;
        const href = el instanceof HTMLAnchorElement ? el.getAttribute("href") : null;
        links.push({ text: text.slice(0, 80), href });
        if (links.length >= 40) break;
      }
      if (links.length >= 40) break;
    }

    const open_labels = [...new Set(links.map((item) => item.text))].slice(0, 24);
    const panel_hint = panel
      ? `${panel.tagName.toLowerCase()}.${String((panel as HTMLElement).className || "")
          .split(/\s+/)
          .slice(0, 3)
          .join(".")}`.slice(0, 120)
      : open_labels.length
        ? "shadow_chrome_open"
        : null;
    return {
      open_labels,
      open_links: links.slice(0, 24),
      panel_hint
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
    let locator = page.locator(candidate.selector);
    try {
      let count = await locator.count();
      if (count !== 1 && candidate.label) {
        // Shadow-hosted controls are often easier by accessible name (Porsche Menü).
        const byRole = page.getByRole("button", { name: candidate.label, exact: false });
        if ((await byRole.count()) === 1) {
          locator = byRole;
          count = 1;
        } else {
          const byLink = page.getByRole("link", { name: candidate.label, exact: false });
          if ((await byLink.count()) === 1) {
            locator = byLink;
            count = 1;
          }
        }
      }
      if (count !== 1) {
        warnings.push(`chrome_target_not_unique:${candidate.kind}:${count}`);
        continue;
      }
      if (candidate.trigger === "hover") {
        await locator.hover({ timeout: 2500 }).catch(async () => {
          await locator.hover({ timeout: 2500, force: true });
        });
      } else {
        await locator.click({ timeout: 2500 }).catch(async () => {
          await locator.click({ timeout: 2500, force: true });
        });
      }
      await sleep(650);
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
