import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { type ImportedRepository } from "./import";
import { normalizeFolders, normalizeTags } from "../core/project-config-fields";
import { normalizeSubpaths, type ImportedRepositorySubpath } from "../core/project-subpaths";
import type { ProjectActionConfig } from "../core/project-actions";

export const DEFAULT_GLOBAL_IGNORED_SUBPATHS = [".raggle"];

export type RaggleProjectConfig = {
  /** @deprecated Repository-local names are ignored; provide the name in RemoteProject instead. */
  name?: string;
  tags?: string[];
  folders?: string[];
  subpaths?: ImportedRepositorySubpath[];
  /** Shorthand for allTopLevelFolders. */
  allSubpaths?: boolean;
  /** Recursively includes every eligible descendant folder. */
  collapseSubpaths?: boolean;
  /** Includes every eligible folder directly below the configured directory. */
  allTopLevelFolders?: boolean;
  removePathFromName?: boolean;
  ignoredSubpaths?: string[];
  /** Repository-root folders whose complete subtrees are excluded from discovery. */
  excludeFolders?: string[];
};

export class RaggleProjectConfigParseError extends SyntaxError {
  constructor(
    public readonly configPath: string,
    message: string,
  ) {
    super(message);
    this.name = "RaggleProjectConfigParseError";
  }
}

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
  return {
    ...repository,
    tags: [...new Set([...(config.tags ?? []), ...repository.tags])],
    folders: [...new Set([...(config.folders ?? []), ...repository.folders])],
    subpaths: mergeConfiguredPaths(config.subpaths, repository.subpaths),
    allSubpath: repository.allSubpath,
    collapseSubpaths: repository.collapseSubpaths || config.collapseSubpaths === true,
    allTopLevelFolders:
      repository.allTopLevelFolders ||
      repository.allSubpath ||
      config.allTopLevelFolders === true ||
      config.allSubpaths === true,
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
  tags?: unknown;
  folders?: unknown;
  subpaths?: unknown;
  allSubpaths?: unknown;
  collapseSubpaths?: unknown;
  allTopLevelFolders?: unknown;
  removePathFromName?: unknown;
  ignoredSubpaths?: unknown;
  excludeFolders?: unknown;
}): RaggleProjectConfig {
  const allSubpaths = typeof parsed.allSubpaths === "boolean" ? parsed.allSubpaths : undefined;
  const allTopLevelFolders =
    parsed.allTopLevelFolders === true || allSubpaths === true
      ? true
      : parsed.allTopLevelFolders === false || allSubpaths === false
        ? false
        : undefined;

  return {
    tags: normalizeTags(parsed.tags),
    folders: normalizeFolders(parsed.folders),
    subpaths: normalizeSubpaths(parsed.subpaths),
    ...(allSubpaths !== undefined ? { allSubpaths } : {}),
    ...(typeof parsed.collapseSubpaths === "boolean" ? { collapseSubpaths: parsed.collapseSubpaths } : {}),
    ...(allTopLevelFolders !== undefined ? { allTopLevelFolders } : {}),
    ...(typeof parsed.removePathFromName === "boolean" ? { removePathFromName: parsed.removePathFromName } : {}),
    ignoredSubpaths: normalizeIgnoredSubpaths(parsed.ignoredSubpaths),
    excludeFolders: normalizeIgnoredSubpaths(parsed.excludeFolders),
  };
}

function jsonParseError(configPath: string, raw: string, error: unknown) {
  const originalMessage = error instanceof Error ? error.message : String(error);
  const positionMatch = originalMessage.match(/\bposition\s+(\d+)/i);
  let offset = positionMatch ? Number.parseInt(positionMatch[1], 10) : undefined;
  let reason = originalMessage
    .replace(/^JSON\.parse:\s*/i, "")
    .replace(/\s+at position\s+\d+(?:\s+\(line\s+\d+\s+column\s+\d+\))?\s*$/i, "");

  if (offset !== undefined) {
    let previous = offset - 1;
    while (previous >= 0 && /\s/.test(raw[previous])) previous -= 1;
    if ((raw[offset] === "}" || raw[offset] === "]") && raw[previous] === ",") {
      offset = previous;
      reason = "Trailing commas are not valid JSON";
    }
  }

  if (offset === undefined || !Number.isFinite(offset)) {
    return new RaggleProjectConfigParseError(configPath, `Invalid Raggle config: ${configPath}\n${reason}`);
  }

  const lineStart = raw.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const lineEnd = raw.indexOf("\n", offset);
  const sourceLine = raw.slice(lineStart, lineEnd === -1 ? raw.length : lineEnd);
  const line = raw.slice(0, offset).split("\n").length;
  const column = offset - lineStart + 1;
  const caret = `${" ".repeat(Math.max(0, column - 1))}^`;

  return new RaggleProjectConfigParseError(
    configPath,
    `Invalid Raggle config: ${configPath}\n${reason} at line ${line}, column ${column}\n${sourceLine}\n${caret}`,
  );
}

/** Returns undefined when a generic file (like index.json) is not a raggle config. */
function parseRaggleProjectConfig(configPath: string, raw: string, requireMarker: boolean) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw jsonParseError(configPath, raw, error);
  }

  if (requireMarker && !isRaggleConfigDocument(parsed)) return undefined;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RaggleProjectConfigParseError(
      configPath,
      `Invalid Raggle config: ${configPath}\nThe root value must be a JSON object`,
    );
  }

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
  const allSubpaths = configs.some((config) => config.allSubpath === true);
  return {
    tags: [...new Set(configs.flatMap((config) => normalizeTags(config.tags)))],
    folders: [...new Set(configs.flatMap((config) => normalizeFolders(config.folders)))],
    subpaths: mergeConfiguredPaths(
      [],
      configs.flatMap((config) => normalizeSubpaths(config.subpaths)),
    ),
    allSubpaths,
    collapseSubpaths: configs.some((config) => config.collapseSubpaths === true),
    allTopLevelFolders: allSubpaths || configs.some((config) => config.allTopLevelFolders === true),
    removePathFromName: configs.some((config) => config.removePathFromName === true),
  };
}
