"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectPicker = ProjectPicker;
const jsx_runtime_1 = require("react/jsx-runtime");
const api_1 = require("@raycast/api");
const react_1 = require("react");
const project_list_limits_1 = require("./project-list-limits");
const project_search_1 = require("./project-search");
const project_snapshot_1 = require("./project-snapshot");
const responsiveSearchProjectRenderLimit = 100;
function projectTitle(project) {
    return project.name ?? project.worktreeName ?? project.worktree.split("/").filter(Boolean).at(-1) ?? project.worktree;
}
function projectSubtitle(project) {
    if (project.relativePath && project.parentProjectName) {
        return `${project.parentProjectName}/${project.relativePath}`;
    }
    return project.latestSessionTitle ?? project.tags?.join(" ") ?? project.worktree;
}
function projectOwner(project) {
    const remoteUrl = project.remoteUrl;
    if (!remoteUrl)
        return undefined;
    return remoteUrl.match(/github\.com[:/]([^/\s]+)\//i)?.[1]?.toLowerCase();
}
function projectItemId(project) {
    return [project.remoteUrl ?? project.id, project.relativePath ?? ".", project.worktree].join(":");
}
function ProjectPicker({ onSelect, actionTitle = "Select Project", navigationTitle = "Projects", searchBarPlaceholder = "Search projects...", ...snapshotOptions }) {
    const state = (0, react_1.useMemo)(() => {
        try {
            return { projects: (0, project_snapshot_1.readRaggleProjectSnapshot)(snapshotOptions) };
        }
        catch (error) {
            return {
                projects: [],
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }, [snapshotOptions.currentSupportPath, snapshotOptions.raggleExtensionName, snapshotOptions.snapshotPath]);
    const [searchText, setSearchText] = (0, react_1.useState)("");
    const [favoriteRenderLimit, setFavoriteRenderLimit] = (0, react_1.useState)(project_list_limits_1.initialFavoriteProjectRenderLimit);
    const [nonFavoriteRenderLimit, setNonFavoriteRenderLimit] = (0, react_1.useState)(project_list_limits_1.initialNonFavoriteProjectRenderLimit);
    const favoriteSearchCacheRef = (0, react_1.useRef)(undefined);
    const nonFavoriteSearchCacheRef = (0, react_1.useRef)(undefined);
    const parsedSearch = (0, react_1.useMemo)(() => (0, project_search_1.parseProjectSearch)(searchText), [searchText]);
    const displayOrderByWorktree = (0, react_1.useMemo)(() => new Map(state.projects.map((project, index) => [project.worktree, index])), [state.projects]);
    const projectSearchIndex = (0, react_1.useMemo)(() => (0, project_search_1.buildProjectSearchIndex)(state.projects, {
        getKeywords: (project) => project.keywords ?? [],
        getTitle: projectTitle,
    }), [state.projects]);
    const favoriteSearchIndex = (0, react_1.useMemo)(() => projectSearchIndex.filter((entry) => entry.project.isFavorite), [projectSearchIndex]);
    const nonFavoriteSearchIndex = (0, react_1.useMemo)(() => projectSearchIndex.filter((entry) => !entry.project.isFavorite), [projectSearchIndex]);
    const searchOrder = (0, react_1.useCallback)((entry) => displayOrderByWorktree.get(entry.project.worktree) ?? Number.MAX_SAFE_INTEGER, [displayOrderByWorktree]);
    const favoriteSearchOptions = (0, react_1.useMemo)(() => ({
        limit: favoriteRenderLimit,
        evaluate: project_search_1.evaluateProjectSearchEntry,
        order: searchOrder,
        canNarrow: project_search_1.projectSearchCanNarrow,
    }), [favoriteRenderLimit, searchOrder]);
    const nonFavoriteSearchOptions = (0, react_1.useMemo)(() => ({
        limit: nonFavoriteRenderLimit,
        evaluate: project_search_1.evaluateProjectSearchEntry,
        order: searchOrder,
        canNarrow: project_search_1.projectSearchCanNarrow,
    }), [nonFavoriteRenderLimit, searchOrder]);
    const favoriteSearchResult = (0, react_1.useMemo)(() => (0, project_search_1.searchIndexedItems)(favoriteSearchIndex, parsedSearch, favoriteSearchOptions, favoriteSearchCacheRef.current), [favoriteSearchIndex, favoriteSearchOptions, parsedSearch]);
    const nonFavoriteSearchResult = (0, react_1.useMemo)(() => (0, project_search_1.searchIndexedItems)(nonFavoriteSearchIndex, parsedSearch, nonFavoriteSearchOptions, nonFavoriteSearchCacheRef.current), [nonFavoriteSearchIndex, nonFavoriteSearchOptions, parsedSearch]);
    (0, react_1.useEffect)(() => {
        favoriteSearchCacheRef.current = favoriteSearchResult.cache;
        nonFavoriteSearchCacheRef.current = nonFavoriteSearchResult.cache;
    }, [favoriteSearchResult.cache, nonFavoriteSearchResult.cache]);
    const updateSearchText = (0, react_1.useCallback)((nextSearchText) => {
        setSearchText(nextSearchText);
        setFavoriteRenderLimit(project_list_limits_1.initialFavoriteProjectRenderLimit);
        setNonFavoriteRenderLimit(nextSearchText.trim()
            ? Math.min(project_list_limits_1.initialSearchProjectRenderLimit, responsiveSearchProjectRenderLimit)
            : project_list_limits_1.initialNonFavoriteProjectRenderLimit);
    }, []);
    const matchingProjects = (0, react_1.useMemo)(() => {
        const matches = new Set([
            ...favoriteSearchResult.items.map((entry) => entry.project.worktree),
            ...nonFavoriteSearchResult.items.map((entry) => entry.project.worktree),
        ]);
        const ownerQuery = parsedSearch.remoteOwner ?? parsedSearch.usernameQuery;
        return state.projects.filter((project) => {
            if (!matches.has(project.worktree))
                return false;
            return !ownerQuery || projectOwner(project) === ownerQuery;
        });
    }, [favoriteSearchResult.items, nonFavoriteSearchResult.items, parsedSearch.remoteOwner, state.projects]);
    const visibleFavorites = (0, react_1.useMemo)(() => matchingProjects.filter((project) => project.isFavorite).slice(0, favoriteRenderLimit), [favoriteRenderLimit, matchingProjects]);
    const visibleNonFavorites = (0, react_1.useMemo)(() => matchingProjects.filter((project) => !project.isFavorite).slice(0, nonFavoriteRenderLimit), [matchingProjects, nonFavoriteRenderLimit]);
    const filteredFavoriteCount = favoriteSearchResult.total;
    const filteredNonFavoriteCount = nonFavoriteSearchResult.total;
    function renderProject(project) {
        return ((0, jsx_runtime_1.jsx)(api_1.List.Item, { id: projectItemId(project), title: projectTitle(project), subtitle: projectSubtitle(project), keywords: project.keywords, accessories: [
                ...(project.isFavorite ? [{ icon: { source: api_1.Icon.Star, tintColor: "#f5c542" } }] : []),
                ...(project.sandboxCount
                    ? [{ tag: `${project.sandboxCount} sandbox${project.sandboxCount === 1 ? "" : "es"}` }]
                    : []),
            ], icon: project.icon ? { source: project.icon } : api_1.Icon.Folder, actions: (0, jsx_runtime_1.jsx)(api_1.ActionPanel, { children: (0, jsx_runtime_1.jsx)(api_1.Action, { title: actionTitle, icon: api_1.Icon.Checkmark, onAction: () => onSelect(project) }) }) }, projectItemId(project)));
    }
    return ((0, jsx_runtime_1.jsx)(api_1.List, { navigationTitle: navigationTitle, searchBarPlaceholder: searchBarPlaceholder, filtering: false, searchText: searchText, onSearchTextChange: updateSearchText, children: state.error ? ((0, jsx_runtime_1.jsx)(api_1.List.EmptyView, { title: "No Raggle Projects Found", description: "Open Raggle once to refresh its project snapshot.", icon: api_1.Icon.Warning })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [visibleFavorites.length ? ((0, jsx_runtime_1.jsxs)(api_1.List.Section, { title: "Favorites", subtitle: `${visibleFavorites.length} of ${filteredFavoriteCount}`, children: [visibleFavorites.map(renderProject), visibleFavorites.length < filteredFavoriteCount ? ((0, jsx_runtime_1.jsx)(api_1.List.Item, { title: "Show More Results", subtitle: `Showing ${visibleFavorites.length} of ${filteredFavoriteCount}`, icon: api_1.Icon.Plus, actions: (0, jsx_runtime_1.jsx)(api_1.ActionPanel, { children: (0, jsx_runtime_1.jsx)(api_1.Action, { title: "Show More Results", icon: api_1.Icon.Plus, onAction: () => setFavoriteRenderLimit((limit) => (0, project_list_limits_1.nextProjectRenderLimit)(limit, filteredFavoriteCount)) }) }) })) : null] })) : null, visibleNonFavorites.length ? ((0, jsx_runtime_1.jsxs)(api_1.List.Section, { title: visibleFavorites.length ? "Projects" : `Projects (${filteredNonFavoriteCount.toLocaleString()})`, subtitle: visibleNonFavorites.length < filteredNonFavoriteCount
                        ? `${visibleNonFavorites.length} of ${filteredNonFavoriteCount}`
                        : undefined, children: [visibleNonFavorites.map(renderProject), visibleNonFavorites.length < filteredNonFavoriteCount ? ((0, jsx_runtime_1.jsx)(api_1.List.Item, { title: "Show More Results", subtitle: `Showing ${visibleNonFavorites.length} of ${filteredNonFavoriteCount}`, icon: api_1.Icon.Plus, actions: (0, jsx_runtime_1.jsx)(api_1.ActionPanel, { children: (0, jsx_runtime_1.jsx)(api_1.Action, { title: "Show More Results", icon: api_1.Icon.Plus, onAction: () => setNonFavoriteRenderLimit((limit) => (0, project_list_limits_1.nextProjectRenderLimit)(limit, filteredNonFavoriteCount)) }) }) })) : null] })) : null, !visibleFavorites.length && !visibleNonFavorites.length ? ((0, jsx_runtime_1.jsx)(api_1.List.EmptyView, { title: "No Projects", icon: api_1.Icon.MagnifyingGlass })) : null] })) }));
}
