import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeRepositoryUrl, repositoryName } from "./git-repository";
import { normalizeFolders, normalizeTags } from "./project-config-fields";
import { normalizeSubpaths, readSubpathChildDirectories, type ImportedRepositorySubpath } from "./project-subpaths";
export type { ImportedRepositorySubpath } from "./project-subpaths";
export { normalizeSubpaths, normalizeSubpathPaths } from "./project-subpaths";
export { normalizeFolders, normalizeTags } from "./project-config-fields";

export type ImportedRepositoryRow = {
  url: string;
  name?: unknown;
  description?: unknown;
  [key: string]: unknown;
  tags?: unknown;
  subpaths?: unknown;
  allSubpath?: unknown;
  folders?: unknown;
  clonePathTemplate?: unknown;
  removePathFromName?: unknown;
};

export type ImportedRepository = {
  remoteUrl: string;
  repository: string;
  name?: string;
  description?: string;
  hasCustomName: boolean;
  tags: string[];
  subpaths: ImportedRepositorySubpath[];
  allSubpath: boolean;
  folders: string[];
  clonePathTemplate?: string;
  plugins: string[];
  removePathFromName: boolean;
};

export function normalizeClonePathTemplate(input: unknown) {
  if (typeof input !== "string") return undefined;

  const value = input.trim();
  if (!value) return undefined;
  if (path.isAbsolute(value)) return value;

  const normalized = value
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .join("/");

  return normalized || undefined;
}

export function normalizePlugins(input: unknown, baseDirectory: string) {
  const plugins = new Set<string>();
  if (!Array.isArray(input)) return [];

  for (const item of input) {
    if (typeof item !== "string") continue;
    const plugin = item.trim();
    if (!plugin) continue;

    if (plugin === "~" || plugin.startsWith(`~${path.sep}`)) {
      plugins.add(expandHomePath(plugin));
      continue;
    }

    if (plugin.startsWith(".") || path.isAbsolute(plugin)) {
      plugins.add(path.resolve(baseDirectory, plugin));
      continue;
    }

    plugins.add(plugin);
  }

  return [...plugins];
}

function expandHomePath(input: string) {
  if (input === "~") return os.homedir();
  if (input.startsWith(`~${path.sep}`)) return path.join(os.homedir(), input.slice(2));
  return input;
}

function stripJsonComments(input: string) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];

    if (inString) {
      result += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }

    if (current === '"') {
      inString = true;
      result += current;
      continue;
    }

    if (current === "/" && next === "/") {
      while (index < input.length && input[index] !== "\n") index += 1;
      if (index < input.length) result += input[index];
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < input.length && !(input[index] === "*" && input[index + 1] === "/")) {
        if (input[index] === "\n") result += "\n";
        index += 1;
      }
      index += 1;
      continue;
    }

    result += current;
  }

  return result;
}

function stripTrailingCommas(input: string) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];

    if (inString) {
      result += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }

    if (current === '"') {
      inString = true;
      result += current;
      continue;
    }

    if (current === ",") {
      let lookahead = index + 1;
      while (lookahead < input.length && /\s/.test(input[lookahead])) lookahead += 1;
      if (input[lookahead] === "]" || input[lookahead] === "}") continue;
    }

    result += current;
  }

  return result;
}

function parseJsonc(input: string) {
  return JSON.parse(stripTrailingCommas(stripJsonComments(input))) as unknown;
}

function importedRepositoryRowsFromParsed(parsed: unknown) {
  if (Array.isArray(parsed)) return parsed;

  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { projects?: unknown }).projects)) {
    return (parsed as { projects: unknown[] }).projects;
  }

  throw new Error("Repository import file must contain a JSON array or an object with a projects array");
}

function importedRepositoryPluginsFromParsed(parsed: unknown, baseDirectory: string) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  return normalizePlugins((parsed as { plugins?: unknown }).plugins, baseDirectory);
}

function readImportedRepositoryFile(filePath: string) {
  const content = readFileSync(filePath, "utf8");
  const parsed = parseJsonc(content);

  return {
    rows: importedRepositoryRowsFromParsed(parsed),
    plugins: importedRepositoryPluginsFromParsed(parsed, path.dirname(filePath)),
  };
}

export function readImportedRepositoryRows(filePath: string) {
  const { rows } = readImportedRepositoryFile(filePath);

  return rows.map((item, index) => {
    const row = item as ImportedRepositoryRow;
    if (!row?.url || typeof row.url !== "string") {
      throw new Error(`Repository entry ${index + 1} is missing a valid url`);
    }
    return row;
  });
}

export function writeImportedRepositoryRows(filePath: string, rows: ImportedRepositoryRow[]) {
  const content = readFileSync(filePath, "utf8");
  const parsed = parseJsonc(content);

  if (Array.isArray(parsed)) {
    writeFileSync(filePath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    return;
  }

  if (parsed && typeof parsed === "object" && "projects" in parsed) {
    writeFileSync(filePath, `${JSON.stringify({ ...parsed, projects: rows }, null, 2)}\n`, "utf8");
    return;
  }

  throw new Error("Repository import file must contain a JSON array or an object with a projects array");
}

export function loadImportedRepositories(filePath: string) {
  const repositoryFile = readImportedRepositoryFile(filePath);

  return loadImportedRepositoriesFromRows(repositoryFile.rows, repositoryFile.plugins);
}

export function loadImportedRepositoriesFromRows(rows: unknown[], plugins: string[] = []) {
  return rows.map((item, index) => {
    const row = item as ImportedRepositoryRow;
    if (!row?.url || typeof row.url !== "string") {
      throw new Error(`Repository entry ${index + 1} is missing a valid url`);
    }

    const remoteUrl = normalizeRepositoryUrl(row.url);
    const repository = repositoryName(remoteUrl);
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const description = typeof row.description === "string" ? row.description.trim() : "";
    return {
      remoteUrl,
      repository,
      name: name || undefined,
      description: description || undefined,
      hasCustomName: Boolean(name),
      tags: normalizeTags(row.tags),
      subpaths: normalizeSubpaths(row.subpaths),
      allSubpath: row.allSubpath === true,
      folders: normalizeFolders(row.folders),
      clonePathTemplate: normalizeClonePathTemplate(row.clonePathTemplate),
      plugins,
      removePathFromName: row.removePathFromName === true,
    } satisfies ImportedRepository;
  });
}

export function loadRepositorySubpaths(worktree: string, subpaths: ImportedRepositorySubpath[]) {
  const items = new Set<string>();

  for (const subpath of subpaths) {
    const parentDirectory = subpath.path === "." ? worktree : path.join(worktree, ...subpath.path.split("/"));
    for (const item of readSubpathChildDirectories(parentDirectory)) items.add(item);
  }

  return [...items];
}
