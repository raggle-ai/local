import { existsSync } from "node:fs";
import path from "node:path";
import type { ImportedRepository } from "./import";

export function resolveProjectActionPluginDirectories(projectActionDirectories: readonly string[]) {
  return projectActionDirectories.map((projectActionDirectory) => {
    const pluginsDirectory = path.join(projectActionDirectory, "plugins");
    return existsSync(pluginsDirectory) ? pluginsDirectory : projectActionDirectory;
  });
}

export function applyProjectActionPlugins(
  repositories: ImportedRepository[],
  projectActionDirectories: readonly string[],
) {
  const plugins = resolveProjectActionPluginDirectories(projectActionDirectories);
  if (!plugins.length) return repositories;

  return repositories.map((repository) => ({
    ...repository,
    plugins: [...new Set([...plugins, ...repository.plugins])],
  }));
}
