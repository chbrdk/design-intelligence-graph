/**
 * Lightweight repair for LLM JSON (truncated arrays/objects, trailing commas, smart quotes).
 * Zero dependency — good enough for DIG stage responses.
 */

export function extractJsonObjectLoose(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  if (start < 0) throw new Error("LLM response did not contain a JSON object");
  let slice = candidate.slice(start);
  const end = slice.lastIndexOf("}");
  if (end > 0) slice = slice.slice(0, end + 1);

  const attempts = [slice, repairJsonText(slice), closeTruncatedJson(repairJsonText(slice))];
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (error) {
      lastError = error;
    }
  }

  const recovered = recoverDesignSynthesisSkeleton(candidate);
  if (recovered) return recovered;
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function repairJsonText(input: string): string {
  return input
    .replace(/,\s*([\]}])/g, "$1")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/ co /g, " ")
    .replace(/\n/g, " ");
}

/** Close dangling braces/brackets and unterminated strings after truncation. */
export function closeTruncatedJson(input: string): string {
  let text = input.trim();
  // Drop a trailing incomplete key/value fragment after the last complete comma-separated item.
  text = text.replace(/,\s*"[^"]*$/g, "");
  text = text.replace(/,\s*\{[^}]*$/g, "");
  text = text.replace(/:\s*"[^"]*$/g, ':""');

  let inString = false;
  let escape = false;
  const stack: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      if (stack.length && stack[stack.length - 1] === ch) stack.pop();
    }
  }
  if (inString) text += '"';
  while (stack.length) text += stack.pop();
  return repairJsonText(text);
}

/** Last-resort: pull design_summary string even when hypotheses array is mangled. */
export function recoverDesignSynthesisSkeleton(raw: string): { design_summary: string; hypotheses: unknown[] } | null {
  const summaryMatch =
    raw.match(/"design_summary"\s*:\s*"((?:\\.|[^"\\])*)"/) ??
    raw.match(/"design_summary"\s*:\s*'((?:\\.|[^'\\])*)'/);
  if (!summaryMatch?.[1]) return null;
  const design_summary = summaryMatch[1]
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .trim();
  if (design_summary.length < 40) return null;
  return {
    design_summary,
    hypotheses: [
      {
        category: "page_archetype",
        value: "recovered_from_partial_json",
        confidence: 0.55,
        rationale: "Synthesize JSON was truncated; summary recovered, hypotheses placeholder.",
        evidence_refs: ["synthesize_json_repair"]
      }
    ]
  };
}
