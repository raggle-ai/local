"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanCloneDirectoryRepositories = scanCloneDirectoryRepositories;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const git_repository_1 = require("../adapters/git-repository");
function readTextFile(filePath) {
    try {
        return (0, node_fs_1.readFileSync)(filePath, "utf8");
    }
    catch {
        return undefined;
    }
}
function gitDirectory(worktree) {
    const dotGitPath = node_path_1.default.join(worktree, ".git");
    const stats = (0, node_fs_1.statSync)(dotGitPath, { throwIfNoEntry: false });
    if (!stats)
        return undefined;
    // Regular clones have a .git directory; reading it would throw EISDIR.
    if (stats.isDirectory())
        return dotGitPath;
    const dotGitContent = readTextFile(dotGitPath);
    if (!dotGitContent)
        return dotGitPath;
    const match = dotGitContent.match(/^gitdir:\s*(.+)$/im);
    const gitdir = match?.[1]?.trim();
    if (!gitdir)
        return undefined;
    return node_path_1.default.isAbsolute(gitdir) ? gitdir : node_path_1.default.resolve(worktree, gitdir);
}
function readOriginRemoteUrl(gitConfig) {
    const originSectionMatch = gitConfig.match(/\[remote\s+"origin"\]([\s\S]*?)(?=\n\[|$)/);
    if (!originSectionMatch)
        return undefined;
    const urlMatch = originSectionMatch[1].match(/^\s*url\s*=\s*(.+)$/m);
    return urlMatch?.[1]?.trim();
}
function readCurrentBranch(gitDirectoryPath) {
    const head = readTextFile(node_path_1.default.join(gitDirectoryPath, "HEAD"))?.trim();
    const match = head?.match(/^ref:\s+refs\/heads\/(.+)$/);
    return match?.[1];
}
function hasBareRepoMarkers(worktree) {
    return (((0, node_fs_1.statSync)(node_path_1.default.join(worktree, "HEAD"), { throwIfNoEntry: false })?.isFile() ?? false) &&
        ((0, node_fs_1.statSync)(node_path_1.default.join(worktree, "objects"), { throwIfNoEntry: false })?.isDirectory() ?? false) &&
        ((0, node_fs_1.statSync)(node_path_1.default.join(worktree, "refs"), { throwIfNoEntry: false })?.isDirectory() ?? false));
}
function discoverRepositoryFromDirectory(worktree, configDirectory) {
    const gitConfig = readTextFile(node_path_1.default.join(configDirectory, "config"));
    if (!gitConfig)
        return undefined;
    const remoteUrl = readOriginRemoteUrl(gitConfig);
    if (!remoteUrl)
        return undefined;
    const currentBranch = readCurrentBranch(configDirectory);
    return {
        worktree,
        remoteUrl: (0, git_repository_1.normalizeRepositoryUrl)(remoteUrl),
        ...(currentBranch ? { currentBranch } : {}),
    };
}
function scanCloneDirectoryRepositories(cloneDirectory, options) {
    const startedAt = Date.now();
    const maxRepos = options?.maxRepos;
    const timeoutMs = options?.timeoutMs;
    const signal = options?.signal;
    const repositories = [];
    let truncated = false;
    let timedOut = false;
    let stopped = false;
    const buildResult = () => ({
        repositories: [...repositories],
        truncated,
        timedOut,
        stopped,
        durationMs: Date.now() - startedAt,
        maxRepos,
        timeoutMs,
    });
    const isAborted = () => {
        if (signal?.aborted) {
            stopped = true;
            return true;
        }
        return false;
    };
    const isTimedOut = () => {
        if (timeoutMs !== undefined && Date.now() - startedAt > timeoutMs) {
            timedOut = true;
            return true;
        }
        return false;
    };
    try {
        for (const entry of (0, node_fs_1.readdirSync)(cloneDirectory, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.isSymbolicLink())
                continue;
            if (isAborted() || isTimedOut())
                break;
            if (maxRepos !== undefined && repositories.length >= maxRepos) {
                truncated = true;
                break;
            }
            const worktree = node_path_1.default.join(cloneDirectory, entry.name);
            const gitDirectoryPath = gitDirectory(worktree);
            let repository;
            if (gitDirectoryPath) {
                repository = discoverRepositoryFromDirectory(worktree, gitDirectoryPath);
            }
            else if (hasBareRepoMarkers(worktree)) {
                repository = discoverRepositoryFromDirectory(worktree, worktree);
            }
            if (!repository)
                continue;
            repositories.push(repository);
            options?.onProgress?.(buildResult());
        }
    }
    catch {
        return buildResult();
    }
    return buildResult();
}
