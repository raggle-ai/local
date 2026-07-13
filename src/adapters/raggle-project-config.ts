import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { type ImportedRepository } from "./import";
import { normalizeFolders, normalizeTags } from "../core/project-config-fields";
import { normalizeSubpaths, type ImportedRepositorySubpath } from "../core/project-subpaths";
import type { ProjectActionConfig } from "../core/project-actions";

export const DEFAULT_GLOBAL_IGNORED_SUBPATHS = [".raggle"];

export type RaggleProjectConfig = {
  name?: string;
  tags?: string[];
  folders?: string[];
  subpaths?: ImportedRepositorySubpath[];
  allSubpath?: boolean;
  removePathFromName?: boolean;
  ignoredSubpaths?: string[];
};

export function normalizeIgnoredSubpaths(input: unknown, fallback: string[] = []) {
  if (input === undefined) return fallback;

  const values = new Set<string>();
  const items = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[\n,]/) : [];

  for (const item of items) {
    if (typeof item !== "string") continue;
    const normalized = item
      .trim()
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean)
      .join("/");
    if (normalized) values.add(normalized);
  }

  return [...values];
}

export function mergeIgnoredSubpaths(...inputs: Array<string[] | undefined>) {
  return normalizeIgnoredSubpaths(inputs.flatMap((input) => input ?? []));
}

function mergeConfiguredPaths<T extends { path: string }>(localItems: T[] | undefined, importedItems: T[]) {
  const itemsByPath = new Map<string, T>();

  for (const item of localItems ?? []) itemsByPath.set(item.path, item);
  for (const item of importedItems) itemsByPath.set(item.path, item);

  return [...itemsByPath.values()];
}

export function mergeRaggleProjectConfig(
  repository: ImportedRepository,
  config: RaggleProjectConfig,
): ImportedRepository {
  const hasLocalName = Boolean(config.name);
  const name = repository.name ?? config.name;

  return {
    ...repository,
    ...(name ? { name } : {}),
    hasCustomName: repository.hasCustomName || hasLocalName,
    tags: [...new Set([...(config.tags ?? []), ...repository.tags])],
    folders: [...new Set([...(config.folders ?? []), ...repository.folders])],
    subpaths: mergeConfiguredPaths(config.subpaths, repository.subpaths),
    allSubpath: repository.allSubpath || config.allSubpath === true,
    removePathFromName: repository.removePathFromName || config.removePathFromName === true,
  };
}

/**
 * Generic file names that are only honored as project config when the
 * document self-identifies as one, since unrelated files often share the name.
 */
const GENERIC_PROJECT_CONFIG_FILES = new Set(["index.json"]);

function isRaggleConfigDocument(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const document = parsed as { $schema?: unknown; schemaVersion?: unknown };
  if (typeof document.$schema === "string" && document.$schema.includes("raggle")) return true;
  return document.schemaVersion !== undefined;
}

export function requiresRaggleConfigMarker(configFile: string) {
  return GENERIC_PROJECT_CONFIG_FILES.has(path.basename(configFile));
}

function normalizeRaggleProjectConfig(parsed: {
  name?: unknown;
  tags?: unknown;
  folders?: unknown;
  subpaths?: unknown;
  allSubpath?: unknown;
  removePathFromName?: unknown;
  ignoredSubpaths?: unknown;
}): RaggleProjectConfig {
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";

  return {
    ...(name ? { name } : {}),
    tags: normalizeTags(parsed.tags),
    folders: normalizeFolders(parsed.folders),
    subpaths: normalizeSubpaths(parsed.subpaths),
    ...(typeof parsed.allSubpath === "boolean" ? { allSubpath: parsed.allSubpath } : {}),
    ...(typeof parsed.removePathFromName === "boolean" ? { removePathFromName: parsed.removePathFromName } : {}),
    ignoredSubpaths: normalizeIgnoredSubpaths(parsed.ignoredSubpaths),
  };
}

/** Returns undefined when a generic file (like index.json) is not a raggle config. */
function parseRaggleProjectConfig(configPath: string, raw: string, requireMarker: boolean) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to read ${configPath}:`, error);
    return {};
  }

  if (requireMarker && !isRaggleConfigDocument(parsed)) return undefined;
  if (!parsed || typeof parsed !== "object") return {};

  return normalizeRaggleProjectConfig(parsed as Parameters<typeof normalizeRaggleProjectConfig>[0]);
}

/** Config file names checked in order; the first file that exists wins. */
export const DEFAULT_PROJECT_CONFIG_FILES = ["raggle.json", "index.json"];

/** Custom names take lookup priority, followed by the defaults. */
export function resolveProjectConfigFileNames(customConfigFiles?: string[]) {
  if (!customConfigFiles?.length) return DEFAULT_PROJECT_CONFIG_FILES;
  return [...new Set([...customConfigFiles, ...DEFAULT_PROJECT_CONFIG_FILES])];
}

export function readRaggleProjectConfig(directory: string, configFiles?: string[]): RaggleProjectConfig {
  for (const configFile of resolveProjectConfigFileNames(configFiles)) {
    const configPath = path.join(directory, configFile);

    let raw: string;
    try {
      raw = readFileSync(configPath, "utf8");
    } catch {
      continue;
    }

    const config = parseRaggleProjectConfig(configPath, raw, requiresRaggleConfigMarker(configFile));
    if (config) return config;
  }

  return {};
}

/**
 * Reads and parses one specific config file. Returns undefined when the file
 * is missing or when a generic file name (like index.json) does not
 * self-identify as a raggle config via $schema or schemaVersion.
 */
export async function readProjectConfigFileAsync(configPath: string): Promise<RaggleProjectConfig | undefined> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch {
    return undefined;
  }

  return parseRaggleProjectConfig(configPath, raw, requiresRaggleConfigMarker(configPath));
}

export async function readRaggleProjectConfigAsync(
  directory: string,
  configFiles?: string[],
): Promise<RaggleProjectConfig> {
  for (const configFile of resolveProjectConfigFileNames(configFiles)) {
    const config = await readProjectConfigFileAsync(path.join(directory, configFile));
    if (config) return config;
  }

  return {};
}

export function ignoredSubpathsForProjectDirectory(
  directory: string,
  baseIgnoredSubpaths: string[] = [],
  configFiles?: string[],
) {
  const config = readRaggleProjectConfig(directory, configFiles);
  return mergeIgnoredSubpaths(baseIgnoredSubpaths, config.ignoredSubpaths);
}

export function ignoredSubpathsFromProjectActionConfigs(configs: ProjectActionConfig[]) {
  return mergeIgnoredSubpaths(...configs.map((config) => normalizeIgnoredSubpaths(config.ignoredSubpaths)));
}

export function raggleProjectConfigFromProjectActionConfigs(configs: ProjectActionConfig[]): RaggleProjectConfig {
  return {
    tags: [...new Set(configs.flatMap((config) => normalizeTags(config.tags)))],
    folders: [...new Set(configs.flatMap((config) => normalizeFolders(config.folders)))],
    subpaths: mergeConfiguredPaths(
      [],
      configs.flatMap((config) => normalizeSubpaths(config.subpaths)),
    ),
    allSubpath: configs.some((config) => config.allSubpath === true),
    removePathFromName: configs.some((config) => config.removePathFromName === true),
  };
}
