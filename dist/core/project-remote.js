"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.remoteToBrowserUrl = remoteToBrowserUrl;
exports.projectRemoteUrl = projectRemoteUrl;
exports.projectRemoteBrowserUrl = projectRemoteBrowserUrl;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
function remoteToBrowserUrl(input) {
    const value = input.trim();
    if (!value)
        return undefined;
    if (value.startsWith("http://") || value.startsWith("https://")) {
        return value.replace(/\.git$/, "");
    }
    const protocolMatch = /^ssh:\/\/(?:git@)?([^/:]+)(?::\d+)?\/([^\s]+?)(?:\.git)?$/.exec(value);
    if (protocolMatch) {
        return `https://${protocolMatch[1]}/${protocolMatch[2]}`;
    }
    const sshMatch = /^git@([^:/]+):([^\s]+?)(?:\.git)?$/.exec(value);
    if (sshMatch) {
        return `https://${sshMatch[1]}/${sshMatch[2]}`;
    }
    return undefined;
}
async function gitOutput(worktree, args) {
    const { stdout } = await execFileAsync("git", args, { cwd: worktree });
    return stdout.trim();
}
async function projectRemoteUrl(worktree) {
    const candidates = ["origin", "upstream"];
    for (const remote of candidates) {
        try {
            const url = await gitOutput(worktree, ["remote", "get-url", remote]);
            if (url)
                return url;
        }
        catch {
            // try next remote
        }
    }
    const remotes = await gitOutput(worktree, ["remote"]);
    const first = remotes
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find(Boolean);
    if (!first)
        throw new Error(`No git remote found for ${worktree}`);
    return gitOutput(worktree, ["remote", "get-url", first]);
}
async function projectRemoteBrowserUrl(worktree) {
    const remote = await projectRemoteUrl(worktree);
    const url = remoteToBrowserUrl(remote);
    if (!url)
        throw new Error(`Unsupported git remote URL: ${remote}`);
    return url;
}
