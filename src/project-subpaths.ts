import { readdirSync } from "node:fs";
import path from "node:path";

export type ImportedRepositorySubpath = {
  path: string;
  allSubpath?: boolean;
  removePathFromName?: boolean;
};

export type ProjectSubpathSettingsValues = {
  allSubpath: boolean;
  removePathFromName: boolean;
};

const skippedSubpathDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".vercel",
  "target",
]);

export function normalizeSubpathPath(input: string) {
  return input
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .join("/");
}

export function normalizeSubpaths(input: unknown) {
  if (input === true) return [{ path: "." }];

  const subpaths = new Map<string, ImportedRepositorySubpath>();

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") {
        const normalizedPath = normalizeSubpathPath(item);
        if (!normalizedPath) continue;
        subpaths.set(normalizedPath, { path: normalizedPath });
        continue;
      }

      if (!item || typeof item !== "object") continue;

      const pathValue = (item as { path?: unknown }).path;
      if (typeof pathValue !== "string") continue;

      const normalizedPath = normalizeSubpathPath(pathValue);
      if (!normalizedPath) continue;

      const removePathFromName = (item as { removePathFromName?: unknown }).removePathFromName;
      const allSubpath = (item as { allSubpath?: unknown }).allSubpath;
      subpaths.set(normalizedPath, {
        path: normalizedPath,
        ...(typeof allSubpath === "boolean" ? { allSubpath } : {}),
        ...(typeof removePathFromName === "boolean" ? { removePathFromName } : {}),
      });
    }
  }

  return [...subpaths.values()];
}

export function normalizeSubpathPaths(input: unknown) {
  return normalizeSubpaths(input).map((subpath) => subpath.path);
}

export function mergeExistingSubpathSettings(existingInput: unknown, nextInput: unknown) {
  const existingByPath = new Map(normalizeSubpaths(existingInput).map((subpath) => [subpath.path, subpath]));

  return normalizeSubpathPaths(nextInput).map((subpathPath) => {
    const existing = existingByPath.get(subpathPath);
    if (!existing || (!("allSubpath" in existing) && !existing.removePathFromName)) return subpathPath;
    return existing;
  });
}

export function upsertSubpathSettings(input: unknown, subpathPath: string, values: ProjectSubpathSettingsValues) {
  const normalizedSubpath = normalizeSubpathPath(subpathPath);
  if (!normalizedSubpath) return [];

  const existingSubpaths = normalizeSubpaths(input);
  const existingIndex = existingSubpaths.findIndex((subpath) => subpath.path === normalizedSubpath);
  const nextSubpath: ImportedRepositorySubpath = {
    ...(existingIndex >= 0 ? existingSubpaths[existingIndex] : { path: normalizedSubpath }),
    allSubpath: values.allSubpath,
    ...(values.removePathFromName ? { removePathFromName: true } : {}),
  };
  if (!values.removePathFromName) delete nextSubpath.removePathFromName;

  const nextSubpaths = [...existingSubpaths];
  if (existingIndex >= 0) nextSubpaths[existingIndex] = nextSubpath;
  else if (values.allSubpath || values.removePathFromName) nextSubpaths.push(nextSubpath);

  return nextSubpaths;
}

export function shouldIncludeSubpathDirectory(name: string) {
  return !name.startsWith(".") && !skippedSubpathDirectories.has(name);
}

export function readSubpathChildDirectories(parentDirectory: string) {
  const items = new Set<string>();

  try {
    for (const entry of readdirSync(parentDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !shouldIncludeSubpathDirectory(entry.name)) continue;
      items.add(path.join(parentDirectory, entry.name));
    }
  } catch {
    // Ignore missing or unreadable optional subpath directories.
  }

  return [...items];
}
