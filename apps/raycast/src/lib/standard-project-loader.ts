import { Color } from "@raycast/api";
import { loadLocalProjects, type LocalProject, type ImportedRepository } from "@raggle-ai/local";
import { extensionPaths } from "./config";
import { mergeProjectsIntoCache, readCachedProjectLists, type Project } from "./project-store";
import { writeStandardProjectsSnapshot } from "./standard-project-cache";
import { hydrateStandardProjectMetadata, type StandardProject } from "./standard-project-metadata";

const paths = extensionPaths();

function readCachedProjectsByWorktree() {
  const cached = readCachedProjectLists();
  return new Map([...cached.items, ...cached.excludedItems].map((item) => [item.worktree, item]));
}

function tintFromIconColor(iconColor?: string): Color | undefined {
  if (!iconColor) return undefined;
  const key = iconColor.toLowerCase();
  if (key.includes("red")) return Color.Red;
  if (key.includes("orange")) return Color.Orange;
  if (key.includes("yellow")) return Color.Yellow;
  if (key.includes("green")) return Color.Green;
  if (key.includes("blue")) return Color.Blue;
  if (key.includes("magenta") || key.includes("pink") || key.includes("purple")) return Color.Magenta;
  if (key.includes("secondary") || key.includes("gray") || key.includes("grey")) return Color.SecondaryText;
  return undefined;
}

function projectToLocalProject(project: Project): LocalProject {
  return {
    id: project.id,
    worktree: project.worktree,
    name: project.name,
    description: project.description,
    worktreeName: project.worktreeName,
    keywords: project.keywords,
    tags: project.tags,
    latestSessionTitle: project.latestSessionTitle,
    icon: project.icon,
    iconColor: project.iconColor,
    startupCommand: project.startupCommand,
    sandboxCount: project.sandboxCount,
    updatedAt: project.updatedAt,
    hasIcon: project.hasIcon,
    isSessionOnly: project.isSessionOnly,
    isFavorite: project.isFavorite,
    relatedIds: project.relatedIds,
    remoteUrl: project.worktree,
    isCloned: true,
    repositoryRoot: project.worktree,
  };
}

function localProjectToStandardProject(item: LocalProject): StandardProject {
  return {
    ...item,
    tint: tintFromIconColor(item.iconColor),
    keywords: item.keywords ?? [],
  } as StandardProject;
}

export function sortStandardProjects(items: StandardProject[]) {
  return [...items].sort((a, b) => {
    if (a.isCloned !== b.isCloned) return a.isCloned ? -1 : 1;
    return (a.name ?? a.worktree).localeCompare(b.name ?? b.worktree);
  });
}

export async function loadStandardProjects(
  sourceKey: string,
  repositories: ImportedRepository[],
  cloneDirectory: string,
  options?: { force?: boolean; ignoredSubpaths?: string[]; onUpdate?: (items: StandardProject[]) => void },
) {
  const cachedProjectsByWorktree = readCachedProjectsByWorktree();
  const localProjects = await loadLocalProjects(repositories, {
    cloneDirectory,
    ignoredSubpaths: options?.ignoredSubpaths,
    force: options?.force,
    onUpdate: options?.onUpdate ? (items) => options.onUpdate!(items.map(localProjectToStandardProject)) : undefined,
    cloneIndexCachePath: paths.standardProjectsCloneIndexPath,
    cachedProjectsByWorktree: new Map(
      [...cachedProjectsByWorktree.entries()].map(([worktree, project]) => [worktree, projectToLocalProject(project)]),
    ),
  });

  const standardProjects = localProjects.map(localProjectToStandardProject);
  const hydratedItems = await hydrateStandardProjectMetadata(standardProjects, options);
  const nextItems = sortStandardProjects(hydratedItems);
  mergeProjectsIntoCache(nextItems.filter((item) => item.isCloned));
  writeStandardProjectsSnapshot(sourceKey, nextItems);
  return nextItems;
}

export { readCachedProjectsByWorktree };
