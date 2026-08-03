import { createClient } from "@libsql/client";
import { normalizeFolders, normalizeTags } from "../core/project-config-fields";
import { normalizeSubpaths } from "../core/project-subpaths";
import { normalizeClonePathTemplate } from "./import";
import { normalizeRepositoryUrl } from "./git-repository";

export const DEFAULT_RAGGLE_DATABASE_URL = "libsql://raggle-raycast-projects-anduimagui.aws-eu-west-1.turso.io";

export type RemoteRepositoryConfig = {
  repository: string;
  source: "remote-database";
  name?: string;
  description?: string;
  tags: string[];
  folders: string[];
  subpaths: ReturnType<typeof normalizeSubpaths>;
  allSubpaths: boolean;
  clonePathTemplate?: string;
  removePathFromName: boolean;
};

type RemoteRepositoryRow = {
  url: string;
  name: string | null;
  description: string | null;
  tags_json: string | null;
  folders_json: string | null;
  subpaths_json: string | null;
  clone_path_template: string | null;
  all_subpath: number | bigint | null;
  remove_path_from_name: number | bigint | null;
};

function parseJson(input: string | null): unknown {
  if (!input) return [];

  try {
    return JSON.parse(input) as unknown;
  } catch {
    return [];
  }
}

export function normalizeRepositoryReference(input: string) {
  const reference = input.trim();
  if (/^[^\s/:]+\/[^\s/]+$/.test(reference)) return normalizeRepositoryUrl(`https://github.com/${reference}`);
  return normalizeRepositoryUrl(reference);
}

export async function readRemoteRepositoryConfig(options: {
  repository: string;
  databaseUrl?: string;
  authToken?: string;
}): Promise<RemoteRepositoryConfig | undefined> {
  const repository = normalizeRepositoryReference(options.repository);
  const client = createClient({
    url: options.databaseUrl?.trim() || DEFAULT_RAGGLE_DATABASE_URL,
    authToken: options.authToken?.trim() || undefined,
  });

  try {
    const result = await client.execute({
      sql: `select url, name, description, tags_json, folders_json, subpaths_json, clone_path_template,
        all_subpath, remove_path_from_name
        from projects
        where url = ? and deleted_at is null
        limit 1`,
      args: [repository],
    });
    const row = result.rows[0] as unknown as RemoteRepositoryRow | undefined;
    if (!row) return undefined;

    const clonePathTemplate = normalizeClonePathTemplate(row.clone_path_template);
    return {
      repository: normalizeRepositoryUrl(row.url),
      source: "remote-database",
      ...(row.name ? { name: row.name } : {}),
      ...(row.description ? { description: row.description } : {}),
      tags: normalizeTags(parseJson(row.tags_json)),
      folders: normalizeFolders(parseJson(row.folders_json)),
      subpaths: normalizeSubpaths(parseJson(row.subpaths_json)),
      allSubpaths: Boolean(row.all_subpath),
      ...(clonePathTemplate ? { clonePathTemplate } : {}),
      removePathFromName: Boolean(row.remove_path_from_name),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("HTTP status 401")) {
      throw new Error("Remote database authentication failed. Set TURSO_AUTH_TOKEN.");
    }
    throw error;
  } finally {
    client.close();
  }
}
