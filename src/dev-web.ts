#!/usr/bin/env node
import { spawn } from "node:child_process";
import { startWebServer } from "./web-server.js";

process.env.DIG_WEB_STATIC = "0";
startWebServer();

const child = spawn("npm", ["run", "dev"], {
  cwd: "web",
  stdio: "inherit",
  shell: true,
  env: process.env
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
  process.exit();
});
