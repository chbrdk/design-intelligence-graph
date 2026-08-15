import { sanitizeUrl } from "./network.js";
import type { MatchableNode } from "./matching.js";

const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction", "poster", "data-src"]);

export function sanitizeStoredUrl(value: string, baseUrl?: string): string {
  try { return sanitizeUrl(baseUrl ? new URL(value, baseUrl).toString() : value); }
  catch { return "[invalid-url]"; }
}

function sanitizeSrcset(value: string, baseUrl: string): string {
  return value.split(",").map((candidate) => {
    const parts = candidate.trim().split(/\s+/, 2);
    const url = parts[0];
    if (!url) return candidate;
    return `${sanitizeStoredUrl(url, baseUrl)}${parts[1] ? ` ${parts[1]}` : ""}`;
  }).join(", ");
}

export function sanitizeNodeRecords(nodes: MatchableNode[], baseUrl: string): MatchableNode[] {
  return nodes.map((node) => {
    if (!node.attributes && !node.source_anchor) return node;
    const attributes = { ...(node.attributes ?? {}) };
    for (const [name, value] of Object.entries(attributes)) {
      if (URL_ATTRIBUTES.has(name)) attributes[name] = sanitizeStoredUrl(value, baseUrl);
      else if (name === "srcset") attributes[name] = sanitizeSrcset(value, baseUrl);
    }
    const sensitiveInput = node.tag === "input" && (
      attributes.type?.toLowerCase() === "password" || /password|one-time-code/i.test(attributes.autocomplete ?? "")
    );
    if (sensitiveInput && "value" in attributes) attributes.value = "[redacted]";
    const sourceAnchor = { ...(node.source_anchor ?? {}) };
    if (sourceAnchor.href) sourceAnchor.href = sanitizeStoredUrl(sourceAnchor.href, baseUrl);
    return { ...node, attributes, source_anchor: sourceAnchor };
  });
}

export function sanitizeDiagnostic(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
    .replace(/\b(api[_-]?key|token|secret|password)=([^\s&]+)/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => sanitizeStoredUrl(url));
}

function sanitizeCssUrls(value: string, baseUrl: string): string {
  return value.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (_match, quote: string, url: string) =>
    `url(${quote}${sanitizeStoredUrl(url, baseUrl)}${quote})`);
}

export function sanitizeEvidenceUrls<T>(value: T, baseUrl: string): T {
  const visit = (item: unknown, key = ""): unknown => {
    if (Array.isArray(item)) return item.map((entry) => visit(entry));
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      if (record.name === "url" && record.value && typeof record.value === "object") {
        const wrappedValue = record.value as Record<string, unknown>;
        if (typeof wrappedValue.value === "string") {
          return { ...record, value: { ...wrappedValue, value: sanitizeStoredUrl(wrappedValue.value, baseUrl) } };
        }
      }
      return Object.fromEntries(Object.entries(record).map(([childKey, child]) => [childKey, visit(child, childKey)]));
    }
    if (typeof item !== "string") return item;
    if (["url", "href", "src", "current_src"].includes(key)) return sanitizeStoredUrl(item, baseUrl);
    if (key === "srcset") return sanitizeSrcset(item, baseUrl);
    if (["css_text", "value", "source"].includes(key) && /url\(/i.test(item)) return sanitizeCssUrls(item, baseUrl);
    return item;
  };
  return visit(value) as T;
}

export function sanitizeHtml(html: string, baseUrl: string): string {
  let sanitized = html.replace(
    /\b(href|src|action|formaction|poster|data-src)\s*=\s*(["'])(.*?)\2/gi,
    (_match, name: string, quote: string, value: string) => `${name}=${quote}${sanitizeStoredUrl(value, baseUrl)}${quote}`
  );
  sanitized = sanitized.replace(/<input\b[^>]*>/gi, (tag) => {
    const sensitive = /\btype\s*=\s*(["'])?password\1?/i.test(tag) ||
      /\bautocomplete\s*=\s*(["'])?(?:current-password|new-password|one-time-code)\1?/i.test(tag);
    if (!sensitive) return tag;
    return tag.replace(/\bvalue\s*=\s*(["'])(.*?)\1/gi, 'value="[redacted]"');
  });
  return sanitized;
}
