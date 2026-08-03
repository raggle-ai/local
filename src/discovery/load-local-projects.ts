import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { repositoryCloneParentDirectory, repositoryRootPath } from "../adapters/add-project";
import { repoPrefixedProjectName, subpathProjectName } from "../core/folder-mapping";
import { shouldIncludeSubpathDirectory, type ImportedRepositorySubpath } from "../core/project-subpaths";
import { normalizeRepositoryUrl, repositoryName } from "../adapters/git-repository";
import { remoteToBrowserUrl } from "../core/project-remote";
import {
  mergeIgnoredSubpaths,
  mergeRaggleProjectConfig,
  readProjectConfigFileAsync,
  resolveProjectConfigFileNames,
  type RaggleProjectConfig,
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
import { createLocalProjectUpdate } from "../core/project-load-update";

const projectResolveBatchSize = 24;
const subpathLoadBatchSize = 12;
const subpathAllFolderConfigFiles = ["kennel.json"];

type DirectoryListing = {
  directories: string[];
  files: Set<string>;
};

// Memoizes filesystem reads for the duration of one loadLocalProjects call so
// directories and configs consulted by multiple phases are only read once.
// Existence checks use statSync with throwIfNoEntry so misses never allocate
// an exception, which dominates fs/promises probes for absent paths.
type ResolvedProjectConfig = {
  config: RaggleProjectConfig;
  /** Set when a recognized config file was found; unrelated generic files do not count. */
  configPath?: string;
};

type FsSession = {
  listDirectory: (directory: string) => Promise<DirectoryListing>;
  pathExists: (target: string) => boolean;
  resolveConfig: (directory: string) => Promise<ResolvedProjectConfig>;
  readConfig: (directory: string) => Promise<RaggleProjectConfig>;
};

const emptyDirectoryListing: DirectoryListing = { directories: [], files: new Set() };
const emptyResolvedConfig: Promise<ResolvedProjectConfig> = Promise.resolve({ config: {} });

// Listings survive across loadLocalProjects calls, validated by directory
// mtime (which changes whenever a direct entry is added, removed, or renamed
// — the same invariant the clone index snapshot relies on). A hit costs one
// stat instead of a readdir round-trip.
const directoryListingCache = new Map<string, { mtimeMs: number; listing: DirectoryListing }>();

function createFsSession(options?: { force?: boolean; configFiles?: string[] }): FsSession {
  const listings = new Map<string, Promise<DirectoryListing>>();
  const existence = new Map<string, boolean>();
  const configs = new Map<string, Promise<ResolvedProjectConfig>>();
  const configFiles = resolveProjectConfigFileNames(options?.configFiles);

  const pathExists = (target: string) => {
    let exists = existence.get(target);
    if (exists === undefined) {
      exists = statSync(target, { throwIfNoEntry: false }) !== undefined;
      existence.set(target, exists);
    }
    return exists;
  };

  const resolveConfigUncached = async (directory: string): Promise<ResolvedProjectConfig> => {
    for (const configFile of configFiles) {
      const configPath = directory + path.sep + configFile;
      if (!pathExists(configPath)) continue;

      // undefined means a generic file (like index.json) that turned out not
      // to be a raggle config; keep looking through the remaining names.
      const config = await readProjectConfigFileAsync(configPath);
      if (config) return { config, configPath };
    }
    return { config: {} };
  };

  const resolveConfig = (directory: string) => {
    let resolved = configs.get(directory);
    if (!resolved) {
      resolved = configFiles.some((configFile) => pathExists(directory + path.sep + configFile))
        ? resolveConfigUncached(directory)
        : emptyResolvedConfig;
      configs.set(directory, resolved);
    }
    return resolved;
  };

  return {
    listDirectory(directory) {
      let listing = listings.get(directory);
      if (!listing) {
        const stats = statSync(directory, { throwIfNoEntry: false });
        if (!stats) {
          listing = Promise.resolve(emptyDirectoryListing);
          existence.set(directory, false);
        } else {
          existence.set(directory, true);
          const cached = directoryListingCache.get(directory);
          if (!options?.force && cached && cached.mtimeMs === stats.mtimeMs) {
            listing = Promise.resolve(cached.listing);
          } else {
            const mtimeMs = stats.mtimeMs;
            listing = readdir(directory, { withFileTypes: true }).then(
              (entries) => {
                const directories: string[] = [];
                const files = new Set<string>();
                for (const entry of entries) {
                  if (entry.isDirectory()) directories.push(entry.name);
                  else files.add(entry.name);
                }
                const nextListing = { directories, files };
                directoryListingCache.set(directory, { mtimeMs, listing: nextListing });
                return nextListing;
              },
              () => emptyDirectoryListing,
            );
          }
        }
        listings.set(directory, listing);
      }
      return listing;
    },
    pathExists,
    resolveConfig,
    async readConfig(directory) {
      return (await resolveConfig(directory)).config;
    },
  };
}

// Attaches keywords to a freshly constructed project without re-spreading it;
// only safe because every caller passes an object it just created.
function attachProjectKeywords(project: LocalProject): LocalProject {
  project.keywords = projectKeywords(project);
  return project;
}

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
    allTopLevelFolders: repository.allTopLevelFolders ?? false,
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

function shouldExcludeTopLevelFolder(relativePath: string | undefined, excludeFolders: string[] = []) {
  if (!relativePath || !excludeFolders.length) return false;

  const [topLevelFolder] = normalizedSubpathPattern(relativePath).split("/");
  return excludeFolders.some((item) => normalizedSubpathPattern(item).split("/")[0] === topLevelFolder);
}

function relativeSubpath(rootPath: string, worktree: string) {
  // Worktrees are constructed under rootPath in the hot paths, so slicing
  // avoids path.relative's double resolve.
  if (worktree.startsWith(rootPath + path.sep)) {
    return worktree
      .slice(rootPath.length + 1)
      .split(path.sep)
      .join("/");
  }
  return path.relative(rootPath, worktree).split(path.sep).join("/");
}

async function readTopLevelSubpathDirectories(session: FsSession, rootPath: string) {
  const listing = await session.listDirectory(rootPath);
  return listing.directories
    .filter((name) => shouldIncludeSubpathDirectory(name))
    .map((name) => rootPath + path.sep + name);
}

async function discoverAllFolderSubpaths(
  session: FsSession,
  rootPath: string,
  parentPath = ".",
  removePathFromName?: boolean,
) {
  const subpaths: ImportedRepositorySubpath[] = [];
  let directories = [subpathDirectory(rootPath, { path: parentPath })];

  while (directories.length) {
    const children = (
      await Promise.all(
        directories.map(async (directory) => {
          const listing = await session.listDirectory(directory);
          return listing.directories.filter(shouldIncludeSubpathDirectory).map((name) => directory + path.sep + name);
        }),
      )
    ).flat();

    for (const directory of children) {
      subpaths.push({
        path: relativeSubpath(rootPath, directory),
        allSubpath: false,
        removePathFromName,
      });
    }
    directories = children;
  }

  return subpaths;
}

function subpathDirectory(rootPath: string, subpath: ImportedRepositorySubpath) {
  return subpath.path === "." ? rootPath : path.join(rootPath, ...subpath.path.split("/"));
}

function nestedSubpathPath(parentPath: string, childPath: string) {
  if (childPath === ".") return parentPath;
  if (parentPath === ".") return childPath;
  return `${parentPath}/${childPath}`;
}

function hasSubpathAllFolderConfig(session: FsSession, directory: string, markerFiles: string[]) {
  return markerFiles.some((configFile) => session.pathExists(directory + path.sep + configFile));
}

async function discoverConfigSubpaths(
  session: FsSession,
  parentDirectory: string,
  markerFiles: string[],
  removePathFromName?: boolean,
) {
  const directories = await readTopLevelSubpathDirectories(session, parentDirectory);

  return directories
    .filter((directory) => hasSubpathAllFolderConfig(session, directory, markerFiles))
    .map((directory) => ({
      path: relativeSubpath(parentDirectory, directory),
      allSubpath: true,
      removePathFromName,
    }));
}

async function localConfigSubpaths(
  session: FsSession,
  rootPath: string,
  subpaths: ImportedRepositorySubpath[],
  markerFiles: string[],
) {
  const subpathsByPath = new Map<string, ImportedRepositorySubpath>();
  let pendingSubpaths: ImportedRepositorySubpath[] = [];

  for (const subpath of subpaths) {
    subpathsByPath.set(subpath.path, subpath);
    pendingSubpaths.push(subpath);
  }

  while (pendingSubpaths.length) {
    const wave = pendingSubpaths;
    pendingSubpaths = [];

    const waveResults = await Promise.all(
      wave.map(async (parentSubpath) => {
        const parentDirectory = subpathDirectory(rootPath, parentSubpath);
        if (!session.pathExists(parentDirectory)) return undefined;

        const [config, discoveredSubpaths] = await Promise.all([
          session.readConfig(parentDirectory),
          discoverConfigSubpaths(session, parentDirectory, markerFiles, parentSubpath.removePathFromName),
        ]);
        return { parentSubpath, config, discoveredSubpaths };
      }),
    );

    for (const result of waveResults) {
      if (!result) continue;

      const { parentSubpath, config, discoveredSubpaths } = result;
      const allSubpaths =
        config.allSubpaths === true
          ? await discoverAllFolderSubpaths(
              session,
              rootPath,
              parentSubpath.path,
              config.removePathFromName ?? parentSubpath.removePathFromName,
            )
          : [];
      const allTopLevelFolders = config.allTopLevelFolders
        ? (await readTopLevelSubpathDirectories(session, subpathDirectory(rootPath, parentSubpath))).map(
            (directory) => ({
              path: nestedSubpathPath(parentSubpath.path, path.basename(directory)),
              allSubpath: false,
              removePathFromName: config.removePathFromName ?? parentSubpath.removePathFromName,
            }),
          )
        : [];
      const configuredChildren = (config.subpaths ?? []).map((childSubpath) => ({
        ...childSubpath,
        path: nestedSubpathPath(parentSubpath.path, childSubpath.path),
      }));
      const discoveredChildren = discoveredSubpaths.map((childSubpath) => ({
        ...childSubpath,
        path: nestedSubpathPath(parentSubpath.path, childSubpath.path),
      }));
      for (const childSubpath of [...configuredChildren, ...allSubpaths, ...discoveredChildren]) {
        const childPath = childSubpath.path;
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
      for (const childSubpath of allTopLevelFolders) {
        if (!subpathsByPath.has(childSubpath.path)) subpathsByPath.set(childSubpath.path, childSubpath);
      }
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

  // Built field-by-field instead of spreading parent: this runs once per
  // subpath item and the spread dominated the profile.
  return attachProjectKeywords({
    id: cached?.id ?? `${parent.remoteUrl}#${relativePath}`,
    worktree,
    repositoryRoot: parent.repositoryRoot,
    parentProjectName: parent.name,
    relativePath,
    isSubpathRoot,
    subpathAllSubpath,
    name: fallbackName,
    description: parent.description,
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
    plugins: parent.plugins,
    remoteUrl: parent.remoteUrl,
    browserUrl: parent.browserUrl,
    allSubpath: parent.allSubpath,
    allTopLevelFolders: parent.allTopLevelFolders,
    hasCustomName: parent.hasCustomName,
    remoteMismatch: parent.remoteMismatch,
    isCloned: true,
  });
}

function configuredFolderProject(parent: LocalProject, folder: string, cached?: LocalProject): LocalProject {
  const worktree = path.join(parent.repositoryRoot, ...folder.split("/"));
  const fallbackName = repoPrefixedProjectName(parent, folder, parent.removePathFromName);

  return attachProjectKeywords({
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

  return attachProjectKeywords({
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
    allTopLevelFolders: repository.allTopLevelFolders,
    isCloned,
  } satisfies LocalProject);
}

async function resolveLocalProject(
  session: FsSession,
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
    ? mergeRaggleProjectConfig(repository, await session.readConfig(repositoryRoot))
    : repository;
  const cached = cachedProjectsByWorktree.get(repositoryRoot);

  const item: LocalProject = attachProjectKeywords({
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

async function readLocalFolderProjects(
  session: FsSession,
  folderPath: string,
  cachedProjectsByWorktree?: Map<string, LocalProject>,
): Promise<LocalProject[]> {
  const items: LocalProject[] = [];
  const listing = await session.listDirectory(folderPath);

  for (const name of listing.directories) {
    if (!shouldIncludeSubpathDirectory(name)) continue;
    const worktree = folderPath + path.sep + name;
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

  return items;
}

async function inheritedIgnoredSubpaths(
  session: FsSession,
  rootPath: string,
  relativePath: string,
  rootIgnoredSubpaths: string[],
) {
  const segments = relativePath === "." ? [] : relativePath.split("/");
  const configs = await Promise.all(
    segments.map((_, index) => session.readConfig(path.join(rootPath, ...segments.slice(0, index + 1)))),
  );

  return mergeIgnoredSubpaths(rootIgnoredSubpaths, ...configs.map((config) => config.ignoredSubpaths));
}

async function loadResolvedLocalProjectSubpaths(
  session: FsSession,
  resolvedProject: ResolvedLocalProject,
  repository: NormalizedRemoteProject,
  cachedProjectsByWorktree: Map<string, LocalProject>,
  markerFiles: string[],
  options?: { force?: boolean; ignoredSubpaths?: string[]; subpathMarkerFiles?: string[] },
): Promise<LocalProject[]> {
  const hasCustomMarkers = Boolean(options?.subpathMarkerFiles?.length);
  if (
    (!repository.subpaths.length && !repository.allSubpath && !repository.allTopLevelFolders && !hasCustomMarkers) ||
    !resolvedProject.localPath
  ) {
    return [];
  }

  const localPath = resolvedProject.localPath;
  const rootConfigResolution = await session.resolveConfig(localPath);
  const rootConfig = rootConfigResolution.config;
  const rootIgnoredSubpaths = mergeIgnoredSubpaths(options?.ignoredSubpaths, rootConfig.ignoredSubpaths);
  const rootExcludedFolders = rootConfig.excludeFolders ?? [];
  const configuredFolderWorktrees = new Set(resolvedProject.configuredFolders.map((folder) => folder.worktree));
  // Custom marker files extend discovery to repositories that opted in with a
  // recognized root config file but did not set allSubpath or list the folders
  // explicitly.
  const discoverRootSubpaths =
    repository.allSubpath ||
    repository.allTopLevelFolders ||
    (hasCustomMarkers && rootConfigResolution.configPath !== undefined);
  const rootAllSubpaths = repository.allSubpath
    ? await discoverAllFolderSubpaths(session, localPath, ".", resolvedProject.item.removePathFromName ?? false)
    : [];
  const rootTopLevelFolders = repository.allTopLevelFolders
    ? (await readTopLevelSubpathDirectories(session, localPath)).map((directory) => ({
        path: relativeSubpath(localPath, directory),
        allSubpath: false,
        removePathFromName: resolvedProject.item.removePathFromName ?? false,
      }))
    : [];
  const rootDiscoveredSubpaths = discoverRootSubpaths
    ? await discoverConfigSubpaths(session, localPath, markerFiles, resolvedProject.item.removePathFromName ?? false)
    : [];
  const configuredSubpaths = await localConfigSubpaths(
    session,
    localPath,
    [...rootAllSubpaths, ...rootDiscoveredSubpaths, ...repository.subpaths],
    markerFiles,
  );
  for (const folder of rootTopLevelFolders) {
    if (!configuredSubpaths.some((subpath) => subpath.path === folder.path)) configuredSubpaths.push(folder);
  }
  const configuredSubpathGroups = await Promise.all(
    configuredSubpaths.map(async (subpath) => {
      const parentDirectory = subpathDirectory(localPath, subpath);
      const removePathFromName = subpath.removePathFromName ?? resolvedProject.item.removePathFromName ?? false;
      const includeChildSubpaths = subpath.allSubpath ?? true;
      const parentExists = session.pathExists(parentDirectory);
      const [localFolderProjects, inheritedIgnored] = await Promise.all([
        includeChildSubpaths
          ? readLocalFolderProjects(session, parentDirectory, cachedProjectsByWorktree)
          : Promise.resolve([]),
        inheritedIgnoredSubpaths(session, localPath, subpath.path, rootIgnoredSubpaths),
      ]);

      const parentProject =
        subpath.path === "." || configuredFolderWorktrees.has(parentDirectory) || !parentExists
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
            ].filter(
              (project) =>
                !shouldIgnoreSubpath(project.relativePath, inheritedIgnored) &&
                !shouldExcludeTopLevelFolder(project.relativePath, rootExcludedFolders),
            );

      const childProjects = localFolderProjects
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
        .filter(
          (project) =>
            !shouldIgnoreSubpath(project.relativePath, inheritedIgnored) &&
            !shouldExcludeTopLevelFolder(project.relativePath, rootExcludedFolders),
        );

      return [...parentProject, ...childProjects];
    }),
  );
  const configuredSubpathProjects = configuredSubpathGroups.flat();

  return uniqueLocalProjectsByWorktree(
    configuredSubpathProjects.filter((project) => !configuredFolderWorktrees.has(project.worktree)),
  );
}

export async function loadLocalProjects(
  remoteProjects: RemoteProject[],
  options: LoadLocalProjectsOptions,
): Promise<LocalProject[]> {
  const startedAt = nowMs();
  const session = createFsSession({ force: options.force, configFiles: options.projectConfigFiles });
  const subpathMarkerFiles = [...new Set([...subpathAllFolderConfigFiles, ...(options.subpathMarkerFiles ?? [])])];
  const cloneDirectory = options.cloneDirectory;
  const cachedProjectsByWorktree = options.cachedProjectsByWorktree ?? new Map<string, LocalProject>();
  const repositories = remoteProjects.map(normalizeRemoteProject);
  const previousItems = options.previousItems ?? [];
  const emitUpdate = (items: LocalProject[], phase: "repositories" | "resolved" | "subpaths") => {
    options.onUpdate?.(items, createLocalProjectUpdate(previousItems, items, phase));
  };
  const initialItems = sortLocalProjects(
    repositories.map((repository) => baseLocalProject(repository, cloneDirectory, cachedProjectsByWorktree, options)),
  );
  emitUpdate(initialItems, "repositories");

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
              scannedRepositories: directory === cloneDirectory ? options.scannedRepositories : undefined,
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
      session,
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
  emitUpdate(sortLocalProjects(resolvedItems), "resolved");

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
          session,
          resolvedProject,
          resolvedProject.repository,
          cachedProjectsByWorktree,
          subpathMarkerFiles,
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

  const nextItems = sortLocalProjects(items);
  emitUpdate(nextItems, "subpaths");
  logProjectLoadTiming("loadLocalProjects", startedAt, {
    repositories: repositories.length,
    items: nextItems.length,
  });
  return nextItems;
}

export { projectKeywords, standardProjectWithKeywords };
