import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { type ImportedRepository } from "./import";
import { normalizeFolders, normalizeTags } from "./project-config-fields";
import { normalizeSubpaths, type ImportedRepositorySubpath } from "./project-subpaths";
import type { ProjectActionConfig } from "./project-actions";

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

export function readRaggleProjectConfig(directory: string): RaggleProjectConfig {
  const configPath = path.join(directory, "raggle.json");
  if (!existsSync(configPath)) return {};

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as {
      name?: unknown;
      tags?: unknown;
      folders?: unknown;
      subpaths?: unknown;
      allSubpath?: unknown;
      removePathFromName?: unknown;
      ignoredSubpaths?: unknown;
    };
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
  } catch (error) {
    console.warn(`Failed to read ${configPath}:`, error);
    return {};
  }
}

export function ignoredSubpathsForProjectDirectory(directory: string, baseIgnoredSubpaths: string[] = []) {
  const config = readRaggleProjectConfig(directory);
  return mergeIgnoredSubpaths(baseIgnoredSubpaths, config.ignoredSubpaths);
}

export function ignoredSubpathsFromProjectActionConfigs(configs: ProjectActionConfig[]) {
  return mergeIgnoredSubpaths(...configs.map((config) => normalizeIgnoredSubpaths(config.ignoredSubpaths)));
}
