import { applyProjectActionPlugins as applyRepositoryActionPlugins } from "@raggle-ai/local";
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

export function applyProjectActionPlugins(
  repositories: ImportedRepository[],
  preferences: Pick<StandardProjectsSettings, "projectActionsDirectory">,
) {
  return applyRepositoryActionPlugins(repositories, preferences.projectActionsDirectory ?? []);
}
