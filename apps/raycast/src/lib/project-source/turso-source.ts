import { createClient, type Client } from "@libsql/client/web";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extensionPaths, type StandardProjectsSettings } from "../config";
import {
  normalizeClonePathTemplate,
  normalizeFolders,
  normalizeSubpaths,
  normalizeTags,
  normalizeRepositoryUrl,
  type ImportedRepositoryRow,
} from "@raggle-ai/local";
import { projectRemoteMetadata } from "../project-remote-metadata";

type TursoProjectRow = {
  url: string;
  name: string | null;
  description: string | null;
  tags_json: string | null;
  folders_json: string | null;
  subpaths_json: string | null;
  clone_path_template: string | null;
  all_subpath: number | null;
  remove_path_from_name: number | null;
};

type CachedTursoProjectRows = {
  generatedAt: number;
  rows: ImportedRepositoryRow[];
};

type TursoProjectRowsCache = Record<string, CachedTursoProjectRows>;

const tursoRowsCachePath = extensionPaths().standardProjectsTursoRowsPath;

function requireTursoDatabaseUrl(settings: StandardProjectsSettings) {
  const url = settings.tursoDatabaseUrl?.trim();
  if (!url) throw new Error("Set the Turso database URL in Project Settings");
  return url;
}

function tursoRowsCacheKey(settings: StandardProjectsSettings) {
  return createHash("sha256").update(requireTursoDatabaseUrl(settings)).digest("hex");
}

function readTursoRowsCacheFile(): TursoProjectRowsCache {
  try {
    return JSON.parse(readFileSync(tursoRowsCachePath, "utf8")) as TursoProjectRowsCache;
  } catch {
    return {};
  }
}

function writeTursoRowsCacheFile(cache: TursoProjectRowsCache) {
  mkdirSync(path.dirname(tursoRowsCachePath), { recursive: true });
  writeFileSync(tursoRowsCachePath, JSON.stringify(cache), "utf8");
}

function tursoClonePathTemplate(input: unknown, cloneDirectory?: string) {
  const clonePathTemplate = normalizeClonePathTemplate(input);
  if (!clonePathTemplate) return undefined;
  if (!path.isAbsolute(clonePathTemplate)) return clonePathTemplate;
  if (!cloneDirectory) return undefined;

  const relativePath = path.relative(cloneDirectory, clonePathTemplate);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return undefined;

  return normalizeClonePathTemplate(relativePath);
}

function tursoStorageRow(settings: StandardProjectsSettings, row: ImportedRepositoryRow): ImportedRepositoryRow {
  const clonePathTemplate = tursoClonePathTemplate(row.clonePathTemplate, settings.cloneDirectory);
  const nextRow: ImportedRepositoryRow = { ...row };

  if (clonePathTemplate) nextRow.clonePathTemplate = clonePathTemplate;
  else delete nextRow.clonePathTemplate;

  return nextRow;
}

export function readCachedTursoProjectRows(settings: StandardProjectsSettings) {
  const cached = readTursoRowsCacheFile()[tursoRowsCacheKey(settings)];
  if (!cached || !Array.isArray(cached.rows)) return undefined;
  return {
    ...cached,
    rows: cached.rows.map((row) => tursoStorageRow(settings, row)),
  };
}

export function writeCachedTursoProjectRows(settings: StandardProjectsSettings, rows: ImportedRepositoryRow[]) {
  const cache = readTursoRowsCacheFile();
  cache[tursoRowsCacheKey(settings)] = {
    generatedAt: Date.now(),
    rows: rows.map((row) => tursoStorageRow(settings, row)),
  };
  writeTursoRowsCacheFile(cache);
}

function tursoClient(settings: StandardProjectsSettings) {
  return createClient({
    url: requireTursoDatabaseUrl(settings),
    authToken: settings.tursoAuthToken?.trim() || undefined,
  });
}

function isUnauthorizedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("HTTP status 401") || message.includes("SERVER_ERROR: Server returned HTTP status 401");
}

function tursoError(error: unknown) {
  if (isUnauthorizedError(error)) {
    return new Error(
      "Turso authentication failed. Add a database auth token in Project Settings, or create one with `turso db tokens create <database>`.",
    );
  }

  return error;
}

async function withTursoErrors<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    throw tursoError(error);
  }
}

function parseStringArray(input: string | null): string[] {
  if (!input) return [];

  try {
    const parsed = JSON.parse(input) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseSubpaths(input: string | null) {
  if (!input) return [];

  try {
    return normalizeSubpaths(JSON.parse(input) as unknown);
  } catch {
    return [];
  }
}

function rowToImportedRepository(settings: StandardProjectsSettings, row: TursoProjectRow): ImportedRepositoryRow {
  const clonePathTemplate = tursoClonePathTemplate(row.clone_path_template, settings.cloneDirectory);

  return {
    url: row.url,
    ...(row.name ? { name: row.name } : {}),
    ...(row.description ? { description: row.description } : {}),
    tags: parseStringArray(row.tags_json),
    folders: parseStringArray(row.folders_json),
    subpaths: parseSubpaths(row.subpaths_json),
    ...(clonePathTemplate ? { clonePathTemplate } : {}),
    ...(row.all_subpath ? { allSubpath: true } : {}),
    ...(row.remove_path_from_name ? { removePathFromName: true } : {}),
  };
}

function importedRepositoryToSqlRow(settings: StandardProjectsSettings, input: ImportedRepositoryRow) {
  const row = tursoStorageRow(settings, input);
  const normalizedUrl = normalizeRepositoryUrl(row.url);
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
  const description = typeof row.description === "string" && row.description.trim() ? row.description.trim() : null;
  const remoteMetadata = projectRemoteMetadata(normalizedUrl);

  return {
    id: normalizedUrl,
    url: normalizedUrl,
    name,
    description,
    tagsJson: JSON.stringify(normalizeTags(row.tags)),
    foldersJson: JSON.stringify(normalizeFolders(row.folders)),
    subpathsJson: JSON.stringify(normalizeSubpaths(row.subpaths)),
    cloneTemplate: normalizeClonePathTemplate(row.clonePathTemplate) ?? null,
    allSubpath: row.allSubpath === true ? 1 : 0,
    removePathFromName: row.removePathFromName === true ? 1 : 0,
    provider: remoteMetadata?.provider ?? null,
    host: remoteMetadata?.host ?? null,
    owner: remoteMetadata?.owner ?? null,
    repo: remoteMetadata?.repo ?? null,
    now: new Date().toISOString(),
  };
}

async function migrate(client: Client) {
  await client.batch(
    [
      `create table if not exists projects (
        id text primary key,
        url text not null unique,
        name text,
        description text,
        tags_json text not null default '[]',
        folders_json text not null default '[]',
        subpaths_json text not null default '[]',
        clone_path_template text,
        all_subpath integer not null default 0,
        remove_path_from_name integer not null default 0,
        created_at text not null,
        updated_at text not null,
        deleted_at text
      )`,
      `create table if not exists devices (
        id text primary key,
        name text not null,
        hostname text,
        clone_directory text,
        open_in_target text,
        created_at text not null,
        updated_at text not null
      )`,
      `create table if not exists project_device_overrides (
        project_id text not null references projects(id),
        device_id text not null references devices(id),
        clone_path text,
        favorite integer,
        sort_order integer,
        hidden integer,
        updated_at text not null,
        primary key (project_id, device_id)
      )`,
      `create table if not exists changes (
        id text primary key,
        entity text not null,
        entity_id text not null,
        operation text not null,
        payload_json text not null,
        device_id text,
        created_at text not null
      )`,
      `create table if not exists metadata (
        key text primary key,
        value text not null
      )`,
    ],
    "write",
  );

  await client.execute("alter table projects add column all_subpath integer not null default 0").catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("duplicate column name")) throw error;
  });

  for (const column of [
    "description text",
    "provider text",
    "host text",
    "owner text",
    "repo text",
    "remote_checked_at text",
    "icon_source text",
    "icon_checked_at text",
  ]) {
    await client.execute(`alter table projects add column ${column}`).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("duplicate column name")) throw error;
    });
  }
}

async function recordChange(
  client: Client,
  settings: StandardProjectsSettings,
  operation: string,
  entityId: string,
  payload: unknown,
) {
  const now = new Date().toISOString();
  const id = `${now}:${operation}:${entityId}:${randomUUID()}`;

  await client.execute({
    sql: `insert into changes (id, entity, entity_id, operation, payload_json, device_id, created_at)
      values (?, 'project', ?, ?, ?, ?, ?)`,
    args: [id, entityId, operation, JSON.stringify(payload), settings.deviceName ?? null, now],
  });
}

export async function testTursoProjectSource(settings: StandardProjectsSettings) {
  return withTursoErrors(async () => {
    const client = tursoClient(settings);
    await migrate(client);
    await client.execute("select 1");
  });
}

export async function readTursoProjectRows(settings: StandardProjectsSettings): Promise<ImportedRepositoryRow[]> {
  return withTursoErrors(async () => {
    const client = tursoClient(settings);
    await migrate(client);

    const result = await client.execute(
      `select url, name, description, tags_json, folders_json, subpaths_json, clone_path_template, all_subpath, remove_path_from_name
      from projects
      where deleted_at is null
      order by coalesce(name, url), url`,
    );

    const rows = result.rows.map((row) => rowToImportedRepository(settings, row as unknown as TursoProjectRow));
    writeCachedTursoProjectRows(settings, rows);
    return rows;
  });
}

export async function upsertTursoProjectRow(settings: StandardProjectsSettings, row: ImportedRepositoryRow) {
  await withTursoErrors(async () => {
    const client = tursoClient(settings);
    await migrate(client);
    const storageRow = tursoStorageRow(settings, row);
    const sqlRow = importedRepositoryToSqlRow(settings, storageRow);

    await client.execute({
      sql: `insert into projects (
        id, url, name, description, tags_json, folders_json, subpaths_json, clone_path_template, all_subpath,
        remove_path_from_name, provider, host, owner, repo, remote_checked_at, created_at, updated_at, deleted_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null)
      on conflict(url) do update set
        name = excluded.name,
        description = excluded.description,
        tags_json = excluded.tags_json,
        folders_json = excluded.folders_json,
        subpaths_json = excluded.subpaths_json,
        clone_path_template = excluded.clone_path_template,
        all_subpath = excluded.all_subpath,
        remove_path_from_name = excluded.remove_path_from_name,
        provider = excluded.provider,
        host = excluded.host,
        owner = excluded.owner,
        repo = excluded.repo,
        remote_checked_at = excluded.remote_checked_at,
        updated_at = excluded.updated_at,
        deleted_at = null`,
      args: [
        sqlRow.id,
        sqlRow.url,
        sqlRow.name,
        sqlRow.description,
        sqlRow.tagsJson,
        sqlRow.foldersJson,
        sqlRow.subpathsJson,
        sqlRow.cloneTemplate,
        sqlRow.allSubpath,
        sqlRow.removePathFromName,
        sqlRow.provider,
        sqlRow.host,
        sqlRow.owner,
        sqlRow.repo,
        sqlRow.now,
        sqlRow.now,
        sqlRow.now,
      ],
    });
    await recordChange(client, settings, "upsert", sqlRow.id, storageRow);
    writeCachedTursoProjectRows(settings, await readTursoProjectRows(settings));
  });
}

export async function replaceTursoProjectUrl(
  settings: StandardProjectsSettings,
  previousUrl: string,
  row: ImportedRepositoryRow,
) {
  const normalizedPreviousUrl = normalizeRepositoryUrl(previousUrl);
  const normalizedNextUrl = normalizeRepositoryUrl(row.url);

  if (normalizedPreviousUrl !== normalizedNextUrl) {
    await deleteTursoProjectRow(settings, normalizedPreviousUrl);
  }

  await upsertTursoProjectRow(settings, row);
}

export async function reconcileTursoProjectRemote(
  settings: StandardProjectsSettings,
  previousUrl: string,
  actualRemoteUrl: string,
) {
  const normalizedPreviousUrl = normalizeRepositoryUrl(previousUrl);
  const normalizedActualUrl = normalizeRepositoryUrl(actualRemoteUrl);
  if (normalizedPreviousUrl === normalizedActualUrl) return false;

  await withTursoErrors(async () => {
    const client = tursoClient(settings);
    await migrate(client);

    const result = await client.execute({
      sql: `select url, name, description, tags_json, folders_json, subpaths_json, clone_path_template, all_subpath, remove_path_from_name
      from projects
      where url = ? and deleted_at is null
      limit 1`,
      args: [normalizedPreviousUrl],
    });
    const row = result.rows[0] as unknown as TursoProjectRow | undefined;
    if (!row) return false;

    const existingActualResult = await client.execute({
      sql: "select deleted_at from projects where url = ? limit 1",
      args: [normalizedActualUrl],
    });

    if (existingActualResult.rows.length) {
      const now = new Date().toISOString();
      const existingActual = existingActualResult.rows[0] as unknown as { deleted_at: string | null };

      if (existingActual.deleted_at) {
        const nextRow = importedRepositoryToSqlRow(settings, {
          ...rowToImportedRepository(settings, row),
          url: normalizedActualUrl,
        });

        await client.execute({
          sql: `update projects set
            name = ?,
            description = ?,
            tags_json = ?,
            folders_json = ?,
            subpaths_json = ?,
            clone_path_template = ?,
            all_subpath = ?,
            remove_path_from_name = ?,
            provider = ?,
            host = ?,
            owner = ?,
            repo = ?,
            remote_checked_at = ?,
            updated_at = ?,
            deleted_at = null
          where url = ?`,
          args: [
            nextRow.name,
            nextRow.description,
            nextRow.tagsJson,
            nextRow.foldersJson,
            nextRow.subpathsJson,
            nextRow.cloneTemplate,
            nextRow.allSubpath,
            nextRow.removePathFromName,
            nextRow.provider,
            nextRow.host,
            nextRow.owner,
            nextRow.repo,
            nextRow.now,
            nextRow.now,
            normalizedActualUrl,
          ],
        });
      }

      await client.execute({
        sql: "update projects set deleted_at = ?, updated_at = ? where url = ? and deleted_at is null",
        args: [now, now, normalizedPreviousUrl],
      });
      await recordChange(client, settings, "reconcile-remote-delete-duplicate", normalizedPreviousUrl, {
        previousUrl: normalizedPreviousUrl,
        actualRemoteUrl: normalizedActualUrl,
      });
      writeCachedTursoProjectRows(settings, await readTursoProjectRows(settings));
      return true;
    }

    const nextRow = importedRepositoryToSqlRow(settings, {
      ...rowToImportedRepository(settings, row),
      url: normalizedActualUrl,
    });

    await client.execute({
      sql: `update projects set
        id = ?,
        url = ?,
        provider = ?,
        host = ?,
        owner = ?,
        repo = ?,
        remote_checked_at = ?,
        icon_source = null,
        icon_checked_at = null,
        updated_at = ?
      where url = ? and deleted_at is null`,
      args: [
        nextRow.id,
        nextRow.url,
        nextRow.provider,
        nextRow.host,
        nextRow.owner,
        nextRow.repo,
        nextRow.now,
        nextRow.now,
        normalizedPreviousUrl,
      ],
    });
    await recordChange(client, settings, "reconcile-remote", nextRow.id, {
      previousUrl: normalizedPreviousUrl,
      actualRemoteUrl: normalizedActualUrl,
    });
    writeCachedTursoProjectRows(settings, await readTursoProjectRows(settings));
    return true;
  });
}

export async function deleteTursoProjectRow(settings: StandardProjectsSettings, url: string) {
  await withTursoErrors(async () => {
    const client = tursoClient(settings);
    await migrate(client);
    const normalizedUrl = normalizeRepositoryUrl(url);
    const now = new Date().toISOString();

    await client.execute({
      sql: "update projects set deleted_at = ?, updated_at = ? where url = ? and deleted_at is null",
      args: [now, now, normalizedUrl],
    });
    await recordChange(client, settings, "delete", normalizedUrl, { url: normalizedUrl });
    writeCachedTursoProjectRows(settings, await readTursoProjectRows(settings));
  });
}

export async function importTursoProjectRows(settings: StandardProjectsSettings, rows: ImportedRepositoryRow[]) {
  await withTursoErrors(async () => {
    const client = tursoClient(settings);
    await migrate(client);

    for (const row of rows) {
      const sqlRow = importedRepositoryToSqlRow(settings, row);
      await client.execute({
        sql: `insert into projects (
          id, url, name, description, tags_json, folders_json, subpaths_json, clone_path_template, all_subpath,
          remove_path_from_name, provider, host, owner, repo, remote_checked_at, created_at, updated_at, deleted_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null)
        on conflict(url) do update set
          name = excluded.name,
          description = excluded.description,
          tags_json = excluded.tags_json,
          folders_json = excluded.folders_json,
          subpaths_json = excluded.subpaths_json,
          clone_path_template = excluded.clone_path_template,
          all_subpath = excluded.all_subpath,
          remove_path_from_name = excluded.remove_path_from_name,
          provider = excluded.provider,
          host = excluded.host,
          owner = excluded.owner,
          repo = excluded.repo,
          remote_checked_at = excluded.remote_checked_at,
          updated_at = excluded.updated_at,
          deleted_at = null`,
        args: [
          sqlRow.id,
          sqlRow.url,
          sqlRow.name,
          sqlRow.description,
          sqlRow.tagsJson,
          sqlRow.foldersJson,
          sqlRow.subpathsJson,
          sqlRow.cloneTemplate,
          sqlRow.allSubpath,
          sqlRow.removePathFromName,
          sqlRow.provider,
          sqlRow.host,
          sqlRow.owner,
          sqlRow.repo,
          sqlRow.now,
          sqlRow.now,
          sqlRow.now,
        ],
      });
    }

    await recordChange(client, settings, "import", "projects", { count: rows.length });
    writeCachedTursoProjectRows(settings, await readTursoProjectRows(settings));
  });
}
