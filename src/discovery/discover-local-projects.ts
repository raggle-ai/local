import path from "node:path";
import type { LocalProject, LoadLocalProjectsOptions, RemoteProject } from "../core/types";
import { loadLocalProjects } from "./load-local-projects";
import { scanCloneDirectoryRepositories, type ScanCloneDirectoryOptions } from "./scanner";

export type DiscoverLocalProjectsOptions = Omit<LoadLocalProjectsOptions, "cloneDirectory" | "scannedRepositories"> & {
  cloneDirectory: string;
  scan?: ScanCloneDirectoryOptions;
};

/** Discovers cloned repositories and expands their configured Raggle folders. */
export async function discoverLocalProjects(options: DiscoverLocalProjectsOptions): Promise<LocalProject[]> {
  const { cloneDirectory, scan: scanOptions, ...loadOptions } = options;
  const scannedRepositories = scanCloneDirectoryRepositories(cloneDirectory, scanOptions).repositories;
  const remoteProjects: RemoteProject[] = scannedRepositories.map((repository) => ({
    remoteUrl: repository.remoteUrl,
    name: path.basename(repository.worktree),
  }));

  return loadLocalProjects(remoteProjects, {
    ...loadOptions,
    cloneDirectory,
    scannedRepositories,
  });
}
