#!/usr/bin/env node
import { runDesignReferenceEval } from "../src/design-reference-eval.js";

const result = await runDesignReferenceEval();
process.stdout.write(
  JSON.stringify(
    {
      scenario_id: result.scenario_id,
      overall: result.overall,
      tracks: result.tracks,
      report_path: result.report_path
    },
    null,
    2
  ) + "\n"
);
if (result.overall < 70) {
  process.exitCode = 1;
}
