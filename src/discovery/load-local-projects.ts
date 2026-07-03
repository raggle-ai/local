import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { repositoryCloneParentDirectory, repositoryRootPath } from "../adapters/add-project";
import { repoPrefixedProjectName, subpathProjectName } from "../core/folder-mapping";
import { type ImportedRepositorySubpath } from "../core/project-subpaths";
import { normalizeRepositoryUrl, repositoryName } from "../adapters/git-repository";
import { remoteToBrowserUrl } from "../core/project-remote";
import {
  ignoredSubpathsForProjectDirectory,
  mergeRaggleProjectConfig,
  readRaggleProjectConfig,
} from "../adapters/raggle-project-config";
import {
  findLocalRepository,
  prepareCloneDirectoryIndex,
  type CloneDirectoryRepositoryIndex,
} from "../cache/standard-project-clone-index";
import { projectKeywords, standardProjectWithKeywords } from "../core/project-keywords";
import {
  type LocalProject,
  type LoadLocalProjectsOptions,
  type NormalizedRemoteProject,
  type RemoteProject,
} from "../core/types";

const projectResolveBatchSize = 24;
const subpathLoadBatchSize = 12;
const subpathAllFolderConfigFiles = ["kennel.json"];

type ResolvedLocalProject = {
  item: LocalProject;
  configuredFolders: LocalProject[];
  localPath?: string;
  repository: NormalizedRemoteProject;
};

function nowMs() {
  return Date.now();
}

function logProjectLoadTiming(label: string, startedAt: number, details?: Record<string, number | string>) {
  const durationMs = nowMs() - startedAt;
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.info(`[projects] ${label} ${durationMs}ms${suffix}`);
}

function normalizeRemoteProject(repository: RemoteProject): NormalizedRemoteProject {
  const remoteUrl = normalizeRepositoryUrl(repository.remoteUrl);
  const name = repository.name?.trim();
  return {
    ...repository,
    remoteUrl,
    repository: repository.repository ?? repositoryName(remoteUrl),
    name: name || undefined,
    description: repository.description?.trim() || undefined,
    tags: repository.tags ?? [],
    subpaths: repository.subpaths ?? [],
    allSubpath: repository.allSubpath ?? false,
    folders: repository.folders ?? [],
    plugins: repository.plugins ?? [],
    removePathFromName: repository.removePathFromName ?? false,
    hasCustomName: Boolean(name),
  };
}

function sortLocalProjects(items: LocalProject[]) {
  return [...items].sort((a, b) => {
    if (a.isCloned !== b.isCloned) return a.isCloned ? -1 : 1;
    return (a.name ?? a.worktree).localeCompare(b.name ?? b.worktree);
  });
}

function uniqueLocalProjectsByWorktree(items: LocalProject[]) {
  const seenWorktrees = new Set<string>();

  return items.filter((item) => {
    if (seenWorktrees.has(item.worktree)) return false;
    seenWorktrees.add(item.worktree);
    return true;
  });
}

function addUniqueLocalProjects(target: LocalProject[], seenWorktrees: Set<string>, items: LocalProject[]) {
  for (const item of items) {
    if (seenWorktrees.has(item.worktree)) continue;
    seenWorktrees.add(item.worktree);
    target.push(item);
  }
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);

  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    await Promise.all(
      batch.map(async (item, batchIndex) => {
        const index = start + batchIndex;
        results[index] = await mapper(item, index);
      }),
    );
  }

  return results;
}

function normalizedSubpathPattern(input: string) {
  return input
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .join("/")
    .toLowerCase();
}

function shouldIgnoreSubpath(relativePath: string | undefined, ignoredSubpaths: string[] = []) {
  if (!relativePath || !ignoredSubpaths.length) return false;

  const normalizedPath = normalizedSubpathPattern(relativePath);
  if (!normalizedPath) return false;

  const segments = normalizedPath.split("/");
  return ignoredSubpaths.some((item) => {
    const ignored = normalizedSubpathPattern(item);
    if (!ignored) return false;
    if (!ignored.includes("/")) return segments.includes(ignored);
    return normalizedPath === ignored || normalizedPath.startsWith(`${ignored}/`);
  });
}

function relativeSubpath(rootPath: string, worktree: string) {
  return path.relative(rootPath, worktree).split(path.sep).join("/");
}

function shouldIncludeAllSubpathDirectory(name: string) {
  return (
    !name.startsWith(".") &&
    !["node_modules", "dist", "build", "coverage", ".next", ".turbo", ".vercel", "target"].includes(name)
  );
}

function readTopLevelSubpathDirectories(rootPath: string) {
  const directories: string[] = [];

  try {
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      if (!entry.isDirectory() || !shouldIncludeAllSubpathDirectory(entry.name)) continue;

      directories.push(path.join(rootPath, entry.name));
    }
  } catch {
    // Ignore folders that cannot be read while indexing optional project subpaths.
  }

  return directories;
}

function subpathDirectory(rootPath: string, subpath: ImportedRepositorySubpath) {
  return subpath.path === "." ? rootPath : path.join(rootPath, ...subpath.path.split("/"));
}

function nestedSubpathPath(parentPath: string, childPath: string) {
  if (childPath === ".") return parentPath;
  if (parentPath === ".") return childPath;
  return `${parentPath}/${childPath}`;
}

function hasSubpathAllFolderConfig(directory: string) {
  return subpathAllFolderConfigFiles.some((configFile) => existsSync(path.join(directory, configFile)));
}

function discoverLocalConfigSubpaths(parentSubpath: ImportedRepositorySubpath, parentDirectory: string) {
  return readTopLevelSubpathDirectories(parentDirectory)
    .filter((directory) => hasSubpathAllFolderConfig(directory))
    .map((directory) => ({
      path: relativeSubpath(parentDirectory, directory),
      allSubpath: true,
      removePathFromName: parentSubpath.removePathFromName,
    }));
}

function discoverRootConfigSubpaths(rootPath: string, removePathFromName: boolean) {
  return readTopLevelSubpathDirectories(rootPath)
    .filter((directory) => hasSubpathAllFolderConfig(directory))
    .map((directory) => ({
      path: relativeSubpath(rootPath, directory),
      allSubpath: true,
      removePathFromName,
    }));
}

function localConfigSubpaths(rootPath: string, subpaths: ImportedRepositorySubpath[]) {
  const subpathsByPath = new Map<string, ImportedRepositorySubpath>();
  const pendingSubpaths: ImportedRepositorySubpath[] = [];

  for (const subpath of subpaths) {
    subpathsByPath.set(subpath.path, subpath);
    pendingSubpaths.push(subpath);
  }

  while (pendingSubpaths.length) {
    const parentSubpath = pendingSubpaths.shift();
    if (!parentSubpath) continue;

    const parentDirectory = subpathDirectory(rootPath, parentSubpath);
    if (!existsSync(parentDirectory)) continue;

    const config = readRaggleProjectConfig(parentDirectory);
    const discoveredSubpaths = discoverLocalConfigSubpaths(parentSubpath, parentDirectory);
    for (const childSubpath of [...(config.subpaths ?? []), ...discoveredSubpaths]) {
      const childPath = nestedSubpathPath(parentSubpath.path, childSubpath.path);
      if (subpathsByPath.has(childPath)) continue;

      const nestedSubpath: ImportedRepositorySubpath = {
        ...childSubpath,
        path: childPath,
        removePathFromName:
          childSubpath.removePathFromName ?? config.removePathFromName ?? parentSubpath.removePathFromName,
      };
      subpathsByPath.set(childPath, nestedSubpath);
      pendingSubpaths.push(nestedSubpath);
    }
  }

  return [...subpathsByPath.values()];
}

function subpathProject(
  parent: LocalProject,
  worktree: string,
  displayPath: string,
  removePathFromName: boolean,
  subpathAllSubpath: boolean,
  isSubpathRoot: boolean,
  cached?: LocalProject,
): LocalProject {
  const relativePath = relativeSubpath(parent.repositoryRoot, worktree);
  const fallbackName = subpathProjectName(displayPath);

  return standardProjectWithKeywords({
    ...parent,
    id: cached?.id ?? `${parent.remoteUrl}#${relativePath}`,
    worktree,
    repositoryRoot: parent.repositoryRoot,
    parentProjectName: parent.name,
    relativePath,
    isSubpathRoot,
    subpathAllSubpath,
    name: fallbackName,
    removePathFromName,
    worktreeName: cached?.worktreeName,
    latestSessionTitle: cached?.latestSessionTitle,
    icon: parent.icon,
    iconColor: parent.iconColor,
    startupCommand: cached?.startupCommand,
    sandboxCount: cached?.sandboxCount ?? 0,
    updatedAt: cached?.updatedAt,
    hasIcon: parent.hasIcon,
    isSessionOnly: false,
    isFavorite: cached?.isFavorite ?? false,
    relatedIds: cached?.relatedIds ?? [`${parent.remoteUrl}#${relativePath}`],
    tags: [...new Set([...(parent.tags ?? []), ...relativePath.split("/")])],
    isCloned: true,
  });
}

function configuredFolderProject(parent: LocalProject, folder: string, cached?: LocalProject): LocalProject {
  const worktree = path.join(parent.repositoryRoot, ...folder.split("/"));
  const fallbackName = repoPrefixedProjectName(parent, folder, parent.removePathFromName);

  return standardProjectWithKeywords({
    ...parent,
    id: cached?.id ?? `${parent.remoteUrl}#${folder}`,
    worktree,
    repositoryRoot: parent.repositoryRoot,
    parentProjectName: parent.name,
    relativePath: folder,
    name: fallbackName,
    removePathFromName: parent.removePathFromName,
    worktreeName: cached?.worktreeName,
    latestSessionTitle: cached?.latestSessionTitle,
    icon: parent.icon,
    iconColor: parent.iconColor,
    startupCommand: cached?.startupCommand,
    sandboxCount: cached?.sandboxCount ?? 0,
    updatedAt: cached?.updatedAt,
    hasIcon: parent.hasIcon,
    isSessionOnly: false,
    isFavorite: cached?.isFavorite ?? false,
    relatedIds: cached?.relatedIds ?? [`${parent.remoteUrl}#${folder}`],
    tags: [...new Set([...(parent.tags ?? []), ...folder.split("/")])],
    isCloned: parent.isCloned && existsSync(worktree),
  });
}

function baseLocalProject(
  repository: NormalizedRemoteProject,
  cloneDirectory: string,
  cachedProjectsByWorktree: Map<string, LocalProject>,
  options?: { force?: boolean },
) {
  const repositoryRoot = repositoryRootPath(repository, cloneDirectory);
  const cached = cachedProjectsByWorktree.get(repositoryRoot);
  const isCloned = existsSync(path.join(repositoryRoot, ".git"));

  return standardProjectWithKeywords({
    id: cached?.id ?? repository.remoteUrl,
    worktree: repositoryRoot,
    repositoryRoot,
    name: repository.name ?? repository.repository,
    description: repository.description,
    hasCustomName: repository.hasCustomName,
    worktreeName: cached?.worktreeName,
    tags: repository.tags,
    plugins: repository.plugins,
    latestSessionTitle: cached?.latestSessionTitle,
    icon: options?.force ? undefined : cached?.icon,
    iconColor: cached?.iconColor,
    startupCommand: cached?.startupCommand,
    sandboxCount: cached?.sandboxCount ?? 0,
    updatedAt: cached?.updatedAt,
    hasIcon: options?.force ? false : (cached?.hasIcon ?? false),
    isSessionOnly: false,
    isFavorite: cached?.isFavorite ?? false,
    relatedIds: cached?.relatedIds ?? [repository.remoteUrl],
    remoteUrl: repository.remoteUrl,
    browserUrl: remoteToBrowserUrl(repository.remoteUrl),
    removePathFromName: repository.removePathFromName,
    allSubpath: repository.allSubpath,
    isCloned,
  } satisfies LocalProject);
}

async function resolveLocalProject(
  repository: NormalizedRemoteProject,
  cloneDirectory: string,
  cachedProjectsByWorktree: Map<string, LocalProject>,
  repositoryIndexByParentDirectory: Map<string, CloneDirectoryRepositoryIndex>,
  options?: { force?: boolean },
): Promise<ResolvedLocalProject> {
  const expectedDirectory = repositoryRootPath(repository, cloneDirectory);
  const cloneParentDirectory = path.dirname(expectedDirectory);
  const repositoryIndex = repositoryIndexByParentDirectory.get(cloneParentDirectory) ?? {
    worktreeByRepositoryKey: new Map<string, string>(),
    remoteUrlByWorktree: new Map<string, string>(),
  };
  const localResult = await findLocalRepository(repository.remoteUrl, expectedDirectory, repositoryIndex);
  const localPath =
    localResult?.isMatch || localResult?.worktree === expectedDirectory ? localResult.worktree : undefined;
  const repositoryRoot = localPath ?? expectedDirectory;
  const resolvedRepository = localPath
    ? mergeRaggleProjectConfig(repository, readRaggleProjectConfig(repositoryRoot))
    : repository;
  const cached = cachedProjectsByWorktree.get(repositoryRoot);

  const item: LocalProject = standardProjectWithKeywords({
    ...baseLocalProject(resolvedRepository, cloneDirectory, cachedProjectsByWorktree, options),
    worktree: repositoryRoot,
    repositoryRoot,
    isCloned: Boolean(localPath),
    remoteMismatch: localResult?.isMatch === false ? localResult : undefined,
    icon: options?.force ? undefined : cached?.icon,
    hasIcon: options?.force ? false : (cached?.hasIcon ?? false),
    name: resolvedRepository.name ?? resolvedRepository.repository,
    description: resolvedRepository.description,
    hasCustomName: resolvedRepository.hasCustomName,
    worktreeName: cached?.worktreeName,
    latestSessionTitle: cached?.latestSessionTitle,
    iconColor: cached?.iconColor,
    startupCommand: cached?.startupCommand,
    sandboxCount: cached?.sandboxCount ?? 0,
    updatedAt: cached?.updatedAt,
    isFavorite: cached?.isFavorite ?? false,
    relatedIds: cached?.relatedIds ?? [repository.remoteUrl],
  });

  const configuredFolders = resolvedRepository.folders.map((folder) =>
    configuredFolderProject(item, folder, cachedProjectsByWorktree.get(path.join(repositoryRoot, folder))),
  );

  return { item, configuredFolders, localPath, repository: resolvedRepository };
}

function readLocalFolderProjects(
  folderPath: string,
  cachedProjectsByWorktree?: Map<string, LocalProject>,
): LocalProject[] {
  const items: LocalProject[] = [];

  try {
    for (const entry of readdirSync(folderPath, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const worktree = path.join(folderPath, entry.name);
      const cached = cachedProjectsByWorktree?.get(worktree);
      const relatedIds = cached?.relatedIds ?? [worktree];
      items.push({
        id: cached?.id ?? worktree,
        worktree,
        name: cached?.name ?? path.basename(worktree),
        description: cached?.description,
        worktreeName: cached?.worktreeName,
        keywords: cached?.keywords,
        tags: cached?.tags,
        latestSessionTitle: cached?.latestSessionTitle,
        icon: cached?.icon,
        iconColor: cached?.iconColor,
        startupCommand: cached?.startupCommand,
        sandboxCount: cached?.sandboxCount ?? 0,
        updatedAt: cached?.updatedAt,
        hasIcon: cached?.hasIcon ?? false,
        isSessionOnly: cached?.isSessionOnly ?? false,
        isFavorite: cached?.isFavorite ?? false,
        relatedIds,
        remoteUrl: cached?.remoteUrl ?? worktree,
        isCloned: true,
        repositoryRoot: worktree,
      });
    }
  } catch {
    return [];
  }

  return items;
}

function loadResolvedLocalProjectSubpaths(
  resolvedProject: ResolvedLocalProject,
  repository: NormalizedRemoteProject,
  cachedProjectsByWorktree: Map<string, LocalProject>,
  options?: { force?: boolean; ignoredSubpaths?: string[] },
) {
  if ((!repository.subpaths.length && !repository.allSubpath) || !resolvedProject.localPath) return [];

  const localPath = resolvedProject.localPath;
  const rootIgnoredSubpaths = ignoredSubpathsForProjectDirectory(localPath, options?.ignoredSubpaths);
  const configuredFolderWorktrees = new Set(resolvedProject.configuredFolders.map((folder) => folder.worktree));
  const rootDiscoveredSubpaths = repository.allSubpath
    ? discoverRootConfigSubpaths(localPath, resolvedProject.item.removePathFromName ?? false)
    : [];
  const configuredSubpathProjects = localConfigSubpaths(localPath, [
    ...rootDiscoveredSubpaths,
    ...repository.subpaths,
  ]).flatMap((subpath) => {
    const parentDirectory = subpathDirectory(localPath, subpath);
    const removePathFromName = subpath.removePathFromName ?? resolvedProject.item.removePathFromName ?? false;
    const includeChildSubpaths = subpath.allSubpath ?? true;
    const parentProject =
      subpath.path === "." || configuredFolderWorktrees.has(parentDirectory) || !existsSync(parentDirectory)
        ? []
        : [
            subpathProject(
              resolvedProject.item,
              parentDirectory,
              subpath.path,
              removePathFromName,
              includeChildSubpaths,
              true,
              cachedProjectsByWorktree.get(parentDirectory),
            ),
          ].filter((project) => !shouldIgnoreSubpath(project.relativePath, rootIgnoredSubpaths));

    const childIgnoredSubpaths = ignoredSubpathsForProjectDirectory(parentDirectory, options?.ignoredSubpaths);
    const childProjects = includeChildSubpaths
      ? readLocalFolderProjects(parentDirectory, cachedProjectsByWorktree)
          .map((project) =>
            subpathProject(
              resolvedProject.item,
              project.worktree,
              path.basename(project.worktree),
              removePathFromName,
              false,
              false,
              project,
            ),
          )
          .filter((project) => !shouldIgnoreSubpath(project.relativePath, childIgnoredSubpaths))
      : [];

    return [...parentProject, ...childProjects];
  });
  const allSubpathProjects = repository.allSubpath
    ? readTopLevelSubpathDirectories(localPath)
        .map((worktree) => {
          const relativePath = relativeSubpath(resolvedProject.item.repositoryRoot, worktree);

          return subpathProject(
            resolvedProject.item,
            worktree,
            relativePath,
            resolvedProject.item.removePathFromName ?? false,
            false,
            false,
            cachedProjectsByWorktree.get(worktree),
          );
        })
        .filter((project) => !shouldIgnoreSubpath(project.relativePath, rootIgnoredSubpaths))
    : [];

  return uniqueLocalProjectsByWorktree(
    [...configuredSubpathProjects, ...allSubpathProjects].filter(
      (project) => !configuredFolderWorktrees.has(project.worktree),
    ),
  );
}

export async function loadLocalProjects(
  remoteProjects: RemoteProject[],
  options: LoadLocalProjectsOptions,
): Promise<LocalProject[]> {
  const startedAt = nowMs();
  const cloneDirectory = options.cloneDirectory;
  const cachedProjectsByWorktree = options.cachedProjectsByWorktree ?? new Map<string, LocalProject>();
  const repositories = remoteProjects.map(normalizeRemoteProject);
  const initialItems = sortLocalProjects(
    repositories.map((repository) => baseLocalProject(repository, cloneDirectory, cachedProjectsByWorktree, options)),
  );
  options.onUpdate?.(initialItems);

  const indexStartedAt = nowMs();
  const cloneParentDirectories = [
    ...new Set(repositories.map((repository) => repositoryCloneParentDirectory(repository, cloneDirectory))),
  ];
  const repositoryIndexByParentDirectory = new Map(
    await Promise.all(
      cloneParentDirectories.map(
        async (directory) =>
          [
            directory,
            await prepareCloneDirectoryIndex(directory, {
              force: options.force,
              cachePath: options.cloneIndexCachePath,
            }),
          ] as const,
      ),
    ),
  );
  logProjectLoadTiming("prepareCloneDirectoryIndex", indexStartedAt, {
    cloneDirectories: cloneParentDirectories.length,
    indexed: [...repositoryIndexByParentDirectory.values()].reduce(
      (count, repositoryIndex) => count + repositoryIndex.remoteUrlByWorktree.size,
      0,
    ),
  });

  const resolveStartedAt = nowMs();
  const resolvedProjects = await mapInBatches(repositories, projectResolveBatchSize, async (repository) =>
    resolveLocalProject(
      repository,
      cloneDirectory,
      cachedProjectsByWorktree,
      repositoryIndexByParentDirectory,
      options,
    ),
  );
  logProjectLoadTiming("resolveLocalProjects", resolveStartedAt, { repositories: repositories.length });

  const seenWorktrees = new Set<string>();
  const resolvedItems: LocalProject[] = [];
  for (const resolvedProject of resolvedProjects) {
    addUniqueLocalProjects(resolvedItems, seenWorktrees, [resolvedProject.item, ...resolvedProject.configuredFolders]);
  }
  options.onUpdate?.(sortLocalProjects(resolvedItems));

  const subpathStartedAt = nowMs();
  const items = [...resolvedItems];
  let subpathItemCount = 0;
  for (let start = 0; start < repositories.length; start += subpathLoadBatchSize) {
    const subpathGroups = await Promise.all(
      repositories.slice(start, start + subpathLoadBatchSize).map(async (repository, batchIndex) => {
        const index = start + batchIndex;
        const resolvedProject = resolvedProjects[index];
        if (!resolvedProject) return [];

        return loadResolvedLocalProjectSubpaths(
          resolvedProject,
          resolvedProject.repository,
          cachedProjectsByWorktree,
          options,
        );
      }),
    );

    for (const group of subpathGroups) {
      subpathItemCount += group.length;
      addUniqueLocalProjects(items, seenWorktrees, group);
    }
  }
  logProjectLoadTiming("loadLocalProjectSubpaths", subpathStartedAt, {
    repositories: repositories.length,
    subpathItems: subpathItemCount,
  });

  options.onUpdate?.(sortLocalProjects(items));

  const nextItems = sortLocalProjects(items);
  logProjectLoadTiming("loadLocalProjects", startedAt, {
    repositories: repositories.length,
    items: nextItems.length,
  });
  return nextItems;
}

export { projectKeywords, standardProjectWithKeywords };
