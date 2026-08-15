/**
 * DIG-012 offline design-reference quality eval (R1/R2/R4; R3 optional later).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  PROMPT_HARD_RULE_MARKERS,
  buildEmbeddingCanonical,
  constraintsFromLook,
  rolesFromSignature,
  type DesignReferenceLike
} from "./design-reference-spec.js";
import type { DesignReferenceRecord } from "./design-reference-emit.js";
import { assemblePromptPackEnvelope } from "./design-prompt-pack.js";
import { loadDigPaths } from "./runtime-paths.js";
import { validateAgainstSchema } from "./flow-schema-validate.js";

export { assemblePromptPackEnvelope } from "./design-prompt-pack.js";

export type DesignReferenceEvalGolden = {
  expected_primary_reference_id: string;
  forbidden_primary_reference_id?: string;
  expected_signature_roles: string[];
  expected_look_keywords: string[];
  expected_token_accent_present?: boolean;
  forbid_source_phrases?: string[];
};

export type DesignReferenceEvalScenario = {
  id: string;
  title: string;
  brief: string;
  corpus: string[];
  golden: DesignReferenceEvalGolden;
  embedding_canonical_golden?: string;
};

export type TrackScore = { id: string; score: number; notes: string[] };

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

export function scoreRetrieval(
  brief: string,
  corpus: Array<DesignReferenceLike & { reference_id: string }>,
  golden: DesignReferenceEvalGolden
): TrackScore {
  const briefTokens = new Set(tokenize(brief));
  const ranked = corpus
    .map((ref) => {
      const hay = [
        ref.taxonomy?.category ?? "",
        ref.composition?.signature ?? "",
        (ref.composition?.roles ?? []).join(" "),
        ref.look?.look_summary ?? "",
        (ref.tokens?.style_labels ?? []).join(" ")
      ]
        .join(" ")
        .toLowerCase();
      let score = 0;
      for (const token of briefTokens) {
        if (hay.includes(token)) score += 1;
      }
      if ((ref.taxonomy?.category ?? "").toLowerCase() === "hero") score += 3;
      if ((ref.look?.look_summary ?? "").toLowerCase().includes("scrim")) score += 2;
      if ((ref.look?.alignment?.cta ?? "") === "center") score += 1;
      return { ref, score };
    })
    .sort((a, b) => b.score - a.score || a.ref.reference_id.localeCompare(b.ref.reference_id));

  const topIds = ranked.map((row) => row.ref.reference_id);
  const primary = topIds[0];
  const notes = [`ranked=${topIds.join(",")}`];
  if (primary === golden.expected_primary_reference_id) {
    return { id: "R1", score: 100, notes };
  }
  if (topIds.slice(0, 3).includes(golden.expected_primary_reference_id)) {
    return { id: "R1", score: 50, notes };
  }
  return { id: "R1", score: 0, notes };
}

export function scorePromptPack(
  brief: string,
  corpus: Array<DesignReferenceLike & { reference_id: string; tokens?: { colors?: Array<{ hex: string; roles?: string[] }> } }>,
  golden: DesignReferenceEvalGolden
): TrackScore {
  const primary =
    corpus.find((ref) => ref.reference_id === golden.expected_primary_reference_id) ?? corpus[0];
  const notes: string[] = [];
  if (!primary) return { id: "R2", score: 0, notes: ["missing corpus"] };

  const pack = assemblePromptPackEnvelope(brief, primary as DesignReferenceRecord, true);
  const serialized = JSON.stringify(pack);
  const sizeOk = serialized.length <= 12_000;
  notes.push(`bytes=${serialized.length}`);

  const rulesJoined = pack.rules.join("\n");
  const markersHit = PROMPT_HARD_RULE_MARKERS.filter((marker) =>
    rulesJoined.toLowerCase().includes(marker.toLowerCase().slice(0, 18))
  );
  notes.push(`markers=${markersHit.length}/${PROMPT_HARD_RULE_MARKERS.length}`);

  const primaryOk = pack.references[0] && (pack.references[0] as { reference_id: string }).reference_id ===
    golden.expected_primary_reference_id;
  notes.push(`primary=${primaryOk}`);

  let score = 0;
  if (primaryOk) score += 40;
  if (sizeOk) score += 20;
  if (markersHit.length >= 3) score += 40;
  else if (markersHit.length >= 1) score += 20;
  return { id: "R2", score, notes };
}

export function scoreLookConditionedMapping(
  corpus: Array<
    DesignReferenceLike & {
      reference_id: string;
      tokens?: { colors?: Array<{ hex: string; roles?: string[] }> };
      composition?: { signature?: string; roles?: string[] };
    }
  >,
  golden: DesignReferenceEvalGolden,
  root = process.cwd()
): TrackScore {
  const primary = corpus.find((ref) => ref.reference_id === golden.expected_primary_reference_id);
  const notes: string[] = [];
  if (!primary) return { id: "R4", score: 0, notes: ["missing primary"] };

  const signature = primary.composition?.signature ?? "";
  const roles = primary.composition?.roles?.length
    ? primary.composition.roles
    : rolesFromSignature(signature);
  const rolesOk = golden.expected_signature_roles.every((role) => roles.includes(role));
  notes.push(`roles=${roles.join(">")}`);

  const constraints = constraintsFromLook(primary, root);
  notes.push(`constraints=${constraints.length}`);

  const accent = (primary.tokens?.colors ?? []).some((color) =>
    (color.roles ?? []).some((role) => role === "accent" || role === "cta")
  );
  notes.push(`accent=${accent}`);

  let score = 0;
  if (rolesOk) score += 40;
  if (constraints.length >= 2) score += 40;
  else if (constraints.length >= 1) score += 20;
  if (golden.expected_token_accent_present) {
    if (accent) score += 20;
  } else {
    score += 20;
  }
  return { id: "R4", score, notes };
}

export async function loadDesignReferenceEvalScenario(
  root = process.cwd()
): Promise<{ scenario: DesignReferenceEvalScenario; corpus: Array<Record<string, unknown>> }> {
  const paths = JSON.parse(await readFile(resolve(root, "knowledge/paths.json"), "utf8")) as {
    taxonomy?: { designReferenceEvalScenario?: string };
  };
  const relative =
    paths.taxonomy?.designReferenceEvalScenario ?? "fixtures/eval/design-reference-hero/scenario.json";
  const scenario = JSON.parse(await readFile(resolve(root, relative), "utf8")) as DesignReferenceEvalScenario;
  const corpus: Array<Record<string, unknown>> = [];
  for (const item of scenario.corpus) {
    corpus.push(JSON.parse(await readFile(resolve(root, item), "utf8")) as Record<string, unknown>);
  }
  return { scenario, corpus };
}

export async function runDesignReferenceEval(root = process.cwd()): Promise<{
  scenario_id: string;
  tracks: TrackScore[];
  overall: number;
  report_path: string;
}> {
  const { scenario, corpus } = await loadDesignReferenceEvalScenario(root);
  const typedCorpus = corpus as unknown as Array<
    DesignReferenceLike & {
      reference_id: string;
      tokens?: { colors?: Array<{ hex: string; roles?: string[] }>; style_labels?: string[] };
    }
  >;

  for (const ref of typedCorpus) {
    const issues = validateAgainstSchema("designReference", ref);
    if (issues.length) {
      throw new Error(`Corpus invalid ${ref.reference_id}: ${issues.map((i) => i.message).join("; ")}`);
    }
  }

  const tracks = [
    scoreRetrieval(scenario.brief, typedCorpus, scenario.golden),
    scorePromptPack(scenario.brief, typedCorpus, scenario.golden),
    scoreLookConditionedMapping(typedCorpus, scenario.golden, root)
  ];

  if (scenario.embedding_canonical_golden) {
    const primary = typedCorpus.find(
      (ref) => ref.reference_id === scenario.golden.expected_primary_reference_id
    );
    if (primary) {
      const canonical = buildEmbeddingCanonical(primary);
      tracks.push({
        id: "E1",
        score: canonical === scenario.embedding_canonical_golden ? 100 : 0,
        notes: [`canonical_match=${canonical === scenario.embedding_canonical_golden}`]
      });
    }
  }

  const overall = Math.round(tracks.reduce((sum, track) => sum + track.score, 0) / tracks.length);
  const reportDir =
    loadDigPaths(root).llm.qualityEval?.reportDir ?? "tmp/llm-quality-eval";
  const reportPath = resolve(root, reportDir, `${scenario.id}-report.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  const report = {
    scenario_id: scenario.id,
    title: scenario.title,
    generated_at: new Date().toISOString(),
    tracks,
    overall
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  return { scenario_id: scenario.id, tracks, overall, report_path: reportPath };
}
