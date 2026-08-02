import { existsSync } from "node:fs";
import path from "node:path";
import { type ImportedRepository, readImportedRepositoryRows } from "@raggle-ai/local";
import { type StandardProjectsSettings } from "./config";
import { readCachedTursoProjectRows, readTursoProjectRows } from "./project-source/turso-source";
import { needsTursoProjectSourceSetup } from "./turso-project-source-setup";

function normalizedSubpathPattern(input: string) {
  return input
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .join("/")
    .toLowerCase();
}

export function standardProjectsSourceKey(preferences: StandardProjectsSettings & { projectListFile: string }) {
  const actionsSuffix = preferences.projectActionsDirectory?.length
    ? `:actions:${preferences.projectActionsDirectory.join(",")}`
    : "";
  const ignoredSubpathsSuffix = preferences.globalIgnoredSubpaths?.length
    ? `:ignored-subpaths:${preferences.globalIgnoredSubpaths.map(normalizedSubpathPattern).filter(Boolean).join(",")}`
    : "";

  if (preferences.projectSource === "turso") {
    return `turso:${preferences.tursoDatabaseUrl ?? "unconfigured"}${actionsSuffix}${ignoredSubpathsSuffix}`;
  }

  return `${preferences.projectListFile}${actionsSuffix}${ignoredSubpathsSuffix}`;
}

export async function readProjectSourceRows(preferences: StandardProjectsSettings & { projectListFile: string }) {
  if (preferences.projectSource === "turso") {
    return readTursoProjectRows(preferences);
  }

  return readImportedRepositoryRows(preferences.projectListFile);
}

export function readCachedProjectSourceRows(preferences: StandardProjectsSettings & { projectListFile: string }) {
  if (needsTursoProjectSourceSetup(preferences)) {
    return undefined;
  }

  if (preferences.projectSource === "turso") {
    return readCachedTursoProjectRows(preferences)?.rows;
  }

  return undefined;
}

function projectActionPluginsFromSettings(preferences: Pick<StandardProjectsSettings, "projectActionsDirectory">) {
  return (preferences.projectActionsDirectory ?? []).map((projectActionsDirectory) => {
    const pluginsDirectory = path.join(projectActionsDirectory, "plugins");
    return existsSync(pluginsDirectory) ? pluginsDirectory : projectActionsDirectory;
  });
}

export function applyProjectActionPlugins(
  repositories: ImportedRepository[],
  preferences: Pick<StandardProjectsSettings, "projectActionsDirectory">,
) {
  const settingsPlugins = projectActionPluginsFromSettings(preferences);
  if (!settingsPlugins.length) return repositories;

  return repositories.map((repository) => ({
    ...repository,
    plugins: [...new Set([...settingsPlugins, ...repository.plugins])],
  }));
}
