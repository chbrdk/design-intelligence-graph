import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("coolify paths record dig postgres and volume uuids", async () => {
  const paths = JSON.parse(await readFile(resolve("knowledge/paths.json"), "utf8")) as {
    coolify: {
      digPostgresUuid: string;
      digCapturesVolumeUuid: string;
      digIndexesVolumeUuid: string;
      digApiAppUuid: string;
    };
    runtime: { containerCapturesDir: string; containerIndexesDir: string };
  };
  assert.equal(paths.coolify.digPostgresUuid, "f9aiylej9ic9i6pkck8sutz5");
  assert.equal(paths.coolify.digApiAppUuid, "fjlcya8d9jnlecj4s44yru4q");
  assert.ok(paths.coolify.digCapturesVolumeUuid);
  assert.ok(paths.coolify.digIndexesVolumeUuid);
  assert.equal(paths.runtime.containerCapturesDir, "/data/captures");
  assert.equal(paths.runtime.containerIndexesDir, "/data/indexes");
});
