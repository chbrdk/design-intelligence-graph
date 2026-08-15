import assert from "node:assert/strict";
import test from "node:test";
import type { Queryable } from "../src/db.js";
import { resolveIndexScopeFromCapture } from "../src/db-index.js";

test("resolveIndexScopeFromCapture loads Collection ids from captures when scope empty", async () => {
  const client: Queryable = {
    async query(sql: string, params: unknown[] = []) {
      assert.match(sql, /FROM captures WHERE capture_run_id/);
      assert.equal(params[0], "cap_test");
      return {
        rows: [
          {
            dig_project_id: "dig_proj_from_row",
            platform_project_id: "pp_from_row"
          }
        ],
        rowCount: 1
      };
    }
  };
  const scope = await resolveIndexScopeFromCapture(client, "cap_test", {});
  assert.equal(scope.platformProjectId, "pp_from_row");
  assert.equal(scope.digProjectId, "dig_proj_from_row");
});

test("resolveIndexScopeFromCapture keeps explicit scope without SELECT overwrite", async () => {
  let selects = 0;
  const client: Queryable = {
    async query() {
      selects += 1;
      return { rows: [], rowCount: 0 };
    }
  };
  const scope = await resolveIndexScopeFromCapture(client, "cap_test", {
    digProjectId: "dig_explicit",
    platformProjectId: "pp_explicit"
  });
  assert.equal(selects, 0);
  assert.equal(scope.platformProjectId, "pp_explicit");
  assert.equal(scope.digProjectId, "dig_explicit");
});
