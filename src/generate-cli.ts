#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { generateLayoutSpecification } from "./layout-generation.js";
const { values, positionals } = parseArgs({ allowPositionals: true, options: { output: { type: "string", short: "o", default: "generations" } } });
if (positionals.length !== 1) throw new Error("Usage: dig-generate <graph.json> [--output generations]");
const result = await generateLayoutSpecification(positionals[0]!, resolve(values.output));
process.stdout.write(`${JSON.stringify({ output_root: result.outputRoot, blocks: result.specification.blocks.length }, null, 2)}\n`);
