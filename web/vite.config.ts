import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const paths = JSON.parse(readFileSync(resolve("..", "knowledge/paths.json"), "utf8")) as {
  web: { port: number; viteDevPort: number };
  api: { basePath: string };
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: paths.web.viteDevPort,
    fs: { allow: [resolve("..")] },
    proxy: {
      [paths.api.basePath]: {
        target: `http://127.0.0.1:${paths.web.port}`,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
