import { Action, ActionPanel, Icon, List } from "@raycast/api";
import {
  initialFavoriteProjectRenderLimit,
  initialNonFavoriteProjectRenderLimit,
  initialSearchProjectRenderLimit,
  nextProjectRenderLimit,
} from "@raggle-ai/local";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RaycastProject } from "./index";
import {
  buildProjectSearchIndex,
  evaluateProjectSearchEntry,
  parseProjectSearch,
  projectSearchCanNarrow,
  searchIndexedItems,
  type IndexedSearchCache,
  type ProjectSearchIndexEntry,
} from "./project-search";
import { readRaggleProjectSnapshot, type RaggleProjectSnapshotOptions } from "./project-snapshot";

const responsiveSearchProjectRenderLimit = 100;

export type ProjectPickerProps = RaggleProjectSnapshotOptions & {
  onSelect: (project: RaycastProject) => void | Promise<void>;
  actionTitle?: string;
  navigationTitle?: string;
  searchBarPlaceholder?: string;
};

type ProjectPickerState = {
  projects: RaycastProject[];
  error?: string;
};

function projectTitle(project: RaycastProject) {
  return project.name ?? project.worktreeName ?? project.worktree.split("/").filter(Boolean).at(-1) ?? project.worktree;
}

function projectSubtitle(project: RaycastProject) {
  if (project.relativePath && project.parentProjectName) {
    return `${project.parentProjectName}/${project.relativePath}`;
  }

  return project.latestSessionTitle ?? project.tags?.join(" ") ?? project.worktree;
}

function projectOwner(project: RaycastProject) {
  const remoteUrl = project.remoteUrl;
  if (!remoteUrl) return undefined;

  return remoteUrl.match(/github\.com[:/]([^/\s]+)\//i)?.[1]?.toLowerCase();
}

function projectItemId(project: RaycastProject) {
  return [project.remoteUrl ?? project.id, project.relativePath ?? ".", project.worktree].join(":");
}

export function ProjectPicker({
  onSelect,
  actionTitle = "Select Project",
  navigationTitle = "Projects",
  searchBarPlaceholder = "Search projects...",
  ...snapshotOptions
}: ProjectPickerProps) {
  const state = useMemo<ProjectPickerState>(() => {
    try {
      return { projects: readRaggleProjectSnapshot(snapshotOptions) };
    } catch (error) {
      return {
        projects: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [snapshotOptions.currentSupportPath, snapshotOptions.raggleExtensionName, snapshotOptions.snapshotPath]);

  const [searchText, setSearchText] = useState("");
  const [favoriteRenderLimit, setFavoriteRenderLimit] = useState(initialFavoriteProjectRenderLimit);
  const [nonFavoriteRenderLimit, setNonFavoriteRenderLimit] = useState(initialNonFavoriteProjectRenderLimit);
  const favoriteSearchCacheRef = useRef<
    IndexedSearchCache<ProjectSearchIndexEntry<RaycastProject>, ReturnType<typeof parseProjectSearch>> | undefined
  >(undefined);
  const nonFavoriteSearchCacheRef = useRef<
    IndexedSearchCache<ProjectSearchIndexEntry<RaycastProject>, ReturnType<typeof parseProjectSearch>> | undefined
  >(undefined);
  const parsedSearch = useMemo(() => parseProjectSearch(searchText), [searchText]);
  const displayOrderByWorktree = useMemo(
    () => new Map(state.projects.map((project, index) => [project.worktree, index])),
    [state.projects],
  );
  const projectSearchIndex = useMemo(
    () =>
      buildProjectSearchIndex(state.projects, {
        getKeywords: (project) => project.keywords ?? [],
        getTitle: projectTitle,
      }),
    [state.projects],
  );
  const favoriteSearchIndex = useMemo(
    () => projectSearchIndex.filter((entry) => entry.project.isFavorite),
    [projectSearchIndex],
  );
  const nonFavoriteSearchIndex = useMemo(
    () => projectSearchIndex.filter((entry) => !entry.project.isFavorite),
    [projectSearchIndex],
  );
  const searchOrder = useCallback(
    (entry: ProjectSearchIndexEntry<RaycastProject>) =>
      displayOrderByWorktree.get(entry.project.worktree) ?? Number.MAX_SAFE_INTEGER,
    [displayOrderByWorktree],
  );
  const favoriteSearchOptions = useMemo(
    () => ({
      limit: favoriteRenderLimit,
      evaluate: evaluateProjectSearchEntry,
      order: searchOrder,
      canNarrow: projectSearchCanNarrow,
    }),
    [favoriteRenderLimit, searchOrder],
  );
  const nonFavoriteSearchOptions = useMemo(
    () => ({
      limit: nonFavoriteRenderLimit,
      evaluate: evaluateProjectSearchEntry,
      order: searchOrder,
      canNarrow: projectSearchCanNarrow,
    }),
    [nonFavoriteRenderLimit, searchOrder],
  );
  const favoriteSearchResult = useMemo(
    () => searchIndexedItems(favoriteSearchIndex, parsedSearch, favoriteSearchOptions, favoriteSearchCacheRef.current),
    [favoriteSearchIndex, favoriteSearchOptions, parsedSearch],
  );
  const nonFavoriteSearchResult = useMemo(
    () =>
      searchIndexedItems(
        nonFavoriteSearchIndex,
        parsedSearch,
        nonFavoriteSearchOptions,
        nonFavoriteSearchCacheRef.current,
      ),
    [nonFavoriteSearchIndex, nonFavoriteSearchOptions, parsedSearch],
  );

  useEffect(() => {
    favoriteSearchCacheRef.current = favoriteSearchResult.cache;
    nonFavoriteSearchCacheRef.current = nonFavoriteSearchResult.cache;
  }, [favoriteSearchResult.cache, nonFavoriteSearchResult.cache]);

  const updateSearchText = useCallback((nextSearchText: string) => {
    setSearchText(nextSearchText);
    setFavoriteRenderLimit(initialFavoriteProjectRenderLimit);
    setNonFavoriteRenderLimit(
      nextSearchText.trim()
        ? Math.min(initialSearchProjectRenderLimit, responsiveSearchProjectRenderLimit)
        : initialNonFavoriteProjectRenderLimit,
    );
  }, []);

  const matchingProjects = useMemo(() => {
    const matches = new Set([
      ...favoriteSearchResult.items.map((entry) => entry.project.worktree),
      ...nonFavoriteSearchResult.items.map((entry) => entry.project.worktree),
    ]);
    const ownerQuery = parsedSearch.remoteOwner ?? parsedSearch.usernameQuery;

    return state.projects.filter((project) => {
      if (!matches.has(project.worktree)) return false;
      return !ownerQuery || projectOwner(project) === ownerQuery;
    });
  }, [favoriteSearchResult.items, nonFavoriteSearchResult.items, parsedSearch.remoteOwner, state.projects]);
  const visibleFavorites = useMemo(
    () => matchingProjects.filter((project) => project.isFavorite).slice(0, favoriteRenderLimit),
    [favoriteRenderLimit, matchingProjects],
  );
  const visibleNonFavorites = useMemo(
    () => matchingProjects.filter((project) => !project.isFavorite).slice(0, nonFavoriteRenderLimit),
    [matchingProjects, nonFavoriteRenderLimit],
  );
  const filteredFavoriteCount = favoriteSearchResult.total;
  const filteredNonFavoriteCount = nonFavoriteSearchResult.total;

  function renderProject(project: RaycastProject) {
    return (
      <List.Item
        key={projectItemId(project)}
        id={projectItemId(project)}
        title={projectTitle(project)}
        subtitle={projectSubtitle(project)}
        keywords={project.keywords}
        accessories={[
          ...(project.isFavorite ? [{ icon: { source: Icon.Star, tintColor: "#f5c542" } }] : []),
          ...(project.sandboxCount
            ? [{ tag: `${project.sandboxCount} sandbox${project.sandboxCount === 1 ? "" : "es"}` }]
            : []),
        ]}
        icon={project.icon ? { source: project.icon } : Icon.Folder}
        actions={
          <ActionPanel>
            <Action title={actionTitle} icon={Icon.Checkmark} onAction={() => onSelect(project)} />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List
      navigationTitle={navigationTitle}
      searchBarPlaceholder={searchBarPlaceholder}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={updateSearchText}
    >
      {state.error ? (
        <List.EmptyView
          title="No Raggle Projects Found"
          description="Open Raggle once to refresh its project snapshot."
          icon={Icon.Warning}
        />
      ) : (
        <>
          {visibleFavorites.length ? (
            <List.Section title="Favorites" subtitle={`${visibleFavorites.length} of ${filteredFavoriteCount}`}>
              {visibleFavorites.map(renderProject)}
              {visibleFavorites.length < filteredFavoriteCount ? (
                <List.Item
                  title="Show More Results"
                  subtitle={`Showing ${visibleFavorites.length} of ${filteredFavoriteCount}`}
                  icon={Icon.Plus}
                  actions={
                    <ActionPanel>
                      <Action
                        title="Show More Results"
                        icon={Icon.Plus}
                        onAction={() =>
                          setFavoriteRenderLimit((limit) => nextProjectRenderLimit(limit, filteredFavoriteCount))
                        }
                      />
                    </ActionPanel>
                  }
                />
              ) : null}
            </List.Section>
          ) : null}
          {visibleNonFavorites.length ? (
            <List.Section
              title={visibleFavorites.length ? "Projects" : `Projects (${filteredNonFavoriteCount.toLocaleString()})`}
              subtitle={
                visibleNonFavorites.length < filteredNonFavoriteCount
                  ? `${visibleNonFavorites.length} of ${filteredNonFavoriteCount}`
                  : undefined
              }
            >
              {visibleNonFavorites.map(renderProject)}
              {visibleNonFavorites.length < filteredNonFavoriteCount ? (
                <List.Item
                  title="Show More Results"
                  subtitle={`Showing ${visibleNonFavorites.length} of ${filteredNonFavoriteCount}`}
                  icon={Icon.Plus}
                  actions={
                    <ActionPanel>
                      <Action
                        title="Show More Results"
                        icon={Icon.Plus}
                        onAction={() =>
                          setNonFavoriteRenderLimit((limit) => nextProjectRenderLimit(limit, filteredNonFavoriteCount))
                        }
                      />
                    </ActionPanel>
                  }
                />
              ) : null}
            </List.Section>
          ) : null}
          {!visibleFavorites.length && !visibleNonFavorites.length ? (
            <List.EmptyView title="No Projects" icon={Icon.MagnifyingGlass} />
          ) : null}
        </>
      )}
    </List>
  );
}
