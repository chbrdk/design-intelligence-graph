import { loadDigPaths } from "./runtime-paths.js";

export type FederationRuntimeMode = "dummy" | "live";

export function getFederationMode(environment: NodeJS.ProcessEnv = process.env): FederationRuntimeMode {
  const paths = loadDigPaths() as { plexon?: { federationModeEnv?: string; federationModeDefault?: string } };
  const envName = paths.plexon?.federationModeEnv ?? "DIG_FEDERATION_MODE";
  const raw = environment[envName]?.trim().toLowerCase();
  if (raw === "live" || raw === "dummy") return raw;
  const fallback = paths.plexon?.federationModeDefault?.trim().toLowerCase();
  return fallback === "live" ? "live" : "dummy";
}
