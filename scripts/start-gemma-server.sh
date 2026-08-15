#!/usr/bin/env bash
# Start local Gemma 4 (mlx-vlm) as an OpenAI-compatible server for DIG.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATHS="$ROOT/knowledge/paths.json"

python_bin="$(
  node - "$PATHS" "$ROOT" <<'NODE'
const fs = require("fs");
const path = require("path");
const pathsFile = process.argv[1];
const root = process.argv[2];
const cfg = JSON.parse(fs.readFileSync(pathsFile, "utf8"));
for (const candidate of cfg.llm.pythonCandidates || []) {
  const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
  try {
    fs.accessSync(resolved, fs.constants.X_OK);
    process.stdout.write(resolved);
    process.exit(0);
  } catch {}
}
console.error("No DIG LLM python found. Install mlx-vlm or point llm.pythonCandidates in knowledge/paths.json");
process.exit(1);
NODE
)"
model_id="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).llm.modelId)" "$PATHS")"
port="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).llm.serverPort)" "$PATHS")"
host="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).llm.serverHost)" "$PATHS")"

echo "Starting mlx_vlm.server model=$model_id on http://$host:$port/v1 using $python_bin"
exec "$python_bin" -m mlx_vlm.server --host "$host" --port "$port" --model "$model_id" --max-tokens 1200
