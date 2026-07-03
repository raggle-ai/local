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
    if (!(0, node_fs_1.existsSync)(dotGitPath))
        return undefined;
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
function scanCloneDirectoryRepositories(cloneDirectory) {
    const repositories = [];
    try {
        for (const entry of (0, node_fs_1.readdirSync)(cloneDirectory, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            const worktree = node_path_1.default.join(cloneDirectory, entry.name);
            const gitDirectoryPath = gitDirectory(worktree);
            if (!gitDirectoryPath)
                continue;
            const gitConfig = readTextFile(node_path_1.default.join(gitDirectoryPath, "config"));
            if (!gitConfig)
                continue;
            const remoteUrl = readOriginRemoteUrl(gitConfig);
            if (!remoteUrl)
                continue;
            const currentBranch = readCurrentBranch(gitDirectoryPath);
            repositories.push({
                worktree,
                remoteUrl: (0, git_repository_1.normalizeRepositoryUrl)(remoteUrl),
                ...(currentBranch ? { currentBranch } : {}),
            });
        }
    }
    catch {
        return [];
    }
    return repositories;
}
