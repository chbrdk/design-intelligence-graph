import { randomUUID } from "node:crypto";
import type { Queryable } from "./db.js";
import { getPool, runMigrations } from "./db.js";

export type DigProjectStatus = "active" | "archived";
export type DigCapabilitySyncStatus = "in_sync" | "pending" | "error";

export type DigProjectRow = {
  id: string;
  platform_project_id: string;
  name: string;
  domain: string | null;
  status: DigProjectStatus;
  capability_status: DigCapabilitySyncStatus;
  owner_plexon_user_id: string | null;
  platform_company_id: string | null;
  capture_count: number;
  reference_count: number;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DigProjectUpsertInput = {
  name: string;
  domain?: string | null;
  status?: DigProjectStatus;
  ownerPlexonUserId?: string;
  platformCompanyId?: string;
};

export function normalizeProjectDomain(input: string | null | undefined): string | null {
  if (input === undefined || input === null) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProto).hostname;
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").split("/")[0]?.split("?")[0] ?? trimmed;
  }
}

function mapRow(row: Record<string, unknown>): DigProjectRow {
  return {
    id: String(row.id),
    platform_project_id: String(row.platform_project_id),
    name: String(row.name),
    domain: row.domain == null ? null : String(row.domain),
    status: row.status === "archived" ? "archived" : "active",
    capability_status:
      row.capability_status === "pending" || row.capability_status === "error"
        ? row.capability_status
        : "in_sync",
    owner_plexon_user_id: row.owner_plexon_user_id == null ? null : String(row.owner_plexon_user_id),
    platform_company_id: row.platform_company_id == null ? null : String(row.platform_company_id),
    capture_count: Number(row.capture_count ?? 0),
    reference_count: Number(row.reference_count ?? 0),
    last_activity_at: row.last_activity_at == null ? null : String(row.last_activity_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

async function ensureDb(client: Queryable | null): Promise<Queryable | null> {
  if (!client) return null;
  await runMigrations(process.cwd(), client);
  return client;
}

export async function getDigProjectByPlatformId(
  platformProjectId: string,
  client: Queryable | null = getPool()
): Promise<DigProjectRow | null> {
  const db = await ensureDb(client);
  if (!db) return null;
  const result = await db.query(`SELECT * FROM dig_projects WHERE platform_project_id = $1 LIMIT 1`, [
    platformProjectId.trim()
  ]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function getDigProjectById(
  id: string,
  client: Queryable | null = getPool()
): Promise<DigProjectRow | null> {
  const db = await ensureDb(client);
  if (!db) return null;
  const result = await db.query(`SELECT * FROM dig_projects WHERE id = $1 LIMIT 1`, [id.trim()]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function upsertDigProjectByPlatformId(
  platformProjectId: string,
  input: DigProjectUpsertInput,
  client: Queryable | null = getPool()
): Promise<DigProjectRow> {
  const db = await ensureDb(client);
  if (!db) throw new Error("database_unavailable");
  const idKey = platformProjectId.trim();
  if (!idKey) throw new Error("platform_project_id_required");
  const name = input.name.trim();
  if (!name) throw new Error("name_required");
  const domain = normalizeProjectDomain(input.domain);
  const status = input.status === "archived" ? "archived" : "active";
  const owner = input.ownerPlexonUserId?.trim() || null;
  const company = input.platformCompanyId?.trim() || null;

  const existing = await getDigProjectByPlatformId(idKey, db);
  if (existing) {
    const result = await db.query(
      `UPDATE dig_projects SET
        name = $2,
        domain = COALESCE($3, domain),
        status = $4,
        capability_status = 'in_sync',
        owner_plexon_user_id = COALESCE($5, owner_plexon_user_id),
        platform_company_id = COALESCE($6, platform_company_id),
        updated_at = NOW()
       WHERE platform_project_id = $1
       RETURNING *`,
      [idKey, name, domain, status, owner, company]
    );
    return mapRow(result.rows[0] as Record<string, unknown>);
  }

  const id = `dig-${Date.now().toString(36)}-${randomUUID().replace(/-/g, "").slice(0, 6)}`;
  const result = await db.query(
    `INSERT INTO dig_projects (
      id, platform_project_id, name, domain, status, capability_status,
      owner_plexon_user_id, platform_company_id
    ) VALUES ($1,$2,$3,$4,$5,'in_sync',$6,$7)
    RETURNING *`,
    [id, idKey, name, domain, status, owner, company]
  );
  return mapRow(result.rows[0] as Record<string, unknown>);
}

export async function bumpDigProjectCaptureActivity(
  digProjectId: string,
  client: Queryable | null = getPool()
): Promise<void> {
  const db = await ensureDb(client);
  if (!db) return;
  await db.query(
    `UPDATE dig_projects SET
      capture_count = (
        SELECT COUNT(*)::int FROM captures WHERE dig_project_id = $1
      ),
      last_activity_at = NOW(),
      updated_at = NOW()
     WHERE id = $1`,
    [digProjectId]
  );
}
