"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseProjectSearch = parseProjectSearch;
exports.buildProjectSearchIndex = buildProjectSearchIndex;
exports.projectSearchCanNarrow = projectSearchCanNarrow;
exports.evaluateProjectSearchEntry = evaluateProjectSearchEntry;
exports.projectSearchEntryMatches = projectSearchEntryMatches;
exports.projectSearchEntryScore = projectSearchEntryScore;
exports.searchProjects = searchProjects;
exports.projectUsernameListItems = projectUsernameListItems;
const indexed_search_1 = require("./indexed-search");
function normalizeForSearch(text) {
    return text.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}
function compactSearchText(text) {
    return text.replace(/\s+/g, "");
}
function repositoryName(remoteUrl) {
    if (!remoteUrl)
        return "";
    const withoutQuery = remoteUrl.split(/[?#]/, 1)[0].replace(/\/$/, "");
    return withoutQuery.match(/([^/:]+?)(?:\.git)?$/)?.[1] ?? "";
}
function projectTitle(project) {
    return project.name || project.worktree.split("/").filter(Boolean).at(-1) || project.worktree;
}
function parseProjectSearch(searchText) {
    let remoteOwner;
    let usernameQuery;
    const query = searchText
        .replace(/\bfrom:("[^"]+"|'[^']+'|\S+)/gi, (_match, value) => {
        const nextOwner = value
            .replace(/^['"]|['"]$/g, "")
            .trim()
            .replace(/^@/, "")
            .toLowerCase();
        if (nextOwner)
            remoteOwner = nextOwner;
        return " ";
    })
        .replace(/(^|\s)@([^\s]+)/g, (_match, prefix, value) => {
        const nextUsernameQuery = value.trim().toLowerCase();
        if (nextUsernameQuery)
            usernameQuery = nextUsernameQuery;
        return prefix;
    })
        .replace(/\s+/g, " ")
        .trim();
    const normalizedQuery = normalizeForSearch(query);
    return {
        query,
        normalizedQuery,
        compactQuery: compactSearchText(normalizedQuery),
        queryWords: normalizedQuery.split(" ").filter(Boolean),
        remoteOwner,
        usernameQuery,
    };
}
function projectRemoteOwner(remoteUrl) {
    if (!remoteUrl)
        return undefined;
    try {
        const parsedUrl = new URL(remoteUrl);
        if (parsedUrl.hostname.replace(/^www\./, "") !== "github.com")
            return undefined;
        return parsedUrl.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    }
    catch {
        return remoteUrl.match(/github\.com[:/]([^/\s]+)\/[^/\s]+/i)?.[1]?.toLowerCase();
    }
}
function normalizedTextMatches(normalizedQuery, compactQuery, queryWords, normalizedTarget, compactTarget) {
    if (compactQuery && compactTarget.includes(compactQuery))
        return true;
    return queryWords.every((word) => normalizedTarget.includes(word));
}
function buildProjectSearchIndex(items, options = {}) {
    return items.map((project) => {
        const primaryText = normalizeForSearch((options.getKeywords?.(project) ?? project.keywords ?? []).join(" "));
        const secondaryText = normalizeForSearch(project.latestSessionTitle ?? "");
        const normalizedRepositoryName = normalizeForSearch(options.getRepositoryName?.(project) ?? repositoryName(project.remoteUrl));
        return {
            project,
            primaryText,
            compactPrimaryText: compactSearchText(primaryText),
            secondaryText,
            compactSecondaryText: compactSearchText(secondaryText),
            title: normalizeForSearch(options.getTitle?.(project) ?? projectTitle(project)),
            repositoryName: normalizedRepositoryName,
            compactRepositoryName: compactSearchText(normalizedRepositoryName),
            remoteOwner: projectRemoteOwner(project.remoteMismatch?.actualRemoteUrl ?? project.remoteUrl),
        };
    });
}
function projectSearchCanNarrow(previousSearch, nextSearch) {
    return (previousSearch.remoteOwner === nextSearch.remoteOwner &&
        previousSearch.usernameQuery === nextSearch.usernameQuery &&
        nextSearch.normalizedQuery.startsWith(previousSearch.normalizedQuery));
}
const repositoryMatchFlag = 1;
const primaryMatchFlag = 2;
const secondaryMatchFlag = 4;
function projectSearchEntryMatchFlags(entry, parsedSearch) {
    const { compactQuery, normalizedQuery, queryWords } = parsedSearch;
    if (parsedSearch.remoteOwner && (entry.project.relativePath || entry.remoteOwner !== parsedSearch.remoteOwner)) {
        return undefined;
    }
    if (!normalizedQuery)
        return 0;
    const repositoryMatch = normalizedTextMatches(normalizedQuery, compactQuery, queryWords, entry.repositoryName, entry.compactRepositoryName);
    const primaryMatch = normalizedTextMatches(normalizedQuery, compactQuery, queryWords, entry.primaryText, entry.compactPrimaryText);
    const secondaryMatch = Boolean(entry.secondaryText) &&
        normalizedTextMatches(normalizedQuery, compactQuery, queryWords, entry.secondaryText, entry.compactSecondaryText);
    if (!repositoryMatch && !primaryMatch && !secondaryMatch)
        return undefined;
    return ((repositoryMatch ? repositoryMatchFlag : 0) |
        (primaryMatch ? primaryMatchFlag : 0) |
        (secondaryMatch ? secondaryMatchFlag : 0));
}
function evaluateProjectSearchEntry(entry, parsedSearch) {
    const matchFlags = projectSearchEntryMatchFlags(entry, parsedSearch);
    if (matchFlags === undefined)
        return undefined;
    const { normalizedQuery, queryWords } = parsedSearch;
    if (!normalizedQuery)
        return 0;
    const titleWords = entry.title.split(" ").filter(Boolean);
    const titlePosition = entry.title.indexOf(normalizedQuery);
    const titleWordPrefix = queryWords.every((queryWord) => titleWords.some((word) => word.startsWith(queryWord)));
    const primaryMatch = Boolean(matchFlags & primaryMatchFlag);
    const secondaryMatch = Boolean(matchFlags & secondaryMatchFlag);
    const matchQuality = entry.title === normalizedQuery
        ? 1_000
        : entry.repositoryName === normalizedQuery
            ? 950
            : entry.title.startsWith(normalizedQuery)
                ? 900
                : titleWordPrefix
                    ? 800
                    : titlePosition >= 0
                        ? 700 - Math.min(titlePosition, 100)
                        : primaryMatch
                            ? 500
                            : secondaryMatch
                                ? 200
                                : 0;
    return matchQuality + (entry.project.relativePath ? 0 : 20);
}
function projectSearchEntryMatches(entry, parsedSearch) {
    return projectSearchEntryMatchFlags(entry, parsedSearch) !== undefined;
}
function projectSearchEntryScore(entry, parsedSearch) {
    return evaluateProjectSearchEntry(entry, parsedSearch) ?? 0;
}
function searchProjects(index, parsedSearch, options) {
    const orderByEntry = new Map(index.map((entry, indexPosition) => [entry, indexPosition]));
    return (0, indexed_search_1.searchIndexedItems)(index, parsedSearch, {
        limit: options?.limit,
        evaluate: evaluateProjectSearchEntry,
        order: options?.order ?? ((entry) => orderByEntry.get(entry) ?? Number.MAX_SAFE_INTEGER),
        canNarrow: projectSearchCanNarrow,
    }).items.map((entry) => entry.project);
}
function projectUsernameListItems(items, query) {
    const normalizedQuery = query?.toLowerCase().trim() ?? "";
    const owners = new Map();
    for (const item of items) {
        if (item.relativePath)
            continue;
        const username = projectRemoteOwner(item.remoteMismatch?.actualRemoteUrl ?? item.remoteUrl);
        if (!username || (normalizedQuery && !username.includes(normalizedQuery)))
            continue;
        const existing = owners.get(username);
        if (existing) {
            existing.projectCount += 1;
            continue;
        }
        owners.set(username, {
            username,
            projectCount: 1,
            browserUrl: `https://github.com/${encodeURIComponent(username)}`,
            avatarUrl: `https://avatars.githubusercontent.com/${encodeURIComponent(username)}?s=64`,
        });
    }
    return [...owners.values()].sort((left, right) => left.username.localeCompare(right.username));
}
