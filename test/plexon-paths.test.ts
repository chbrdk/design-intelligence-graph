import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("paths.json documents plexon spirion product and live CHECKION staging", async () => {
  const paths = JSON.parse(await readFile(resolve("knowledge/paths.json"), "utf8")) as {
    checkionV3: { stagingWeb: string; stagingMcp: string; apiTokenEnv: string };
    plexon: {
      productId: string;
      displayName: string;
      federationContract: string;
      stagingWeb: string;
      proposedStagingWeb: string;
      islandDevPort: number;
      islandAppDir: string;
      bindingTicket: string;
      capabilityIds: string[];
      platformDoc: string;
      openTopicsChallenge: string;
      provisioningProjectsPath: string;
      platformProjectQueryParam: string;
      digApiTokenEnv?: string;
      publicSpirionUrlEnv?: string;
    };
    coolify: { digFqdn: string; digApiFqdn: string };
  };

  assert.equal(paths.checkionV3.stagingWeb, "https://checkion-v3.projects-a.plygrnd.tech");
  assert.equal(paths.checkionV3.stagingMcp, "https://checkion-v3-mcp.projects-a.plygrnd.tech");
  assert.equal(paths.checkionV3.apiTokenEnv, "CHECKION_API_TOKEN");

  assert.equal(paths.plexon.productId, "spirion");
  assert.equal(paths.plexon.displayName, "SPIRION");
  assert.equal(paths.plexon.digApiTokenEnv, "DIG_API_TOKEN");
  assert.equal(paths.plexon.publicSpirionUrlEnv, "NEXT_PUBLIC_SPIRION_URL");
  assert.equal(paths.plexon.federationContract, "2026-05-plexon-federation-v3");
  assert.equal(paths.plexon.stagingWeb, "https://plexon-v3.projects-a.plygrnd.tech");
  assert.equal(paths.plexon.proposedStagingWeb, "https://spirion.projects-a.plygrnd.tech");
  assert.equal(paths.plexon.islandDevPort, 3010);
  assert.equal(paths.plexon.islandAppDir, "apps/web");
  assert.equal(paths.plexon.bindingTicket, "knowledge/plexon-dig-binding-ticket.md");
  assert.ok(paths.plexon.capabilityIds.includes("spirion.reference_search"));
  assert.ok(paths.plexon.capabilityIds.includes("spirion.capture"));
  assert.equal(paths.plexon.platformDoc, "docs/DIG-013-plexon-app.md");
  assert.equal(paths.plexon.openTopicsChallenge, "knowledge/runtime-open-topics-challenge.md");
  assert.equal(paths.plexon.provisioningProjectsPath, "/api/platform/provisioning/projects");
  assert.equal(paths.plexon.platformProjectQueryParam, "platformProjectId");
  assert.equal(paths.coolify.digFqdn, "https://spirion.projects-a.plygrnd.tech");
  assert.equal(paths.coolify.digApiFqdn, "https://spirion-api.projects-a.plygrnd.tech");
});
