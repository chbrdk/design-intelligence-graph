import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { hashImageBuffer } from "../src/composition-contract.js";
import {
  findCaptureByContentHash,
  partitionUploadsByContentHash
} from "../src/image-ingest-dedupe.js";

test("findCaptureByContentHash returns matching row", async () => {
  const client = {
    async query(_sql: string, values: unknown[] = []) {
      assert.equal(values[0], "abc123");
      return {
        rows: [
          {
            capture_run_id: "cap_hash_1",
            content_hash: "abc123",
            asset_kind: "campaign_keyvisual",
            craft_eligible: true,
            enrichment_status: "ready"
          }
        ]
      };
    }
  };
  const found = await findCaptureByContentHash(client, "abc123");
  assert.equal(found?.capture_run_id, "cap_hash_1");
  assert.equal(found?.asset_kind, "campaign_keyvisual");
});

test("partitionUploadsByContentHash skips library duplicates and batch duplicates", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-dedupe-"));
  try {
    const png = await sharp({
      create: { width: 6, height: 6, channels: 3, background: { r: 10, g: 20, b: 30 } }
    })
      .png()
      .toBuffer();
    const contentHash = await hashImageBuffer(png);
    const pathA = join(root, "a.png");
    const pathB = join(root, "b.png");
    const pathC = join(root, "c.png");
    await writeFile(pathA, png);
    await writeFile(pathB, png);
    const other = await sharp({
      create: { width: 6, height: 6, channels: 3, background: { r: 200, g: 10, b: 10 } }
    })
      .png()
      .toBuffer();
    await writeFile(pathC, other);

    const client = {
      async query(_sql: string, values: unknown[] = []) {
        if (values[0] === contentHash) {
          return {
            rows: [
              {
                capture_run_id: "cap_existing",
                content_hash: contentHash,
                asset_kind: "social_post",
                craft_eligible: false,
                enrichment_status: "ready"
              }
            ]
          };
        }
        return { rows: [] };
      }
    };

    const partitioned = await partitionUploadsByContentHash(
      [
        { source_id: "u1", filename: "a.png", path: pathA, asset_kind: "campaign_keyvisual" },
        { source_id: "u2", filename: "b.png", path: pathB, asset_kind: "campaign_keyvisual" },
        { source_id: "u3", filename: "c.png", path: pathC, asset_kind: "print_ad" }
      ],
      client
    );

    assert.equal(partitioned.novel.length, 1);
    assert.equal(partitioned.novel[0]?.filename, "c.png");
    assert.equal(partitioned.duplicates.length, 2);
    assert.ok(partitioned.duplicates.every((d) => d.reason === "content_hash_exists"));
    assert.equal(partitioned.duplicates[0]?.capture_run_id, "cap_existing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
