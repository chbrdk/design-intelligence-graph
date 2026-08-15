import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("knowledge paths stay aligned with Dockerfile and compose", async () => {
  const paths = JSON.parse(await readFile(resolve("knowledge/paths.json"), "utf8")) as {
    docker: {
      image: string;
      playwrightBaseImage: string;
      capturesHostDir: string;
      capturesContainerDir: string;
      indexesHostDir: string;
      indexesContainerDir: string;
      composeWebService: string;
      webHostPort: number;
      webContainerPort: number;
    };
    web: { port: number; staticDir: string };
    api: { jobsPath: string };
  };
  const dockerfile = await readFile(resolve("Dockerfile.api"), "utf8");
  const compose = await readFile(resolve("compose.yaml"), "utf8");

  assert.match(dockerfile, new RegExp(`FROM .*${paths.docker.playwrightBaseImage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(dockerfile, /EXPOSE 8787/);
  assert.match(dockerfile, /docker-api-entrypoint\.sh/);
  assert.match(compose, /dockerfile:\s*Dockerfile\.api/);
  assert.match(compose, new RegExp(`image:\\s*${paths.docker.image}`));
  assert.match(compose, new RegExp(`${paths.docker.composeWebService}:`));
  assert.match(compose, /shm_size:\s*["']?1gb["']?/i);
  assert.match(compose, /init:\s*true/);
  assert.equal(/^ipc:\s*host$/m.test(compose), false);
  assert.match(
    compose,
    new RegExp(`${paths.docker.capturesHostDir}:${paths.docker.capturesContainerDir}`)
  );
  assert.match(
    compose,
    new RegExp(`${paths.docker.indexesHostDir}:${paths.docker.indexesContainerDir}`)
  );
  assert.match(compose, new RegExp(`${paths.docker.webHostPort}:${paths.docker.webContainerPort}`));
  assert.equal(paths.web.port, paths.docker.webHostPort);
  assert.equal(paths.api.jobsPath, "/api/jobs");
  assert.equal(paths.web.staticDir, "web/dist");
});
