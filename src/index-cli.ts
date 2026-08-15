#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { indexCapturePackage } from "./storage.js";

const HELP = `dig-index <capture-package-directory> [--output <directory>]\n\nBuild a verified DIG-006 portable knowledge-graph index.\n`;
async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { output: { type: "string", short: "o", default: "indexes" }, help: { type: "boolean", short: "h", default: false } } });
  if (values.help) { process.stdout.write(HELP); return; }
  if (positionals.length !== 1) throw new Error(`Expected one capture package directory.\n\n${HELP}`);
  const result = await indexCapturePackage(positionals[0]!, resolve(values.output));
  process.stdout.write(`${JSON.stringify({ index_root: result.indexRoot, nodes: result.graph.nodes.length, edges: result.graph.edges.length }, null, 2)}\n`);
}
main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
