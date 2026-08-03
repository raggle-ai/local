import path from "node:path";
import type { LocalProject, LoadLocalProjectsOptions, RemoteProject } from "../core/types";
import { createLocalProjectUpdate } from "../core/project-load-update";
import { loadLocalProjects } from "./load-local-projects";
import {
  discoverRepository,
  scanCloneDirectoryRepositories,
  type DiscoveredRepository,
  type ScanCloneDirectoryOptions,
} from "./scanner";

export type DiscoverLocalProjectsOptions = Omit<LoadLocalProjectsOptions, "cloneDirectory" | "scannedRepositories"> & {
  cloneDirectory: string;
  scan?: ScanCloneDirectoryOptions;
};

export type DiscoverLocalProjectsUnderFolderOptions = Omit<
  LoadLocalProjectsOptions,
  "cloneDirectory" | "scannedRepositories"
> & {
  folder: string;
  scan?: ScanCloneDirectoryOptions;
};

function remoteProjects(repositories: DiscoveredRepository[]): RemoteProject[] {
  return repositories.map((repository) => ({
    remoteUrl: repository.remoteUrl,
    name: path.basename(repository.worktree),
  }));
}

function repositoryAtOrAbove(folder: string) {
  let directory = folder;

  while (true) {
    const repository = discoverRepository(directory);
    if (repository) return repository;

    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function isUnderFolder(project: LocalProject, folder: string) {
  const relative = path.relative(folder, project.worktree);
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Discovers cloned repositories and expands their configured Raggle folders. */
export async function discoverLocalProjects(options: DiscoverLocalProjectsOptions): Promise<LocalProject[]> {
  const { cloneDirectory, scan: scanOptions, ...loadOptions } = options;
  const scannedRepositories = scanCloneDirectoryRepositories(cloneDirectory, scanOptions).repositories;

  return loadLocalProjects(remoteProjects(scannedRepositories), {
    ...loadOptions,
    cloneDirectory,
    scannedRepositories,
  });
}

/** Lists only configured projects strictly beneath a folder. */
export async function discoverLocalProjectsUnderFolder(
  options: DiscoverLocalProjectsUnderFolderOptions,
): Promise<LocalProject[]> {
  const { folder: inputFolder, scan: scanOptions, onUpdate, previousItems = [], ...loadOptions } = options;
  const folder = path.resolve(inputFolder);
  const containingRepository = repositoryAtOrAbove(folder);
  const cloneDirectory = containingRepository ? path.dirname(containingRepository.worktree) : folder;
  const scannedRepositories = containingRepository
    ? [containingRepository]
    : scanCloneDirectoryRepositories(folder, scanOptions).repositories;
  const scopedPreviousItems = previousItems.filter((project) => isUnderFolder(project, folder));

  const projects = await loadLocalProjects(remoteProjects(scannedRepositories), {
    ...loadOptions,
    cloneDirectory,
    scannedRepositories,
    previousItems: scopedPreviousItems,
    onUpdate: onUpdate
      ? (items, update) => {
          const scopedItems = items.filter((project) => isUnderFolder(project, folder));
          onUpdate(scopedItems, createLocalProjectUpdate(scopedPreviousItems, scopedItems, update.phase));
        }
      : undefined,
  });

  return projects.filter((project) => isUnderFolder(project, folder));
}
