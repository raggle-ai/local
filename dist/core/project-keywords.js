"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectKeywords = projectKeywords;
exports.standardProjectWithKeywords = standardProjectWithKeywords;
exports.projectTitle = projectTitle;
exports.projectSubtitle = projectSubtitle;
exports.projectAccessoryPath = projectAccessoryPath;
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
function extractRepositoryKeywords(remoteUrl) {
    if (!remoteUrl)
        return [];
    const keywords = [];
    const normalized = remoteUrl.replace(/\.git$/, "");
    try {
        const parsedUrl = new URL(normalized);
        const pathname = parsedUrl.pathname;
        const segments = pathname.split("/").filter(Boolean);
        if (segments.length >= 2) {
            const owner = segments[segments.length - 2];
            const repo = segments[segments.length - 1];
            keywords.push(owner);
            keywords.push(repo);
            const ownerParts = owner.split(/[-_.]+/);
            for (const part of ownerParts) {
                if (part && part !== owner)
                    keywords.push(part);
            }
            const repoParts = repo.split(/[-_.]+/);
            for (const part of repoParts) {
                if (part && part !== repo)
                    keywords.push(part);
            }
        }
    }
    catch {
        const sshMatch = normalized.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
        if (sshMatch) {
            const owner = sshMatch[1];
            const repo = sshMatch[2];
            keywords.push(owner);
            keywords.push(repo);
            const ownerParts = owner.split(/[-_.]+/);
            for (const part of ownerParts) {
                if (part && part !== owner)
                    keywords.push(part);
            }
            const repoParts = repo.split(/[-_.]+/);
            for (const part of repoParts) {
                if (part && part !== repo)
                    keywords.push(part);
            }
        }
    }
    return keywords;
}
function addPathKeywords(values, input) {
    if (!input)
        return;
    values.add(input);
    for (const segment of input.split(/[\\/]/)) {
        if (segment)
            values.add(segment);
    }
}
function projectKeywords(item) {
    const values = new Set();
    if (!item.remoteUrl)
        addPathKeywords(values, item.worktree);
    if (item.name)
        values.add(item.name);
    if (item.description)
        values.add(item.description);
    if (item.parentProjectName)
        values.add(item.parentProjectName);
    addPathKeywords(values, item.relativePath);
    for (const tag of item.tags ?? [])
        values.add(tag);
    if (item.latestSessionTitle)
        values.add(item.latestSessionTitle);
    for (const keyword of extractRepositoryKeywords(item.remoteUrl)) {
        values.add(keyword);
    }
    return [...values].filter(Boolean);
}
function standardProjectWithKeywords(item) {
    return { ...item, keywords: projectKeywords({ ...item, keywords: undefined }) };
}
function projectTitle(item) {
    return (item.name ?? node_path_1.default.basename(item.worktree)) || item.worktree;
}
function projectSubtitle(item) {
    if (item.latestSessionTitle)
        return item.latestSessionTitle;
    if (item.tags?.length)
        return item.tags.join(" ");
    return item.worktree;
}
function projectAccessoryPath(item) {
    const home = node_os_1.default.homedir();
    if (item.worktree === home)
        return "~";
    if (item.worktree.startsWith(`${home}${node_path_1.default.sep}`))
        return `~/${item.worktree.slice(home.length + 1)}`;
    return item.worktree;
}
