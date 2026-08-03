"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repositoryRemoteMetadata = repositoryRemoteMetadata;
exports.repositoryRemoteProvider = repositoryRemoteProvider;
const git_repository_1 = require("../adapters/git-repository");
const project_remote_1 = require("./project-remote");
function repositoryRemoteMetadata(remoteUrl) {
    if (!remoteUrl)
        return undefined;
    const normalized = (0, git_repository_1.normalizeRepositoryUrl)(remoteUrl);
    const browserUrl = (0, project_remote_1.remoteToBrowserUrl)(normalized) ?? normalized;
    try {
        const parsedUrl = new URL(browserUrl);
        const host = parsedUrl.hostname.replace(/^www\./, "");
        const [owner, repository] = parsedUrl.pathname.split("/").filter(Boolean);
        return {
            provider: host === "github.com" ? "github" : host.includes("gitlab") ? "gitlab" : "git",
            host,
            ...(owner ? { owner } : {}),
            ...(repository ? { repository: repository.replace(/\.git$/, "") } : {}),
        };
    }
    catch {
        const match = normalized.match(/(?:ssh:\/\/)?git@([^:/]+)(?::\d+)?[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
        if (!match)
            return undefined;
        const host = match[1].replace(/^www\./, "");
        return {
            provider: host === "github.com" ? "github" : host.includes("gitlab") ? "gitlab" : "git",
            host,
            owner: match[2],
            repository: match[3],
        };
    }
}
function repositoryRemoteProvider(remoteUrl) {
    return repositoryRemoteMetadata(remoteUrl)?.provider;
}
