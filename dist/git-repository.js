"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRepositoryUrl = normalizeRepositoryUrl;
exports.repositoryName = repositoryName;
exports.githubRepositoryPath = githubRepositoryPath;
exports.repositoryDirectoryName = repositoryDirectoryName;
exports.repositoryLookupKey = repositoryLookupKey;
exports.gitRemoteUrl = gitRemoteUrl;
exports.gitCurrentBranch = gitCurrentBranch;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const project_remote_1 = require("./project-remote");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
function normalizeRepositoryUrl(remoteUrl) {
    const trimmed = remoteUrl.trim().replace(/^['"]|['"]$/g, "");
    const sshProtocolMatch = trimmed.match(/^ssh:\/\/(?:git@)?([^/:]+)(:\d+)?\/([^/\s]+)\/([^/\s?#"]+?)(?:\.git)?$/i);
    if (sshProtocolMatch) {
        return `ssh://git@${sshProtocolMatch[1]}${sshProtocolMatch[2] ?? ""}/${sshProtocolMatch[3]}/${sshProtocolMatch[4]}`;
    }
    // Accept GitHub page URLs and common malformed variants like
    // "github.com/owner/repo", "ps://github.com/owner/repo", or URLs with extra path segments.
    if (!trimmed.startsWith("git@")) {
        const githubMatch = trimmed.match(/(?:[a-z]*:\/\/)?(?:www\.)?github\.com[/:]([^/\s]+)\/([^/\s?#"]+)/i);
        if (githubMatch) {
            return `https://github.com/${githubMatch[1]}/${githubMatch[2].replace(/\.git$/, "")}`;
        }
    }
    try {
        const parsedUrl = new URL(trimmed);
        if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
            const segments = parsedUrl.pathname.split("/").filter(Boolean);
            if (segments.length >= 2) {
                parsedUrl.pathname = `/${segments[0]}/${segments[1].replace(/\.git$/, "")}`;
                parsedUrl.search = "";
                parsedUrl.hash = "";
                return parsedUrl.toString().replace(/\/$/, "");
            }
        }
    }
    catch {
        // Keep non-URL Git remotes like git@github.com:user/repo.git unchanged.
    }
    return trimmed.replace(/\/$/, "");
}
function repositoryName(remoteUrl) {
    const normalized = normalizeRepositoryUrl(remoteUrl);
    const match = normalized.match(/([^/:]+?)(?:\.git)?$/);
    const name = match?.[1];
    if (!name) {
        throw new Error(`Could not determine a project name from ${remoteUrl}`);
    }
    return name;
}
function githubRepositoryPath(remoteUrl) {
    const normalized = normalizeRepositoryUrl(remoteUrl);
    const sshMatch = normalized.match(/^git@github\.com:([^/\s]+)\/([^/\s?#]+?)(?:\.git)?$/i);
    if (sshMatch) {
        return {
            owner: sshMatch[1],
            repo: sshMatch[2],
        };
    }
    try {
        const parsedUrl = new URL(normalized);
        if (parsedUrl.hostname !== "github.com")
            return undefined;
        const segments = parsedUrl.pathname.split("/").filter(Boolean);
        if (segments.length < 2)
            return undefined;
        return {
            owner: segments[0],
            repo: segments[1].replace(/\.git$/, ""),
        };
    }
    catch {
        return undefined;
    }
}
function repositoryDirectoryName(remoteUrl) {
    const repository = githubRepositoryPath(remoteUrl);
    if (repository)
        return `${repository.owner}-${repository.repo}`;
    return repositoryName(remoteUrl);
}
function repositoryLookupKey(remoteUrl) {
    const normalized = normalizeRepositoryUrl(remoteUrl);
    return (0, project_remote_1.remoteToBrowserUrl)(normalized) ?? normalized;
}
async function gitRemoteUrl(worktree) {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], {
        cwd: worktree,
        maxBuffer: 1024 * 1024 * 4,
    });
    return normalizeRepositoryUrl(stdout.trim());
}
async function gitCurrentBranch(worktree) {
    const { stdout } = await execFileAsync("git", ["branch", "--show-current"], {
        cwd: worktree,
        maxBuffer: 1024 * 1024,
    });
    return stdout.trim() || undefined;
}
