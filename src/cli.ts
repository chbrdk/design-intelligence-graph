#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { capture } from "./capture.js";
import { CANONICAL_VIEWPORTS } from "./config.js";

const HELP = `dig-capture <url> [options]

Create a DIG-001 minimum viable canonical capture package.

Options:
  -o, --output <directory>  Output parent directory (default: ./captures)
      --timeout <ms>        Navigation and stabilization timeout (default: 15000)
      --settle <ms>         Required DOM quiet window (default: 500)
      --locale <locale>     Browser locale (default: en-US)
      --timezone <zone>     IANA timezone (default: Europe/Berlin)
      --dark                Capture dark color scheme
      --reduced-motion      Prefer reduced motion
      --headed              Show the browser
  -h, --help                Show this help
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o", default: "captures" },
      timeout: { type: "string", default: "15000" },
      settle: { type: "string", default: "500" },
      locale: { type: "string", default: "en-US" },
      timezone: { type: "string", default: "Europe/Berlin" },
      dark: { type: "boolean", default: false },
      "reduced-motion": { type: "boolean", default: false },
      headed: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false }
    }
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const url = positionals[0];
  if (!url || positionals.length > 1) throw new Error(`Expected exactly one URL.\n\n${HELP}`);
  const timeoutMs = Number(values.timeout);
  const settleMs = Number(values.settle);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("--timeout must be a positive number.");
  if (!Number.isFinite(settleMs) || settleMs < 0) throw new Error("--settle must be a non-negative number.");

  process.stdout.write(`Capturing ${url} at ${CANONICAL_VIEWPORTS.length} canonical viewports…\n`);
  const result = await capture({
    url,
    outputDirectory: resolve(values.output),
    viewports: CANONICAL_VIEWPORTS,
    timeoutMs,
    settleMs,
    locale: values.locale,
    timezoneId: values.timezone,
    colorScheme: values.dark ? "dark" : "light",
    reducedMotion: values["reduced-motion"] ? "reduce" : "no-preference",
    headed: values.headed
  });
  process.stdout.write(`Capture ${result.manifest.status}: ${result.packageRoot}\n`);
  if (result.manifest.status === "failed") process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
