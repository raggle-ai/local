"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findLocalRepository = findLocalRepository;
exports.prepareCloneDirectoryIndex = prepareCloneDirectoryIndex;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const git_repository_1 = require("../adapters/git-repository");
const local_repository_candidate_1 = require("../core/local-repository-candidate");
const scanner_1 = require("../discovery/scanner");
let cloneIndexMemoryCache;
function nowMs() {
    return Date.now();
}
function logProjectLoadTiming(label, startedAt, details) {
    const durationMs = nowMs() - startedAt;
    const suffix = details ? ` ${JSON.stringify(details)}` : "";
    console.info(`[projects] ${label} ${durationMs}ms${suffix}`);
}
function readJsonFile(filePath, fallback) {
    try {
        return JSON.parse((0, node_fs_1.readFileSync)(filePath, "utf8"));
    }
    catch {
        return fallback;
    }
}
function writeJsonFile(filePath, value) {
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true });
    (0, node_fs_1.writeFileSync)(filePath, JSON.stringify(value), "utf8");
}
function cloneDirectoryMtimeMs(cloneDirectory) {
    try {
        return (0, node_fs_1.statSync)(cloneDirectory).mtimeMs;
    }
    catch {
        return undefined;
    }
}
function isValidSnapshot(snapshot, cloneDirectory) {
    if (!snapshot || snapshot.cloneDirectory !== cloneDirectory || !Array.isArray(snapshot.entries))
        return false;
    return snapshot.cloneDirectoryMtimeMs === cloneDirectoryMtimeMs(cloneDirectory);
}
function readStoredCloneIndexSnapshot(cachePath) {
    return readJsonFile(cachePath, undefined);
}
function readStandardProjectsCloneIndexSnapshot(cloneDirectory, cachePath) {
    if (isValidSnapshot(cloneIndexMemoryCache, cloneDirectory)) {
        return cloneIndexMemoryCache;
    }
    const snapshot = readStoredCloneIndexSnapshot(cachePath);
    if (!isValidSnapshot(snapshot, cloneDirectory))
        return undefined;
    cloneIndexMemoryCache = snapshot;
    return snapshot;
}
function writeStandardProjectsCloneIndexSnapshot(cachePath, cloneDirectory, entries) {
    const snapshot = {
        cloneDirectory,
        cloneDirectoryMtimeMs: cloneDirectoryMtimeMs(cloneDirectory),
        generatedAt: Date.now(),
        entries,
    };
    writeJsonFile(cachePath, snapshot);
    cloneIndexMemoryCache = snapshot;
    return snapshot;
}
async function findLocalRepository(remoteUrl, preferredWorktree, repositoryIndex) {
    const repositoryKey = (0, git_repository_1.repositoryLookupKey)(remoteUrl);
    const preferredWorktreeRemoteUrl = repositoryIndex.remoteUrlByWorktree.get(preferredWorktree);
    const hasPreferredWorktreeRepository = (0, node_fs_1.existsSync)(node_path_1.default.join(preferredWorktree, ".git"));
    if (preferredWorktreeRemoteUrl && (0, git_repository_1.repositoryLookupKey)(preferredWorktreeRemoteUrl) === repositoryKey) {
        return { worktree: preferredWorktree, isMatch: true };
    }
    const matchedWorktree = repositoryIndex.worktreeByRepositoryKey.get(repositoryKey);
    if (matchedWorktree)
        return { worktree: matchedWorktree, isMatch: true };
    if (!preferredWorktreeRemoteUrl) {
        return hasPreferredWorktreeRepository ? { worktree: preferredWorktree, isMatch: true } : undefined;
    }
    return {
        worktree: preferredWorktree,
        actualRemoteUrl: preferredWorktreeRemoteUrl,
        isMatch: false,
    };
}
async function indexCloneDirectoryRepositories(cloneDirectory, cachePath, scannedRepositories) {
    const startedAt = nowMs();
    const worktreeByRepositoryKey = new Map();
    const remoteUrlByWorktree = new Map();
    const discoveredRepositories = scannedRepositories ?? (await (0, scanner_1.scanCloneDirectoryRepositories)(cloneDirectory)).repositories;
    const candidates = [];
    if (discoveredRepositories.length) {
        const entries = (0, local_repository_candidate_1.sortLocalRepositoryCandidates)(discoveredRepositories);
        for (const entry of entries) {
            remoteUrlByWorktree.set(entry.worktree, entry.remoteUrl);
            const repositoryKey = (0, git_repository_1.repositoryLookupKey)(entry.remoteUrl);
            if (!worktreeByRepositoryKey.has(repositoryKey)) {
                worktreeByRepositoryKey.set(repositoryKey, entry.worktree);
            }
        }
        if (cachePath) {
            writeStandardProjectsCloneIndexSnapshot(cachePath, cloneDirectory, entries);
        }
        logProjectLoadTiming("indexCloneDirectoryRepositories", startedAt, {
            candidates: discoveredRepositories.length,
            indexed: remoteUrlByWorktree.size,
            scanner: "filesystem",
        });
        return { worktreeByRepositoryKey, remoteUrlByWorktree };
    }
    try {
        for (const entry of (0, node_fs_1.readdirSync)(cloneDirectory, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            const candidate = node_path_1.default.join(cloneDirectory, entry.name);
            if (!(0, node_fs_1.existsSync)(node_path_1.default.join(candidate, ".git")))
                continue;
            candidates.push(candidate);
        }
    }
    catch {
        return { worktreeByRepositoryKey, remoteUrlByWorktree };
    }
    const entries = (0, local_repository_candidate_1.sortLocalRepositoryCandidates)((await Promise.all(candidates.map(async (candidate) => {
        try {
            const actualRemoteUrl = await (0, git_repository_1.gitRemoteUrl)(candidate);
            let currentBranch;
            try {
                currentBranch = await (0, git_repository_1.gitCurrentBranch)(candidate);
            }
            catch {
                // Branch lookup is only used to rank duplicate local checkouts.
            }
            return {
                worktree: candidate,
                remoteUrl: actualRemoteUrl,
                ...(currentBranch ? { currentBranch } : {}),
            };
        }
        catch {
            // Skip repositories whose remotes cannot be read.
            return undefined;
        }
    }))).filter((entry) => Boolean(entry)));
    for (const entry of entries) {
        remoteUrlByWorktree.set(entry.worktree, entry.remoteUrl);
        const repositoryKey = (0, git_repository_1.repositoryLookupKey)(entry.remoteUrl);
        if (!worktreeByRepositoryKey.has(repositoryKey)) {
            worktreeByRepositoryKey.set(repositoryKey, entry.worktree);
        }
    }
    if (cachePath) {
        writeStandardProjectsCloneIndexSnapshot(cachePath, cloneDirectory, entries);
    }
    logProjectLoadTiming("indexCloneDirectoryRepositories", startedAt, {
        candidates: candidates.length,
        indexed: remoteUrlByWorktree.size,
    });
    return { worktreeByRepositoryKey, remoteUrlByWorktree };
}
function cloneDirectoryRepositoryIndexFromEntries(entries) {
    const worktreeByRepositoryKey = new Map();
    const remoteUrlByWorktree = new Map();
    for (const entry of (0, local_repository_candidate_1.sortLocalRepositoryCandidates)(entries)) {
        remoteUrlByWorktree.set(entry.worktree, entry.remoteUrl);
        const repositoryKey = (0, git_repository_1.repositoryLookupKey)(entry.remoteUrl);
        if (!worktreeByRepositoryKey.has(repositoryKey)) {
            worktreeByRepositoryKey.set(repositoryKey, entry.worktree);
        }
    }
    return { worktreeByRepositoryKey, remoteUrlByWorktree };
}
async function prepareCloneDirectoryIndex(cloneDirectory, options) {
    if (!options?.force && options?.cachePath) {
        const snapshot = readStandardProjectsCloneIndexSnapshot(cloneDirectory, options.cachePath);
        if (snapshot) {
            return cloneDirectoryRepositoryIndexFromEntries(snapshot.entries);
        }
    }
    return indexCloneDirectoryRepositories(cloneDirectory, options?.cachePath, options?.scannedRepositories);
}
