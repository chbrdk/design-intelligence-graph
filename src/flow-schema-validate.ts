import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import { isFlowActionId } from "./flow-actions.js";
import { resolveRepoRoot } from "./repo-root.js";

const addFormats = addFormatsImport as unknown as (ajv: Ajv2020) => void;

const ROOT = resolveRepoRoot();

export type FlowSchemaKind =
  | "flowGraph"
  | "flowEdges"
  | "flowCandidates"
  | "flowLibraryList"
  | "flowLibraryDetail"
  | "flowInteractive"
  | "mcpFlowNeighbors"
  | "designReference"
  | "designReferencePack"
  | "designPromptPack"
  | "designLayoutHints";

const SCHEMA_KEYS: Record<FlowSchemaKind, string> = {
  flowGraph: "flowGraph",
  flowEdges: "flowEdges",
  flowCandidates: "flowCandidates",
  flowLibraryList: "flowLibraryList",
  flowLibraryDetail: "flowLibraryDetail",
  flowInteractive: "flowInteractive",
  mcpFlowNeighbors: "mcpFlowNeighbors",
  designReference: "designReference",
  designReferencePack: "designReferencePack",
  designPromptPack: "designPromptPack",
  designLayoutHints: "designLayoutHints"
};

const SCHEMA_DEFAULTS: Record<FlowSchemaKind, string> = {
  flowGraph: "schemas/flow-graph.schema.json",
  flowEdges: "schemas/flow-edges.schema.json",
  flowCandidates: "schemas/flow-candidates.schema.json",
  flowLibraryList: "schemas/flow-library-list.schema.json",
  flowLibraryDetail: "schemas/flow-library-detail.schema.json",
  flowInteractive: "schemas/flow-interactive.schema.json",
  mcpFlowNeighbors: "schemas/mcp-flow-neighbors.schema.json",
  designReference: "schemas/design-reference.schema.json",
  designReferencePack: "schemas/design-reference-pack.schema.json",
  designPromptPack: "schemas/design-prompt-pack.schema.json",
  designLayoutHints: "schemas/design-layout-hints.schema.json"
};

function schemaPath(kind: FlowSchemaKind): string {
  const paths = loadJson(resolve(ROOT, "knowledge/paths.json")) as {
    taxonomy?: { schemas?: Record<string, string> };
  };
  const map = paths.taxonomy?.schemas ?? {};
  const key = SCHEMA_KEYS[kind];
  const relative = map[key] ?? SCHEMA_DEFAULTS[kind];
  return resolve(ROOT, relative);
}

export interface FlowScenarioExpect {
  schema_valid: boolean;
  flow_action_ids: string[];
  min_screens: number;
  min_edges: number;
  required_edge_methods: string[];
  require_hotspot_on_edges: boolean;
  max_inferred_confidence: number;
}

export interface FlowScenario {
  id: string;
  title: string;
  phase_coverage: string[];
  seed_source: string;
  ownership_notes?: string;
  artifacts: {
    flow_graph: string;
    edges?: string;
    candidates?: string[];
  };
  expect: FlowScenarioExpect;
}

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

const validators = new Map<FlowSchemaKind, ValidateFunction>();

function getValidator(kind: FlowSchemaKind): ValidateFunction {
  const cached = validators.get(kind);
  if (cached) return cached;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = loadJson(schemaPath(kind)) as object;
  const validate = ajv.compile(schema);
  validators.set(kind, validate);
  return validate;
}

export function validateAgainstSchema(kind: FlowSchemaKind, data: unknown): ValidationIssue[] {
  const validate = getValidator(kind);
  const ok = validate(data);
  if (ok) return [];
  return ((validate.errors ?? []) as ErrorObject[]).map((err) => ({
    code: "schema",
    message: `${err.instancePath || "/"} ${err.message ?? "invalid"}`,
    path: err.instancePath
  }));
}

export function assertFlowGraphInvariants(graph: {
  flow_actions?: Array<{ taxonomy_id: string }>;
  screens?: Array<{ flow_screen_id: string; order: number }>;
  edges?: Array<{
    from_screen_id: string;
    to_screen_id: string;
    activation?: string;
    confidence?: number;
    hotspot?: unknown;
    method?: string;
  }>;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const screens = graph.screens ?? [];
  const screenIds = new Set(screens.map((s) => s.flow_screen_id));

  for (const action of graph.flow_actions ?? []) {
    if (!isFlowActionId(action.taxonomy_id)) {
      issues.push({
        code: "catalog",
        message: `Unknown flow action id: ${action.taxonomy_id}`,
        path: "/flow_actions"
      });
    }
  }

  const orders = screens.map((s) => s.order).sort((a, b) => a - b);
  if (orders.length > 0) {
    const unique = new Set(orders);
    if (unique.size !== orders.length) {
      issues.push({ code: "invariant", message: "Duplicate screen order values", path: "/screens" });
    }
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== i) {
        issues.push({
          code: "invariant",
          message: `Screen orders must be contiguous from 0 (got ${orders.join(",")})`,
          path: "/screens"
        });
        break;
      }
    }
  }

  for (const [index, edge] of (graph.edges ?? []).entries()) {
    if (!screenIds.has(edge.from_screen_id)) {
      issues.push({
        code: "invariant",
        message: `Edge from_screen_id missing: ${edge.from_screen_id}`,
        path: `/edges/${index}`
      });
    }
    if (!screenIds.has(edge.to_screen_id)) {
      issues.push({
        code: "invariant",
        message: `Edge to_screen_id missing: ${edge.to_screen_id}`,
        path: `/edges/${index}`
      });
    }
    if (edge.activation === "inferred_href_only" && (edge.confidence ?? 0) >= 1) {
      issues.push({
        code: "invariant",
        message: "inferred_href_only edges must have confidence < 1",
        path: `/edges/${index}/confidence`
      });
    }
  }

  return issues;
}

export function flowFixturesDir(root = ROOT): string {
  const paths = loadJson(resolve(root, "knowledge/paths.json")) as {
    taxonomy?: { flowFixturesDir?: string };
  };
  return resolve(root, paths.taxonomy?.flowFixturesDir ?? "fixtures/flows");
}

export function listPositiveScenarioDirs(root = ROOT): string[] {
  const base = flowFixturesDir(root);
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => join(base, entry.name))
    .filter((dir) => existsSync(join(dir, "scenario.json")))
    .sort();
}

export function loadScenario(dir: string): { scenario: FlowScenario; dir: string } {
  const scenario = loadJson(join(dir, "scenario.json")) as FlowScenario;
  return { scenario, dir };
}

export function validateScenarioFolder(dir: string): {
  scenario: FlowScenario;
  issues: ValidationIssue[];
  expectFailures: string[];
} {
  const { scenario } = loadScenario(dir);
  const issues: ValidationIssue[] = [];
  const expectFailures: string[] = [];

  const graph = loadJson(join(dir, scenario.artifacts.flow_graph)) as {
    flow_actions?: Array<{ taxonomy_id: string }>;
    screens?: Array<{ flow_screen_id: string; order: number }>;
    edges?: Array<{
      from_screen_id: string;
      to_screen_id: string;
      activation?: string;
      confidence?: number;
      hotspot?: unknown;
      method?: string;
    }>;
  };

  issues.push(...validateAgainstSchema("flowGraph", graph));
  issues.push(...assertFlowGraphInvariants(graph));

  if (scenario.artifacts.edges) {
    const edgesDoc = loadJson(join(dir, scenario.artifacts.edges));
    issues.push(...validateAgainstSchema("flowEdges", edgesDoc));
  }

  for (const candidateFile of scenario.artifacts.candidates ?? []) {
    const candidates = loadJson(join(dir, candidateFile));
    issues.push(...validateAgainstSchema("flowCandidates", candidates));
  }

  const expect = scenario.expect;
  if (expect.schema_valid && issues.some((i) => i.code === "schema" || i.code === "catalog" || i.code === "invariant")) {
    expectFailures.push(`Expected schema_valid but got: ${issues.map((i) => i.message).join("; ")}`);
  }

  const actionIds = new Set((graph.flow_actions ?? []).map((a) => a.taxonomy_id));
  for (const id of expect.flow_action_ids) {
    if (!actionIds.has(id)) expectFailures.push(`Missing expected flow_action ${id}`);
    if (!isFlowActionId(id)) expectFailures.push(`Expected flow_action not in catalog: ${id}`);
  }

  if ((graph.screens?.length ?? 0) < expect.min_screens) {
    expectFailures.push(`min_screens ${expect.min_screens}, got ${graph.screens?.length ?? 0}`);
  }
  if ((graph.edges?.length ?? 0) < expect.min_edges) {
    expectFailures.push(`min_edges ${expect.min_edges}, got ${graph.edges?.length ?? 0}`);
  }

  const methods = new Set((graph.edges ?? []).map((e) => e.method ?? ""));
  for (const method of expect.required_edge_methods) {
    if (!methods.has(method)) expectFailures.push(`Missing edge method ${method}`);
  }

  if (expect.require_hotspot_on_edges) {
    for (const [index, edge] of (graph.edges ?? []).entries()) {
      if (!edge.hotspot) expectFailures.push(`Edge ${index} missing required hotspot`);
    }
  }

  for (const edge of graph.edges ?? []) {
    if (edge.activation === "inferred_href_only" && (edge.confidence ?? 0) > expect.max_inferred_confidence) {
      expectFailures.push(
        `inferred confidence ${edge.confidence} exceeds max_inferred_confidence ${expect.max_inferred_confidence}`
      );
    }
  }

  return { scenario, issues, expectFailures };
}
