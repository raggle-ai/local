import {
  createLocalProjectUpdate,
  loadLocalProjects,
  type ImportedRepository,
  type LocalProjectUpdate,
} from "@raggle-ai/local";
import {
  cachedRaycastProjectToLocalProject,
  localProjectToRaycastProject,
  writeRaycastProjectsSnapshot,
  type RaycastProject,
} from "@raggle-ai/raycast-adapter";
import { extensionPaths } from "./config";
import { mergeProjectsIntoCache, readCachedProjectLists } from "./project-store";
import { hydrateStandardProjectMetadata } from "./standard-project-metadata";

const paths = extensionPaths();

function readCachedProjectsByWorktree() {
  const cached = readCachedProjectLists();
  return new Map([...cached.items, ...cached.excludedItems].map((item) => [item.worktree, item]));
}

export function sortStandardProjects(items: RaycastProject[]) {
  return [...items].sort((a, b) => {
    if (a.isCloned !== b.isCloned) return a.isCloned ? -1 : 1;
    return (a.name ?? a.worktree).localeCompare(b.name ?? b.worktree);
  });
}

export async function loadStandardProjects(
  sourceKey: string,
  repositories: ImportedRepository[],
  cloneDirectory: string,
  options?: {
    force?: boolean;
    ignoredSubpaths?: string[];
    onUpdate?: (items: RaycastProject[], update: LocalProjectUpdate) => void;
  },
) {
  const cachedProjectsByWorktree = readCachedProjectsByWorktree();
  const localProjects = await loadLocalProjects(repositories, {
    cloneDirectory,
    ignoredSubpaths: options?.ignoredSubpaths,
    force: options?.force,
    onUpdate: options?.onUpdate
      ? (items, update) => options.onUpdate!(items.map(localProjectToRaycastProject), update)
      : undefined,
    cloneIndexCachePath: paths.standardProjectsCloneIndexPath,
    cachedProjectsByWorktree: new Map(
      [...cachedProjectsByWorktree.entries()].map(([worktree, project]) => [
        worktree,
        cachedRaycastProjectToLocalProject(project),
      ]),
    ),
  });

  const hydratedItems = await hydrateStandardProjectMetadata(localProjects, {
    force: options?.force,
    onUpdate: options?.onUpdate
      ? (items) =>
          options.onUpdate!(
            items.map(localProjectToRaycastProject),
            createLocalProjectUpdate(localProjects, items, "subpaths"),
          )
      : undefined,
  });
  const nextItems = sortStandardProjects(hydratedItems.map(localProjectToRaycastProject));
  mergeProjectsIntoCache(nextItems.filter((item) => item.isCloned));
  writeRaycastProjectsSnapshot(sourceKey, nextItems);
  return nextItems;
}

export { readCachedProjectsByWorktree };
