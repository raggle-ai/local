"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.standardProjectWithKeywords = exports.projectKeywords = void 0;
exports.loadLocalProjects = loadLocalProjects;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const add_project_1 = require("../adapters/add-project");
const folder_mapping_1 = require("../core/folder-mapping");
const project_subpaths_1 = require("../core/project-subpaths");
const git_repository_1 = require("../adapters/git-repository");
const project_remote_1 = require("../core/project-remote");
const raggle_project_config_1 = require("../adapters/raggle-project-config");
const standard_project_clone_index_1 = require("../cache/standard-project-clone-index");
const project_keywords_1 = require("../core/project-keywords");
Object.defineProperty(exports, "projectKeywords", { enumerable: true, get: function () { return project_keywords_1.projectKeywords; } });
Object.defineProperty(exports, "standardProjectWithKeywords", { enumerable: true, get: function () { return project_keywords_1.standardProjectWithKeywords; } });
const project_load_update_1 = require("../core/project-load-update");
const projectResolveBatchSize = 24;
const subpathLoadBatchSize = 12;
const subpathAllFolderConfigFiles = ["kennel.json"];
const emptyDirectoryListing = { directories: [], files: new Set() };
const emptyResolvedConfig = Promise.resolve({ config: {} });
// Listings survive across loadLocalProjects calls, validated by directory
// mtime (which changes whenever a direct entry is added, removed, or renamed
// — the same invariant the clone index snapshot relies on). A hit costs one
// stat instead of a readdir round-trip.
const directoryListingCache = new Map();
function createFsSession(options) {
    const listings = new Map();
    const existence = new Map();
    const configs = new Map();
    const configFiles = (0, raggle_project_config_1.resolveProjectConfigFileNames)(options?.configFiles);
    const pathExists = (target) => {
        let exists = existence.get(target);
        if (exists === undefined) {
            exists = (0, node_fs_1.statSync)(target, { throwIfNoEntry: false }) !== undefined;
            existence.set(target, exists);
        }
        return exists;
    };
    const resolveConfigUncached = async (directory) => {
        for (const configFile of configFiles) {
            const configPath = directory + node_path_1.default.sep + configFile;
            if (!pathExists(configPath))
                continue;
            // undefined means a generic file (like index.json) that turned out not
            // to be a raggle config; keep looking through the remaining names.
            const config = await (0, raggle_project_config_1.readProjectConfigFileAsync)(configPath);
            if (config)
                return { config, configPath };
        }
        return { config: {} };
    };
    const resolveConfig = (directory) => {
        let resolved = configs.get(directory);
        if (!resolved) {
            resolved = configFiles.some((configFile) => pathExists(directory + node_path_1.default.sep + configFile))
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
                const stats = (0, node_fs_1.statSync)(directory, { throwIfNoEntry: false });
                if (!stats) {
                    listing = Promise.resolve(emptyDirectoryListing);
                    existence.set(directory, false);
                }
                else {
                    existence.set(directory, true);
                    const cached = directoryListingCache.get(directory);
                    if (!options?.force && cached && cached.mtimeMs === stats.mtimeMs) {
                        listing = Promise.resolve(cached.listing);
                    }
                    else {
                        const mtimeMs = stats.mtimeMs;
                        listing = (0, promises_1.readdir)(directory, { withFileTypes: true }).then((entries) => {
                            const directories = [];
                            const files = new Set();
                            for (const entry of entries) {
                                if (entry.isDirectory())
                                    directories.push(entry.name);
                                else
                                    files.add(entry.name);
                            }
                            const nextListing = { directories, files };
                            directoryListingCache.set(directory, { mtimeMs, listing: nextListing });
                            return nextListing;
                        }, () => emptyDirectoryListing);
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
function attachProjectKeywords(project) {
    project.keywords = (0, project_keywords_1.projectKeywords)(project);
    return project;
}
function nowMs() {
    return Date.now();
}
function logProjectLoadTiming(label, startedAt, details) {
    const durationMs = nowMs() - startedAt;
    const suffix = details ? ` ${JSON.stringify(details)}` : "";
    console.info(`[projects] ${label} ${durationMs}ms${suffix}`);
}
function normalizeRemoteProject(repository) {
    const remoteUrl = (0, git_repository_1.normalizeRepositoryUrl)(repository.remoteUrl);
    const name = repository.name?.trim();
    return {
        ...repository,
        remoteUrl,
        repository: repository.repository ?? (0, git_repository_1.repositoryName)(remoteUrl),
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
function sortLocalProjects(items) {
    return [...items].sort((a, b) => {
        if (a.isCloned !== b.isCloned)
            return a.isCloned ? -1 : 1;
        return (a.name ?? a.worktree).localeCompare(b.name ?? b.worktree);
    });
}
function uniqueLocalProjectsByWorktree(items) {
    const seenWorktrees = new Set();
    return items.filter((item) => {
        if (seenWorktrees.has(item.worktree))
            return false;
        seenWorktrees.add(item.worktree);
        return true;
    });
}
function addUniqueLocalProjects(target, seenWorktrees, items) {
    for (const item of items) {
        if (seenWorktrees.has(item.worktree))
            continue;
        seenWorktrees.add(item.worktree);
        target.push(item);
    }
}
async function mapInBatches(items, batchSize, mapper) {
    const results = new Array(items.length);
    for (let start = 0; start < items.length; start += batchSize) {
        const batch = items.slice(start, start + batchSize);
        await Promise.all(batch.map(async (item, batchIndex) => {
            const index = start + batchIndex;
            results[index] = await mapper(item, index);
        }));
    }
    return results;
}
function normalizedSubpathPattern(input) {
    return input
        .trim()
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .filter(Boolean)
        .join("/")
        .toLowerCase();
}
function shouldIgnoreSubpath(relativePath, ignoredSubpaths = []) {
    if (!relativePath || !ignoredSubpaths.length)
        return false;
    const normalizedPath = normalizedSubpathPattern(relativePath);
    if (!normalizedPath)
        return false;
    const segments = normalizedPath.split("/");
    return ignoredSubpaths.some((item) => {
        const ignored = normalizedSubpathPattern(item);
        if (!ignored)
            return false;
        if (!ignored.includes("/"))
            return segments.includes(ignored);
        return normalizedPath === ignored || normalizedPath.startsWith(`${ignored}/`);
    });
}
function shouldExcludeTopLevelFolder(relativePath, excludeFolders = []) {
    if (!relativePath || !excludeFolders.length)
        return false;
    const [topLevelFolder] = normalizedSubpathPattern(relativePath).split("/");
    return excludeFolders.some((item) => normalizedSubpathPattern(item).split("/")[0] === topLevelFolder);
}
function relativeSubpath(rootPath, worktree) {
    // Worktrees are constructed under rootPath in the hot paths, so slicing
    // avoids path.relative's double resolve.
    if (worktree.startsWith(rootPath + node_path_1.default.sep)) {
        return worktree
            .slice(rootPath.length + 1)
            .split(node_path_1.default.sep)
            .join("/");
    }
    return node_path_1.default.relative(rootPath, worktree).split(node_path_1.default.sep).join("/");
}
async function readTopLevelSubpathDirectories(session, rootPath) {
    const listing = await session.listDirectory(rootPath);
    return listing.directories
        .filter((name) => (0, project_subpaths_1.shouldIncludeSubpathDirectory)(name))
        .map((name) => rootPath + node_path_1.default.sep + name);
}
function subpathDirectory(rootPath, subpath) {
    return subpath.path === "." ? rootPath : node_path_1.default.join(rootPath, ...subpath.path.split("/"));
}
function nestedSubpathPath(parentPath, childPath) {
    if (childPath === ".")
        return parentPath;
    if (parentPath === ".")
        return childPath;
    return `${parentPath}/${childPath}`;
}
function hasSubpathAllFolderConfig(session, directory, markerFiles) {
    return markerFiles.some((configFile) => session.pathExists(directory + node_path_1.default.sep + configFile));
}
async function discoverConfigSubpaths(session, parentDirectory, markerFiles, removePathFromName) {
    const directories = await readTopLevelSubpathDirectories(session, parentDirectory);
    return directories
        .filter((directory) => hasSubpathAllFolderConfig(session, directory, markerFiles))
        .map((directory) => ({
        path: relativeSubpath(parentDirectory, directory),
        allSubpath: true,
        removePathFromName,
    }));
}
async function localConfigSubpaths(session, rootPath, subpaths, markerFiles) {
    const subpathsByPath = new Map();
    let pendingSubpaths = [];
    for (const subpath of subpaths) {
        subpathsByPath.set(subpath.path, subpath);
        pendingSubpaths.push(subpath);
    }
    while (pendingSubpaths.length) {
        const wave = pendingSubpaths;
        pendingSubpaths = [];
        const waveResults = await Promise.all(wave.map(async (parentSubpath) => {
            const parentDirectory = subpathDirectory(rootPath, parentSubpath);
            if (!session.pathExists(parentDirectory))
                return undefined;
            const [config, discoveredSubpaths] = await Promise.all([
                session.readConfig(parentDirectory),
                discoverConfigSubpaths(session, parentDirectory, markerFiles, parentSubpath.removePathFromName),
            ]);
            return { parentSubpath, config, discoveredSubpaths };
        }));
        for (const result of waveResults) {
            if (!result)
                continue;
            const { parentSubpath, config, discoveredSubpaths } = result;
            const allSubpaths = config.allSubpath === true || config.allSubpaths === true
                ? (await readTopLevelSubpathDirectories(session, subpathDirectory(rootPath, parentSubpath))).map((directory) => ({
                    path: relativeSubpath(subpathDirectory(rootPath, parentSubpath), directory),
                    allSubpath: true,
                    removePathFromName: config.removePathFromName ?? parentSubpath.removePathFromName,
                }))
                : [];
            for (const childSubpath of [...(config.subpaths ?? []), ...allSubpaths, ...discoveredSubpaths]) {
                const childPath = nestedSubpathPath(parentSubpath.path, childSubpath.path);
                if (subpathsByPath.has(childPath))
                    continue;
                const nestedSubpath = {
                    ...childSubpath,
                    path: childPath,
                    removePathFromName: childSubpath.removePathFromName ?? config.removePathFromName ?? parentSubpath.removePathFromName,
                };
                subpathsByPath.set(childPath, nestedSubpath);
                pendingSubpaths.push(nestedSubpath);
            }
        }
    }
    return [...subpathsByPath.values()];
}
function subpathProject(parent, worktree, displayPath, removePathFromName, subpathAllSubpath, isSubpathRoot, cached) {
    const relativePath = relativeSubpath(parent.repositoryRoot, worktree);
    const fallbackName = (0, folder_mapping_1.subpathProjectName)(displayPath);
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
        hasCustomName: parent.hasCustomName,
        remoteMismatch: parent.remoteMismatch,
        isCloned: true,
    });
}
function configuredFolderProject(parent, folder, cached) {
    const worktree = node_path_1.default.join(parent.repositoryRoot, ...folder.split("/"));
    const fallbackName = (0, folder_mapping_1.repoPrefixedProjectName)(parent, folder, parent.removePathFromName);
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
        isCloned: parent.isCloned && (0, node_fs_1.existsSync)(worktree),
    });
}
function baseLocalProject(repository, cloneDirectory, cachedProjectsByWorktree, options) {
    const repositoryRoot = (0, add_project_1.repositoryRootPath)(repository, cloneDirectory);
    const cached = cachedProjectsByWorktree.get(repositoryRoot);
    const isCloned = (0, node_fs_1.existsSync)(node_path_1.default.join(repositoryRoot, ".git"));
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
        browserUrl: (0, project_remote_1.remoteToBrowserUrl)(repository.remoteUrl),
        removePathFromName: repository.removePathFromName,
        allSubpath: repository.allSubpath,
        isCloned,
    });
}
async function resolveLocalProject(session, repository, cloneDirectory, cachedProjectsByWorktree, repositoryIndexByParentDirectory, options) {
    const expectedDirectory = (0, add_project_1.repositoryRootPath)(repository, cloneDirectory);
    const cloneParentDirectory = node_path_1.default.dirname(expectedDirectory);
    const repositoryIndex = repositoryIndexByParentDirectory.get(cloneParentDirectory) ?? {
        worktreeByRepositoryKey: new Map(),
        remoteUrlByWorktree: new Map(),
    };
    const localResult = await (0, standard_project_clone_index_1.findLocalRepository)(repository.remoteUrl, expectedDirectory, repositoryIndex);
    const localPath = localResult?.isMatch || localResult?.worktree === expectedDirectory ? localResult.worktree : undefined;
    const repositoryRoot = localPath ?? expectedDirectory;
    const resolvedRepository = localPath
        ? (0, raggle_project_config_1.mergeRaggleProjectConfig)(repository, await session.readConfig(repositoryRoot))
        : repository;
    const cached = cachedProjectsByWorktree.get(repositoryRoot);
    const item = attachProjectKeywords({
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
    const configuredFolders = resolvedRepository.folders.map((folder) => configuredFolderProject(item, folder, cachedProjectsByWorktree.get(node_path_1.default.join(repositoryRoot, folder))));
    return { item, configuredFolders, localPath, repository: resolvedRepository };
}
async function readLocalFolderProjects(session, folderPath, cachedProjectsByWorktree) {
    const items = [];
    const listing = await session.listDirectory(folderPath);
    for (const name of listing.directories) {
        if (!(0, project_subpaths_1.shouldIncludeSubpathDirectory)(name))
            continue;
        const worktree = folderPath + node_path_1.default.sep + name;
        const cached = cachedProjectsByWorktree?.get(worktree);
        const relatedIds = cached?.relatedIds ?? [worktree];
        items.push({
            id: cached?.id ?? worktree,
            worktree,
            name: cached?.name ?? node_path_1.default.basename(worktree),
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
async function inheritedIgnoredSubpaths(session, rootPath, relativePath, rootIgnoredSubpaths) {
    const segments = relativePath === "." ? [] : relativePath.split("/");
    const configs = await Promise.all(segments.map((_, index) => session.readConfig(node_path_1.default.join(rootPath, ...segments.slice(0, index + 1)))));
    return (0, raggle_project_config_1.mergeIgnoredSubpaths)(rootIgnoredSubpaths, ...configs.map((config) => config.ignoredSubpaths));
}
async function loadResolvedLocalProjectSubpaths(session, resolvedProject, repository, cachedProjectsByWorktree, markerFiles, options) {
    const hasCustomMarkers = Boolean(options?.subpathMarkerFiles?.length);
    if ((!repository.subpaths.length && !repository.allSubpath && !hasCustomMarkers) || !resolvedProject.localPath) {
        return [];
    }
    const localPath = resolvedProject.localPath;
    const rootConfigResolution = await session.resolveConfig(localPath);
    const rootConfig = rootConfigResolution.config;
    const rootIgnoredSubpaths = (0, raggle_project_config_1.mergeIgnoredSubpaths)(options?.ignoredSubpaths, rootConfig.ignoredSubpaths);
    const rootExcludedFolders = rootConfig.excludeFolders ?? [];
    const configuredFolderWorktrees = new Set(resolvedProject.configuredFolders.map((folder) => folder.worktree));
    // Custom marker files extend discovery to repositories that opted in with a
    // recognized root config file but did not set allSubpath or list the folders
    // explicitly.
    const discoverRootSubpaths = repository.allSubpath || (hasCustomMarkers && rootConfigResolution.configPath !== undefined);
    const rootAllSubpaths = repository.allSubpath
        ? (await readTopLevelSubpathDirectories(session, localPath)).map((directory) => ({
            path: relativeSubpath(localPath, directory),
            allSubpath: true,
            removePathFromName: resolvedProject.item.removePathFromName ?? false,
        }))
        : [];
    const rootDiscoveredSubpaths = discoverRootSubpaths
        ? await discoverConfigSubpaths(session, localPath, markerFiles, resolvedProject.item.removePathFromName ?? false)
        : [];
    const configuredSubpaths = await localConfigSubpaths(session, localPath, [...rootAllSubpaths, ...rootDiscoveredSubpaths, ...repository.subpaths], markerFiles);
    const configuredSubpathGroups = await Promise.all(configuredSubpaths.map(async (subpath) => {
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
        const parentProject = subpath.path === "." || configuredFolderWorktrees.has(parentDirectory) || !parentExists
            ? []
            : [
                subpathProject(resolvedProject.item, parentDirectory, subpath.path, removePathFromName, includeChildSubpaths, true, cachedProjectsByWorktree.get(parentDirectory)),
            ].filter((project) => !shouldIgnoreSubpath(project.relativePath, inheritedIgnored) &&
                !shouldExcludeTopLevelFolder(project.relativePath, rootExcludedFolders));
        const childProjects = localFolderProjects
            .map((project) => subpathProject(resolvedProject.item, project.worktree, node_path_1.default.basename(project.worktree), removePathFromName, false, false, project))
            .filter((project) => !shouldIgnoreSubpath(project.relativePath, inheritedIgnored) &&
            !shouldExcludeTopLevelFolder(project.relativePath, rootExcludedFolders));
        return [...parentProject, ...childProjects];
    }));
    const configuredSubpathProjects = configuredSubpathGroups.flat();
    return uniqueLocalProjectsByWorktree(configuredSubpathProjects.filter((project) => !configuredFolderWorktrees.has(project.worktree)));
}
async function loadLocalProjects(remoteProjects, options) {
    const startedAt = nowMs();
    const session = createFsSession({ force: options.force, configFiles: options.projectConfigFiles });
    const subpathMarkerFiles = [...new Set([...subpathAllFolderConfigFiles, ...(options.subpathMarkerFiles ?? [])])];
    const cloneDirectory = options.cloneDirectory;
    const cachedProjectsByWorktree = options.cachedProjectsByWorktree ?? new Map();
    const repositories = remoteProjects.map(normalizeRemoteProject);
    const previousItems = options.previousItems ?? [];
    const emitUpdate = (items, phase) => {
        options.onUpdate?.(items, (0, project_load_update_1.createLocalProjectUpdate)(previousItems, items, phase));
    };
    const initialItems = sortLocalProjects(repositories.map((repository) => baseLocalProject(repository, cloneDirectory, cachedProjectsByWorktree, options)));
    emitUpdate(initialItems, "repositories");
    const indexStartedAt = nowMs();
    const cloneParentDirectories = [
        ...new Set(repositories.map((repository) => (0, add_project_1.repositoryCloneParentDirectory)(repository, cloneDirectory))),
    ];
    const repositoryIndexByParentDirectory = new Map(await Promise.all(cloneParentDirectories.map(async (directory) => [
        directory,
        await (0, standard_project_clone_index_1.prepareCloneDirectoryIndex)(directory, {
            force: options.force,
            cachePath: options.cloneIndexCachePath,
            scannedRepositories: directory === cloneDirectory ? options.scannedRepositories : undefined,
        }),
    ])));
    logProjectLoadTiming("prepareCloneDirectoryIndex", indexStartedAt, {
        cloneDirectories: cloneParentDirectories.length,
        indexed: [...repositoryIndexByParentDirectory.values()].reduce((count, repositoryIndex) => count + repositoryIndex.remoteUrlByWorktree.size, 0),
    });
    const resolveStartedAt = nowMs();
    const resolvedProjects = await mapInBatches(repositories, projectResolveBatchSize, async (repository) => resolveLocalProject(session, repository, cloneDirectory, cachedProjectsByWorktree, repositoryIndexByParentDirectory, options));
    logProjectLoadTiming("resolveLocalProjects", resolveStartedAt, { repositories: repositories.length });
    const seenWorktrees = new Set();
    const resolvedItems = [];
    for (const resolvedProject of resolvedProjects) {
        addUniqueLocalProjects(resolvedItems, seenWorktrees, [resolvedProject.item, ...resolvedProject.configuredFolders]);
    }
    emitUpdate(sortLocalProjects(resolvedItems), "resolved");
    const subpathStartedAt = nowMs();
    const items = [...resolvedItems];
    let subpathItemCount = 0;
    for (let start = 0; start < repositories.length; start += subpathLoadBatchSize) {
        const subpathGroups = await Promise.all(repositories.slice(start, start + subpathLoadBatchSize).map(async (repository, batchIndex) => {
            const index = start + batchIndex;
            const resolvedProject = resolvedProjects[index];
            if (!resolvedProject)
                return [];
            return loadResolvedLocalProjectSubpaths(session, resolvedProject, resolvedProject.repository, cachedProjectsByWorktree, subpathMarkerFiles, options);
        }));
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
