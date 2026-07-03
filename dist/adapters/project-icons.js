"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectIconExtensions = void 0;
exports.discoverProjectIcon = discoverProjectIcon;
exports.githubOwnerFromRemoteUrl = githubOwnerFromRemoteUrl;
exports.fetchGithubOwnerIcon = fetchGithubOwnerIcon;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const project_remote_1 = require("../core/project-remote");
exports.projectIconExtensions = ["png", "jpg", "jpeg", "svg", "gif", "webp", "ico"];
function discoverProjectIcon(worktree) {
    const repoCandidates = ["icon", ".icon", "favicon"];
    const settingsDir = node_path_1.default.join(worktree, ".opencode");
    for (const name of repoCandidates) {
        const candidate = node_path_1.default.join(worktree, name);
        if ((0, node_fs_1.existsSync)(candidate))
            return candidate;
    }
    for (const ext of exports.projectIconExtensions) {
        for (const name of repoCandidates) {
            const candidate = node_path_1.default.join(worktree, `${name}.${ext}`);
            if ((0, node_fs_1.existsSync)(candidate))
                return candidate;
        }
    }
    try {
        const pattern = new RegExp(`^(?:icon|\\.icon|favicon)(?:\\.(${exports.projectIconExtensions.join("|")}))?$`, "i");
        const file = (0, node_fs_1.readdirSync)(worktree).find((name) => pattern.test(name));
        if (file)
            return node_path_1.default.join(worktree, file);
    }
    catch {
        // Ignore unreadable or missing worktree directory.
    }
    for (const ext of exports.projectIconExtensions) {
        const candidate = node_path_1.default.join(settingsDir, `icon.${ext}`);
        if ((0, node_fs_1.existsSync)(candidate))
            return candidate;
    }
    try {
        const pattern = new RegExp(`^icon\\.(${exports.projectIconExtensions.join("|")})$`, "i");
        const file = (0, node_fs_1.readdirSync)(settingsDir).find((name) => pattern.test(name));
        if (file)
            return node_path_1.default.join(settingsDir, file);
    }
    catch {
        // Ignore unreadable or missing .opencode directory.
    }
    return undefined;
}
function githubOwnerFromRemoteUrl(remoteUrl) {
    if (!remoteUrl)
        return undefined;
    const browserUrl = (0, project_remote_1.remoteToBrowserUrl)(remoteUrl) ?? remoteUrl;
    try {
        const parsedUrl = new URL(browserUrl);
        if (parsedUrl.hostname !== "github.com")
            return undefined;
        return parsedUrl.pathname.split("/").filter(Boolean)[0];
    }
    catch {
        const match = remoteUrl.match(/github\.com[:/]([^/\s]+)\/[^/\s]+/i);
        return match?.[1];
    }
}
function iconExtensionFromContentType(contentType) {
    if (!contentType)
        return "png";
    if (contentType.includes("svg"))
        return "svg";
    if (contentType.includes("jpeg") || contentType.includes("jpg"))
        return "jpg";
    if (contentType.includes("gif"))
        return "gif";
    if (contentType.includes("webp"))
        return "webp";
    if (contentType.includes("x-icon") || contentType.includes("vnd.microsoft.icon"))
        return "ico";
    return "png";
}
async function fetchGithubOwnerIcon(remoteUrl) {
    const owner = githubOwnerFromRemoteUrl(remoteUrl);
    if (!owner)
        return undefined;
    const avatarUrl = `https://github.com/${encodeURIComponent(owner)}.png`;
    const avatarResponse = await fetch(avatarUrl);
    if (!avatarResponse.ok)
        return undefined;
    const data = Buffer.from(await avatarResponse.arrayBuffer());
    if (!data.length)
        return undefined;
    return {
        owner,
        data,
        ext: iconExtensionFromContentType(avatarResponse.headers.get("content-type")),
        sourceUrl: avatarUrl,
    };
}
