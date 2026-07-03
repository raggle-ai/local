"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.standardProjectWithKeywords = exports.projectKeywords = void 0;
exports.loadLocalProjects = loadLocalProjects;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const add_project_1 = require("../adapters/add-project");
const folder_mapping_1 = require("../core/folder-mapping");
const git_repository_1 = require("../adapters/git-repository");
const project_remote_1 = require("../core/project-remote");
const raggle_project_config_1 = require("../adapters/raggle-project-config");
const standard_project_clone_index_1 = require("../cache/standard-project-clone-index");
const project_keywords_1 = require("../core/project-keywords");
Object.defineProperty(exports, "projectKeywords", { enumerable: true, get: function () { return project_keywords_1.projectKeywords; } });
Object.defineProperty(exports, "standardProjectWithKeywords", { enumerable: true, get: function () { return project_keywords_1.standardProjectWithKeywords; } });
const projectResolveBatchSize = 24;
const subpathLoadBatchSize = 12;
const subpathAllFolderConfigFiles = ["kennel.json"];
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
function relativeSubpath(rootPath, worktree) {
    return node_path_1.default.relative(rootPath, worktree).split(node_path_1.default.sep).join("/");
}
function shouldIncludeAllSubpathDirectory(name) {
    return (!name.startsWith(".") &&
        !["node_modules", "dist", "build", "coverage", ".next", ".turbo", ".vercel", "target"].includes(name));
}
function readTopLevelSubpathDirectories(rootPath) {
    const directories = [];
    try {
        for (const entry of (0, node_fs_1.readdirSync)(rootPath, { withFileTypes: true })) {
            if (!entry.isDirectory() || !shouldIncludeAllSubpathDirectory(entry.name))
                continue;
            directories.push(node_path_1.default.join(rootPath, entry.name));
        }
    }
    catch {
        // Ignore folders that cannot be read while indexing optional project subpaths.
    }
    return directories;
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
function hasSubpathAllFolderConfig(directory) {
    return subpathAllFolderConfigFiles.some((configFile) => (0, node_fs_1.existsSync)(node_path_1.default.join(directory, configFile)));
}
function discoverLocalConfigSubpaths(parentSubpath, parentDirectory) {
    return readTopLevelSubpathDirectories(parentDirectory)
        .filter((directory) => hasSubpathAllFolderConfig(directory))
        .map((directory) => ({
        path: relativeSubpath(parentDirectory, directory),
        allSubpath: true,
        removePathFromName: parentSubpath.removePathFromName,
    }));
}
function discoverRootConfigSubpaths(rootPath, removePathFromName) {
    return readTopLevelSubpathDirectories(rootPath)
        .filter((directory) => hasSubpathAllFolderConfig(directory))
        .map((directory) => ({
        path: relativeSubpath(rootPath, directory),
        allSubpath: true,
        removePathFromName,
    }));
}
function localConfigSubpaths(rootPath, subpaths) {
    const subpathsByPath = new Map();
    const pendingSubpaths = [];
    for (const subpath of subpaths) {
        subpathsByPath.set(subpath.path, subpath);
        pendingSubpaths.push(subpath);
    }
    while (pendingSubpaths.length) {
        const parentSubpath = pendingSubpaths.shift();
        if (!parentSubpath)
            continue;
        const parentDirectory = subpathDirectory(rootPath, parentSubpath);
        if (!(0, node_fs_1.existsSync)(parentDirectory))
            continue;
        const config = (0, raggle_project_config_1.readRaggleProjectConfig)(parentDirectory);
        const discoveredSubpaths = discoverLocalConfigSubpaths(parentSubpath, parentDirectory);
        for (const childSubpath of [...(config.subpaths ?? []), ...discoveredSubpaths]) {
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
    return [...subpathsByPath.values()];
}
function subpathProject(parent, worktree, displayPath, removePathFromName, subpathAllSubpath, isSubpathRoot, cached) {
    const relativePath = relativeSubpath(parent.repositoryRoot, worktree);
    const fallbackName = (0, folder_mapping_1.subpathProjectName)(displayPath);
    return (0, project_keywords_1.standardProjectWithKeywords)({
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
function configuredFolderProject(parent, folder, cached) {
    const worktree = node_path_1.default.join(parent.repositoryRoot, ...folder.split("/"));
    const fallbackName = (0, folder_mapping_1.repoPrefixedProjectName)(parent, folder, parent.removePathFromName);
    return (0, project_keywords_1.standardProjectWithKeywords)({
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
    return (0, project_keywords_1.standardProjectWithKeywords)({
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
async function resolveLocalProject(repository, cloneDirectory, cachedProjectsByWorktree, repositoryIndexByParentDirectory, options) {
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
        ? (0, raggle_project_config_1.mergeRaggleProjectConfig)(repository, (0, raggle_project_config_1.readRaggleProjectConfig)(repositoryRoot))
        : repository;
    const cached = cachedProjectsByWorktree.get(repositoryRoot);
    const item = (0, project_keywords_1.standardProjectWithKeywords)({
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
function readLocalFolderProjects(folderPath, cachedProjectsByWorktree) {
    const items = [];
    try {
        for (const entry of (0, node_fs_1.readdirSync)(folderPath, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name.startsWith("."))
                continue;
            const worktree = node_path_1.default.join(folderPath, entry.name);
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
    }
    catch {
        return [];
    }
    return items;
}
function loadResolvedLocalProjectSubpaths(resolvedProject, repository, cachedProjectsByWorktree, options) {
    if ((!repository.subpaths.length && !repository.allSubpath) || !resolvedProject.localPath)
        return [];
    const localPath = resolvedProject.localPath;
    const rootIgnoredSubpaths = (0, raggle_project_config_1.ignoredSubpathsForProjectDirectory)(localPath, options?.ignoredSubpaths);
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
        const parentProject = subpath.path === "." || configuredFolderWorktrees.has(parentDirectory) || !(0, node_fs_1.existsSync)(parentDirectory)
            ? []
            : [
                subpathProject(resolvedProject.item, parentDirectory, subpath.path, removePathFromName, includeChildSubpaths, true, cachedProjectsByWorktree.get(parentDirectory)),
            ].filter((project) => !shouldIgnoreSubpath(project.relativePath, rootIgnoredSubpaths));
        const childIgnoredSubpaths = (0, raggle_project_config_1.ignoredSubpathsForProjectDirectory)(parentDirectory, options?.ignoredSubpaths);
        const childProjects = includeChildSubpaths
            ? readLocalFolderProjects(parentDirectory, cachedProjectsByWorktree)
                .map((project) => subpathProject(resolvedProject.item, project.worktree, node_path_1.default.basename(project.worktree), removePathFromName, false, false, project))
                .filter((project) => !shouldIgnoreSubpath(project.relativePath, childIgnoredSubpaths))
            : [];
        return [...parentProject, ...childProjects];
    });
    const allSubpathProjects = repository.allSubpath
        ? readTopLevelSubpathDirectories(localPath)
            .map((worktree) => {
            const relativePath = relativeSubpath(resolvedProject.item.repositoryRoot, worktree);
            return subpathProject(resolvedProject.item, worktree, relativePath, resolvedProject.item.removePathFromName ?? false, false, false, cachedProjectsByWorktree.get(worktree));
        })
            .filter((project) => !shouldIgnoreSubpath(project.relativePath, rootIgnoredSubpaths))
        : [];
    return uniqueLocalProjectsByWorktree([...configuredSubpathProjects, ...allSubpathProjects].filter((project) => !configuredFolderWorktrees.has(project.worktree)));
}
async function loadLocalProjects(remoteProjects, options) {
    const startedAt = nowMs();
    const cloneDirectory = options.cloneDirectory;
    const cachedProjectsByWorktree = options.cachedProjectsByWorktree ?? new Map();
    const repositories = remoteProjects.map(normalizeRemoteProject);
    const initialItems = sortLocalProjects(repositories.map((repository) => baseLocalProject(repository, cloneDirectory, cachedProjectsByWorktree, options)));
    options.onUpdate?.(initialItems);
    const indexStartedAt = nowMs();
    const cloneParentDirectories = [
        ...new Set(repositories.map((repository) => (0, add_project_1.repositoryCloneParentDirectory)(repository, cloneDirectory))),
    ];
    const repositoryIndexByParentDirectory = new Map(await Promise.all(cloneParentDirectories.map(async (directory) => [
        directory,
        await (0, standard_project_clone_index_1.prepareCloneDirectoryIndex)(directory, {
            force: options.force,
            cachePath: options.cloneIndexCachePath,
        }),
    ])));
    logProjectLoadTiming("prepareCloneDirectoryIndex", indexStartedAt, {
        cloneDirectories: cloneParentDirectories.length,
        indexed: [...repositoryIndexByParentDirectory.values()].reduce((count, repositoryIndex) => count + repositoryIndex.remoteUrlByWorktree.size, 0),
    });
    const resolveStartedAt = nowMs();
    const resolvedProjects = await mapInBatches(repositories, projectResolveBatchSize, async (repository) => resolveLocalProject(repository, cloneDirectory, cachedProjectsByWorktree, repositoryIndexByParentDirectory, options));
    logProjectLoadTiming("resolveLocalProjects", resolveStartedAt, { repositories: repositories.length });
    const seenWorktrees = new Set();
    const resolvedItems = [];
    for (const resolvedProject of resolvedProjects) {
        addUniqueLocalProjects(resolvedItems, seenWorktrees, [resolvedProject.item, ...resolvedProject.configuredFolders]);
    }
    options.onUpdate?.(sortLocalProjects(resolvedItems));
    const subpathStartedAt = nowMs();
    const items = [...resolvedItems];
    let subpathItemCount = 0;
    for (let start = 0; start < repositories.length; start += subpathLoadBatchSize) {
        const subpathGroups = await Promise.all(repositories.slice(start, start + subpathLoadBatchSize).map(async (repository, batchIndex) => {
            const index = start + batchIndex;
            const resolvedProject = resolvedProjects[index];
            if (!resolvedProject)
                return [];
            return loadResolvedLocalProjectSubpaths(resolvedProject, resolvedProject.repository, cachedProjectsByWorktree, options);
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
    options.onUpdate?.(sortLocalProjects(items));
    const nextItems = sortLocalProjects(items);
    logProjectLoadTiming("loadLocalProjects", startedAt, {
        repositories: repositories.length,
        items: nextItems.length,
    });
    return nextItems;
}
