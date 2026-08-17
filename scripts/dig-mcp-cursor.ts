#!/usr/bin/env node
/**
 * Cursor stdio launcher: empty graph + staging DIG API for library tools.
 */
import { applyCursorMcpDefaults } from "../src/runtime-paths.js";

const graphPath = applyCursorMcpDefaults();
if (!process.argv[2]) process.argv[2] = graphPath;
await import("../src/mcp-server.js");
