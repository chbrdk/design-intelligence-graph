#!/usr/bin/env node
import { parseArgs } from "node:util";
import { verifyCapturePackage } from "./verify.js";

const HELP = `dig-verify <capture-package-directory>

Verify paths, sizes, SHA-256 hashes, and serialized evidence in a DIG-001 package.
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { help: { type: "boolean", short: "h", default: false } }
  });
  if (values.help) { process.stdout.write(HELP); return; }
  if (positionals.length !== 1) throw new Error(`Expected one capture package directory.\n\n${HELP}`);
  const report = await verifyCapturePackage(positionals[0]!);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
