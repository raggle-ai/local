import { Action, ActionPanel, Color, Icon, List, Toast, showToast, useNavigation } from "@raycast/api";
import { existsSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultOpenInTargetForType } from "./config/open-in-apps";
import { AddProjectForm } from "./components/add-project-form";
import { type CloneProjectFormValues } from "./components/clone-project-form";
import { useEnhancedListFavourites, useIndexedSearch } from "./components/enhanced-list";
import { type EditProjectFormValues } from "./components/edit-project-form";
import { type IndividualProjectSettingsValues } from "./components/individual-project-settings";
import { OpenInDropdown } from "./components/open-in-dropdown";
import { DeleteProjectConfirmation } from "./components/delete-project-confirmation";
import { ProjectActionsList } from "./components/project-actions-list";
import { ProjectListItem, ShowMoreProjectsListItem } from "./components/project-list-item";
import { ProjectOwnerRepositoryList } from "./components/project-owner-repository-list";
import { ProjectSettings } from "./components/project-settings";
import { ProjectUsernameList } from "./components/project-username-list";
import {
  clonePathTemplateFromFormValue,
  deriveProjectName,
  projectRowFromValues,
  repositoryRootPath,
  type AddProjectValues,
} from "@raggle-ai/local";
import { saveNewProject } from "./lib/add-project-source";
import {
  getStandardProjectsSettings,
  standardProjectsPreferencesAllowIncomplete,
  standardProjectsPreferencesWithOverrides,
  type StandardProjectsSettings,
} from "./lib/config";
import { cloneErrorMessage, cloneRepository } from "./lib/git-clone";
import { githubRepositoryPath, normalizeRepositoryUrl } from "@raggle-ai/local";
import { openProject, openProjectNewSession, type OpenInTarget } from "./lib/open-in";
import {
  type ImportedRepositoryRow,
  loadImportedRepositories,
  loadImportedRepositoriesFromRows,
  normalizeFolders,
  normalizeTags,
  readImportedRepositoryPlugins,
  writeImportedRepositoryRows,
} from "@raggle-ai/local";
import { defaultOpenInOption } from "./lib/open-in";
import { showMoveFavoriteToast, showToggleFavoriteToast } from "./lib/favorites";
import {
  initialFavoriteProjectRenderLimit,
  initialNonFavoriteProjectRenderLimit,
  initialSearchProjectRenderLimit,
  mergeIgnoredSubpaths,
  mergeRaggleProjectConfig,
  mergeExistingSubpathSettings,
  nextProjectRenderLimit,
  normalizeSubpaths,
  normalizeSubpathPath,
  normalizeSubpathPaths,
  remoteToBrowserUrl,
  subpathParentDisplayName,
  upsertSubpathSettings,
  type ProjectSubpathSettingsValues,
  ignoredSubpathsFromProjectActionConfigs,
  raggleProjectConfigFromProjectActionConfigs,
} from "@raggle-ai/local";
import { projectKeywords, projectTitle } from "./lib/project";
import {
  buildProjectSearchIndex,
  evaluateProjectSearchEntry,
  parseProjectSearch,
  projectSearchCanNarrow,
  projectUsernameListItems,
} from "@raggle-ai/raycast-adapter";
import { useAiChatClientRegistry } from "./hooks/use-ai-chat-clients";
import { loadProjectActionPluginConfigs } from "./lib/project-action-plugin-loader";
import { mergeProjectsIntoCache, type Project } from "./lib/project-store";
import {
  deleteTursoProjectRow,
  reconcileTursoProjectRemote,
  replaceTursoProjectUrl,
  upsertTursoProjectRow,
} from "./lib/project-source/turso-source";
import {
  readLastStandardProjectsSnapshot,
  readStandardProjectsSnapshot,
  writeStandardProjectsSnapshot,
} from "./lib/standard-project-cache";
import {
  loadStandardProjects,
  readCachedProjectsByWorktree,
  sortStandardProjects,
} from "./lib/standard-project-loader";
import {
  applyProjectActionPlugins,
  readCachedProjectSourceRows,
  readProjectSourceRows,
  standardProjectsSourceKey,
} from "./lib/standard-project-source";
import { type StandardProject } from "./lib/standard-project-metadata";
import { needsTursoProjectSourceSetup } from "./lib/turso-project-source-setup";
import { mergeProgressiveProjectUpdate, preserveProjectOrder } from "./lib/stable-project-order";

function nowMs() {
  return Date.now();
}

const responsiveSearchProjectRenderLimit = 100;

function logProjectLoadTiming(label: string, startedAt: number, details?: Record<string, number | string>) {
  const durationMs = nowMs() - startedAt;
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.info(`[projects] ${label} ${durationMs}ms${suffix}`);
}

type StandardProjectListState = {
  items: StandardProject[];
  loading: boolean;
  err?: string;
};

function projectListItemId(
  item: Pick<Project, "id" | "worktree"> & Partial<Pick<StandardProject, "relativePath" | "remoteUrl">>,
) {
  return [item.remoteUrl ?? item.id, item.relativePath ?? ".", item.worktree].join(":");
}

function isProjectFromRepository(item: StandardProject, remoteUrl: string) {
  return normalizeRepositoryUrl(item.remoteUrl) === remoteUrl;
}

function isGitHubForkRemoteMismatch(configuredUrl: string, actualRemoteUrl: string) {
  const configuredRepository = githubRepositoryPath(configuredUrl);
  const actualRepository = githubRepositoryPath(actualRemoteUrl);

  return (
    Boolean(configuredRepository && actualRepository) &&
    configuredRepository?.repo.toLowerCase() === actualRepository?.repo.toLowerCase() &&
    configuredRepository?.owner.toLowerCase() !== actualRepository?.owner.toLowerCase()
  );
}

function repositorySubtitle(remoteUrl?: string, relatedIds: string[] = []) {
  const candidate = [remoteUrl, ...relatedIds].find(
    (value) => value && /[:/]([^/:]+)\/([^/]+?)(?:\.git)?(?:#.*)?$/.test(value),
  );
  if (!candidate) return undefined;

  const normalized = normalizeRepositoryUrl(candidate);

  try {
    const parsedUrl = new URL(normalized);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    if (segments.length >= 2) return `${segments.at(-2)}/${segments.at(-1)?.replace(/\.git$/, "")}`;
  } catch {
    // Fall back to parsing SSH-style remotes.
  }

  const match = normalized.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?(?:#.*)?$/);
  if (!match) return undefined;
  return `${match[1]}/${match[2]}`;
}

function projectSubpathSubtitle(item: StandardProject) {
  if (item.relativePath) {
    if (item.isSubpathRoot) return undefined;

    return subpathParentDisplayName(item.relativePath);
  }

  return undefined;
}

function projectAccessoryText(item: StandardProject) {
  return repositorySubtitle(item.remoteMismatch?.actualRemoteUrl ?? item.remoteUrl, item.relatedIds);
}

function isMainRepositoryProject(item: StandardProject, items: StandardProject[]) {
  if (item.relativePath) return false;

  return items.some(
    (candidate) =>
      candidate.worktree !== item.worktree &&
      candidate.repositoryRoot === item.repositoryRoot &&
      candidate.relativePath,
  );
}

function projectBrowserUrl(item: StandardProject) {
  const displayRemoteUrl = item.remoteMismatch?.actualRemoteUrl ?? item.remoteUrl;
  return remoteToBrowserUrl(displayRemoteUrl) ?? item.browserUrl;
}

export default function Command() {
  const { push } = useNavigation();
  const { supportsNewSession: aiClientSupportsNewSession } = useAiChatClientRegistry();
  const [projectSettings, setProjectSettings] = useState<StandardProjectsSettings>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const refreshPromiseRef = useRef<Promise<StandardProject[]> | undefined>(undefined);
  const didOpenTursoSetupRef = useRef(false);
  const extensionPreferences = useMemo(() => standardProjectsPreferencesAllowIncomplete(), []);
  const preferences = useMemo(
    () => (settingsLoaded ? standardProjectsPreferencesWithOverrides(projectSettings) : extensionPreferences),
    [extensionPreferences, projectSettings, settingsLoaded],
  );
  const sourceKey = standardProjectsSourceKey(preferences);
  const ignoredSubpathsKey = preferences.globalIgnoredSubpaths?.join("\n") ?? "";
  const projectActionsDirectoryKey = preferences.projectActionsDirectory?.join("\n") ?? "";
  const initialSourceKey = standardProjectsSourceKey(extensionPreferences);
  const initialSnapshot = readStandardProjectsSnapshot(initialSourceKey);
  const lastSnapshot = readLastStandardProjectsSnapshot(initialSourceKey);
  const initialItems = initialSnapshot?.items ?? lastSnapshot?.items ?? [];
  const [openInTarget, setOpenInTarget] = useState<OpenInTarget>(
    () => defaultOpenInOption(preferences.openInTarget).target,
  );
  const supportsNewSessionTarget = aiClientSupportsNewSession(openInTarget);
  const [state, setState] = useState<StandardProjectListState>({
    items: initialItems,
    loading: initialItems.length === 0,
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(
    initialItems[0] ? projectListItemId(initialItems[0]) : undefined,
  );
  const [cachedProjectsByWorktree] = useState(() => readCachedProjectsByWorktree());
  const [favoriteRenderLimit, setFavoriteRenderLimit] = useState(initialFavoriteProjectRenderLimit);
  const [nonFavoriteRenderLimit, setNonFavoriteRenderLimit] = useState(initialNonFavoriteProjectRenderLimit);
  const [searchText, setSearchText] = useState("");
  const getProjectItemKey = useCallback((project: StandardProject) => project.worktree, []);
  const legacyFavorites = useMemo(
    () => state.items.filter((item) => item.isFavorite).map((item) => item.worktree),
    [state.items],
  );
  const favouriteState = useEnhancedListFavourites(state.items, {
    storageKey: "standard-projects-favorites",
    getItemKey: getProjectItemKey,
    initialFavourites: legacyFavorites,
  });

  // Set up fuzzy search filtering
  const allDisplayItems = useMemo(
    () => [...favouriteState.orderedFavourites, ...favouriteState.nonFavourites],
    [favouriteState.orderedFavourites, favouriteState.nonFavourites],
  );

  const projectSearchIndex = useMemo(
    () =>
      buildProjectSearchIndex(state.items, {
        getKeywords: (project) => project.keywords ?? projectKeywords(project),
        getTitle: projectTitle,
        getRepositoryName: (project) => deriveProjectName(project.remoteUrl),
      }),
    [state.items],
  );
  const parsedSearch = useMemo(() => parseProjectSearch(searchText), [searchText]);
  const displayOrderByWorktree = useMemo(
    () => new Map(allDisplayItems.map((item, index) => [item.worktree, index])),
    [allDisplayItems],
  );
  const favouriteWorktrees = useMemo(
    () => new Set(favouriteState.orderedFavourites.map((item) => item.worktree)),
    [favouriteState.orderedFavourites],
  );
  const favouriteSearchIndex = useMemo(
    () => projectSearchIndex.filter((entry) => favouriteWorktrees.has(entry.project.worktree)),
    [favouriteWorktrees, projectSearchIndex],
  );
  const nonFavouriteSearchIndex = useMemo(
    () => projectSearchIndex.filter((entry) => !favouriteWorktrees.has(entry.project.worktree)),
    [favouriteWorktrees, projectSearchIndex],
  );
  const favouriteSearchOptions = useMemo(
    () => ({
      limit: favoriteRenderLimit,
      evaluate: evaluateProjectSearchEntry,
      order: (entry: (typeof projectSearchIndex)[number]) =>
        displayOrderByWorktree.get(entry.project.worktree) ?? Number.MAX_SAFE_INTEGER,
      canNarrow: projectSearchCanNarrow,
    }),
    [displayOrderByWorktree, favoriteRenderLimit, projectSearchIndex],
  );
  const nonFavouriteSearchOptions = useMemo(
    () => ({
      limit: nonFavoriteRenderLimit,
      evaluate: evaluateProjectSearchEntry,
      order: (entry: (typeof projectSearchIndex)[number]) =>
        displayOrderByWorktree.get(entry.project.worktree) ?? Number.MAX_SAFE_INTEGER,
      canNarrow: projectSearchCanNarrow,
    }),
    [displayOrderByWorktree, nonFavoriteRenderLimit, projectSearchIndex],
  );
  const favouriteSearch = useIndexedSearch(favouriteSearchIndex, parsedSearch, favouriteSearchOptions);
  const nonFavouriteSearch = useIndexedSearch(nonFavouriteSearchIndex, parsedSearch, nonFavouriteSearchOptions);
  const visibleFavourites = useMemo(() => favouriteSearch.items.map((entry) => entry.project), [favouriteSearch.items]);
  const visibleNonFavourites = useMemo(
    () => nonFavouriteSearch.items.map((entry) => entry.project),
    [nonFavouriteSearch.items],
  );
  const filteredItems = useMemo(
    () => [...visibleFavourites, ...visibleNonFavourites],
    [visibleFavourites, visibleNonFavourites],
  );
  const filteredFavouriteCount = favouriteSearch.total;
  const filteredNonFavouriteCount = nonFavouriteSearch.total;
  const updateSearchText = useCallback((nextSearchText: string) => {
    setSearchText(nextSearchText);
    setFavoriteRenderLimit(initialFavoriteProjectRenderLimit);
    setNonFavoriteRenderLimit(
      nextSearchText.trim()
        ? Math.min(initialSearchProjectRenderLimit, responsiveSearchProjectRenderLimit)
        : initialNonFavoriteProjectRenderLimit,
    );
  }, []);
  const showUsernameList = parsedSearch.usernameQuery !== undefined;
  const usernameListItems = useMemo(
    () => projectUsernameListItems(allDisplayItems, parsedSearch.usernameQuery),
    [allDisplayItems, parsedSearch.usernameQuery],
  );
  const storedRepositoryUrls = useMemo(() => {
    const urls = new Set<string>();

    for (const item of allDisplayItems) {
      if (item.relativePath) continue;

      const browserUrl = projectBrowserUrl(item);
      if (browserUrl) urls.add(browserUrl.toLowerCase());
    }

    return urls;
  }, [allDisplayItems]);

  const selectedProject = useMemo(
    () => (showUsernameList ? undefined : filteredItems.find((item) => projectListItemId(item) === selectedProjectId)),
    [filteredItems, selectedProjectId, showUsernameList],
  );

  const selectedProjectBrowserUrl = useMemo(() => {
    return selectedProject?.browserUrl ?? (selectedProject ? remoteToBrowserUrl(selectedProject.remoteUrl) : undefined);
  }, [selectedProject]);

  useEffect(() => {
    if (showUsernameList) return;
    if (selectedProjectId || !filteredItems[0]) return;
    setSelectedProjectId(projectListItemId(filteredItems[0]));
  }, [filteredItems, selectedProjectId, showUsernameList]);

  function toggleFavouriteProject(worktree: string, title: string) {
    const isFavourite = favouriteState.isFavourite(worktree);
    favouriteState.toggleFavourite(worktree);
    showToggleFavoriteToast(title, isFavourite);
  }

  function moveFavouriteProjectUp(worktree: string, title: string) {
    if (!favouriteState.moveFavouriteUp(worktree)) return;
    showMoveFavoriteToast(title, "up");
  }

  function moveFavouriteProjectDown(worktree: string, title: string) {
    if (!favouriteState.moveFavouriteDown(worktree)) return;
    showMoveFavoriteToast(title, "down");
  }

  function openProjectSettings(initialPane?: "turso") {
    push(
      <ProjectSettings
        initialPane={initialPane}
        initialSettings={{
          projectSource: preferences.projectSource,
          projectListFile: preferences.projectListFile,
          cloneDirectory: preferences.cloneDirectory,
          projectActionsDirectory: preferences.projectActionsDirectory,
          openInTarget: preferences.openInTarget,
          defaultTerminalTarget: preferences.defaultTerminalTarget,
          defaultIdeTarget: preferences.defaultIdeTarget,
          defaultAiClientTarget: preferences.defaultAiClientTarget,
          defaultDocumentsTarget: preferences.defaultDocumentsTarget,
          defaultGitDiffTarget: preferences.defaultGitDiffTarget,
          multiOpenInTargets: preferences.multiOpenInTargets,
          multiOpenInShortcuts: preferences.multiOpenInShortcuts,
          gitCloneAccount: preferences.gitCloneAccount,
          gitPullRequestAuthors: preferences.gitPullRequestAuthors,
          tursoDatabaseUrl: preferences.tursoDatabaseUrl,
          tursoAuthToken: preferences.tursoAuthToken,
        }}
        onSaved={(settings) => {
          setProjectSettings(settings);
          setOpenInTarget(settings.openInTarget ?? defaultOpenInOption(extensionPreferences.openInTarget).target);
        }}
      />,
    );
  }

  async function saveNewProjectAndRefresh(values: AddProjectValues) {
    const { normalizedUrl } = await saveNewProject(preferences, values);
    const items = await refreshProjects({ showLoading: false });
    const item = items.find((candidate) => !candidate.relativePath && candidate.remoteUrl === normalizedUrl);

    return { item, normalizedUrl };
  }

  async function addProject(values: AddProjectValues) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Adding repository",
      message: values.url,
    });

    try {
      const { normalizedUrl } = await saveNewProjectAndRefresh(values);

      toast.style = Toast.Style.Success;
      toast.title = "Repository added";
      toast.message = normalizedUrl;

      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not add repository";
      toast.message = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  function validateCloneDestination(repositoryRoot: string) {
    const homeDir = os.homedir();
    const parentDir = path.dirname(repositoryRoot);
    const repoName = path.basename(repositoryRoot);

    if (repositoryRoot === homeDir || (parentDir === homeDir && repoName === ".")) {
      throw new Error(
        `Invalid clone destination: ${repositoryRoot}. The clone directory cannot be your home directory. ` +
          `Please check your "Clone Directory" preference in extension settings (Cmd+Shift+,).`,
      );
    }
  }

  async function cloneProjectRepository(item: StandardProject) {
    if (item.isCloned) return item;

    validateCloneDestination(item.repositoryRoot);
    const result = await cloneRepository(item.remoteUrl, item.repositoryRoot, {
      gitCloneAccount: preferences.gitCloneAccount,
      terminalTarget: defaultOpenInTargetForType(preferences, "terminal"),
    });

    if (result === "started") return undefined;

    const nextItem = { ...item, isCloned: true };
    mergeProjectsIntoCache([nextItem]);
    let nextItems: StandardProject[] = [];
    setState((current: StandardProjectListState) => {
      let didReplace = false;
      const updatedItems = current.items.map((currentItem: StandardProject) => {
        const isSameProject =
          currentItem.worktree === item.worktree ||
          (!currentItem.relativePath && currentItem.remoteUrl === item.remoteUrl);
        if (!isSameProject) return currentItem;
        didReplace = true;
        return nextItem;
      });

      nextItems = sortStandardProjects(didReplace ? updatedItems : [...updatedItems, nextItem]);
      return {
        ...current,
        items: nextItems,
      };
    });
    writeStandardProjectsSnapshot(sourceKey, nextItems);

    return nextItem;
  }

  async function saveProjectClonePath(item: StandardProject, values: CloneProjectFormValues) {
    const rows = await readProjectSourceRows(preferences);
    const index = rows.findIndex((row) => normalizeRepositoryUrl(row.url) === item.remoteUrl);
    if (index === -1) {
      throw new Error(`Could not find ${item.remoteUrl} in ${preferences.projectListFile}`);
    }

    const clonePathTemplate = clonePathTemplateFromFormValue(
      values.clonePath,
      preferences.cloneDirectory,
      path.basename(
        repositoryRootPath(
          { repository: deriveProjectName(item.remoteUrl), remoteUrl: item.remoteUrl },
          preferences.cloneDirectory,
        ),
      ),
    );
    const nextRow = { ...rows[index] };
    if (clonePathTemplate) nextRow.clonePathTemplate = clonePathTemplate;
    else delete nextRow.clonePathTemplate;

    if (preferences.projectSource === "turso") {
      await replaceTursoProjectUrl(preferences, item.remoteUrl, nextRow);
    } else {
      rows[index] = nextRow;
      writeImportedRepositoryRows(preferences.projectListFile, rows);
    }

    const repositoryName = deriveProjectName(item.remoteUrl);
    const repositoryRoot = repositoryRootPath(
      { repository: repositoryName, remoteUrl: item.remoteUrl, clonePathTemplate },
      preferences.cloneDirectory,
    );

    return { ...item, worktree: repositoryRoot, repositoryRoot };
  }

  async function cloneProjectOnly(item: StandardProject, values?: CloneProjectFormValues) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Cloning repository",
      message: values?.clonePath ?? item.repositoryRoot,
    });

    try {
      let cloneItem = item;
      if (values) {
        cloneItem = await saveProjectClonePath(item, values);
      }

      const nextItem = await cloneProjectRepository(cloneItem);
      toast.style = Toast.Style.Success;
      toast.title = nextItem ? "Repository cloned" : "Clone started in terminal";
      toast.message = cloneItem.repositoryRoot;
      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Repository saved, clone failed";
      toast.message = await cloneErrorMessage(item.remoteUrl, error);
      return false;
    }
  }

  async function refreshProjects(options?: {
    showLoading?: boolean;
    force?: boolean;
    background?: boolean;
    refreshSource?: boolean;
    fallbackItems?: StandardProject[];
  }): Promise<StandardProject[]> {
    if (refreshPromiseRef.current && !options?.force && !options?.background) {
      return refreshPromiseRef.current;
    }

    const startedAt = nowMs();
    if ((options?.showLoading ?? true) && !options?.background) {
      setState((current) => ({ ...current, loading: true, err: undefined }));
    }

    const refreshPromise = (async () => {
      const importStartedAt = nowMs();
      const cachedRows =
        !options?.force && !options?.refreshSource ? readCachedProjectSourceRows(preferences) : undefined;
      const rows = cachedRows ?? (await readProjectSourceRows(preferences));
      const sourcePlugins =
        preferences.projectSource === "turso" && preferences.projectListFile && existsSync(preferences.projectListFile)
          ? readImportedRepositoryPlugins(preferences.projectListFile)
          : [];
      const repositories =
        preferences.projectSource === "turso"
          ? loadImportedRepositoriesFromRows(rows, sourcePlugins)
          : loadImportedRepositories(preferences.projectListFile);
      const repositoriesWithProjectActions = applyProjectActionPlugins(repositories, preferences);
      const projectActionConfigs = await loadProjectActionPluginConfigs(
        [...new Set(repositoriesWithProjectActions.flatMap((repository) => repository.plugins))],
        preferences.projectListFile,
      );
      const projectActionConfig = raggleProjectConfigFromProjectActionConfigs(projectActionConfigs);
      const configuredRepositories = repositoriesWithProjectActions.map((repository) =>
        mergeRaggleProjectConfig(repository, projectActionConfig),
      );
      const ignoredSubpaths = mergeIgnoredSubpaths(
        preferences.globalIgnoredSubpaths,
        ignoredSubpathsFromProjectActionConfigs(projectActionConfigs),
      );
      logProjectLoadTiming("readProjectSourceRows", importStartedAt, {
        source: preferences.projectSource ?? "json-file",
        cache: cachedRows ? "hit" : "miss",
        repositories: configuredRepositories.length,
      });

      const items = await loadStandardProjects(sourceKey, configuredRepositories, preferences.cloneDirectory, {
        force: options?.force,
        ignoredSubpaths,
        onUpdate: (updated) => {
          // Progressive package updates are partial; retain warm subpaths until the complete result arrives.
          setState((current) => ({
            ...current,
            items: mergeProgressiveProjectUpdate(current.items, sortStandardProjects(updated)),
            loading: false,
          }));
        },
      });
      const reconciledRemotes = cachedRows ? 0 : await reconcileTursoRemoteMismatches(items);
      setState((current) => ({ items: preserveProjectOrder(current.items, items), loading: false }));
      logProjectLoadTiming("refreshProjects", startedAt, { items: items.length, reconciledRemotes });

      if (preferences.projectSource === "turso" && cachedRows && !options?.background) {
        void refreshProjects({ showLoading: false, background: true, refreshSource: true, fallbackItems: items });
      } else if (reconciledRemotes > 0 && !options?.background) {
        void refreshProjects({
          force: true,
          showLoading: false,
          background: true,
          refreshSource: true,
          fallbackItems: items,
        });
      }

      return items;
    })();

    if (!options?.background) {
      refreshPromiseRef.current = refreshPromise;
    }

    try {
      return await refreshPromise;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const preservedItems = options?.fallbackItems?.length
        ? options.fallbackItems
        : state.items.length
          ? state.items
          : initialItems;

      if (preservedItems.length) {
        setState((current) => ({
          ...current,
          items: current.items.length ? current.items : preservedItems,
          loading: false,
          err: undefined,
        }));
        await showToast({
          style: Toast.Style.Failure,
          title: "Could not refresh projects",
          message: `Showing saved local projects. ${message}`,
        });
      } else if (!options?.background) {
        setState({
          items: preservedItems,
          loading: false,
          err: message,
        });
      }
      logProjectLoadTiming("refreshProjectsFailed", startedAt, {
        message,
      });

      if (preservedItems.length) return preservedItems;
      throw error;
    } finally {
      if (refreshPromiseRef.current === refreshPromise) {
        refreshPromiseRef.current = undefined;
      }
    }
  }

  async function reconcileTursoRemoteMismatches(items: StandardProject[]) {
    if (preferences.projectSource !== "turso") return 0;

    const mismatches = new Map<string, { previousUrl: string; actualRemoteUrl: string }>();
    for (const item of items) {
      if (item.relativePath || !item.remoteMismatch?.actualRemoteUrl) continue;
      if (isGitHubForkRemoteMismatch(item.remoteUrl, item.remoteMismatch.actualRemoteUrl)) continue;
      mismatches.set(item.remoteUrl, {
        previousUrl: item.remoteUrl,
        actualRemoteUrl: item.remoteMismatch.actualRemoteUrl,
      });
    }

    let reconciled = 0;
    for (const mismatch of mismatches.values()) {
      if (await reconcileTursoProjectRemote(preferences, mismatch.previousUrl, mismatch.actualRemoteUrl)) {
        reconciled += 1;
      }
    }

    return reconciled;
  }

  async function openOrCloneProject(
    item: StandardProject,
    target: OpenInTarget = openInTarget,
    options?: { newSession?: boolean },
  ) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: item.isCloned ? `Opening ${item.name}` : `Cloning ${item.name}`,
      message: item.worktree,
    });

    try {
      const nextItem = await cloneProjectRepository(item);

      if (!nextItem) {
        toast.style = Toast.Style.Success;
        toast.title = "Clone started in terminal";
        toast.message = item.worktree;
        return;
      }

      toast.style = Toast.Style.Success;
      toast.title = item.isCloned ? `Opened ${item.name}` : `Cloned ${item.name}`;
      toast.message = nextItem.worktree;

      if (options?.newSession) {
        await openProjectNewSession(nextItem.worktree, target);
      } else {
        await openProject(nextItem.worktree, target);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Handle remote URL mismatch - auto-refresh and try again
      if (errorMessage.includes("different remote URL")) {
        toast.style = Toast.Style.Animated;
        toast.title = "Remote URL mismatch detected";
        toast.message = "Refreshing project status...";

        try {
          const refreshedItems = await refreshProjects({ showLoading: false });

          // Find the updated item after refresh
          const refreshedItem = refreshedItems.find((candidate) => candidate.worktree === item.worktree);

          if (refreshedItem?.isCloned) {
            // The refresh detected the correct remote - now open it
            toast.style = Toast.Style.Success;
            toast.title = `Opening ${refreshedItem.name}`;
            toast.message = refreshedItem.worktree;
            if (options?.newSession) {
              await openProjectNewSession(refreshedItem.worktree, target);
            } else {
              await openProject(refreshedItem.worktree, target);
            }
            return;
          }

          // Still not recognized as cloned - show the mismatch error
          toast.style = Toast.Style.Failure;
          toast.title = `Could not clone ${item.name}`;
          toast.message = `Remote URL mismatch. Update the project configuration to match: ${errorMessage.split("Found: ")[1] ?? "the actual remote"}`;
        } catch {
          toast.style = Toast.Style.Failure;
          toast.title = `Could not clone ${item.name}`;
          toast.message = errorMessage;
        }
        return;
      }

      toast.style = Toast.Style.Failure;
      toast.title = `Could not ${item.isCloned ? "open" : "clone"} ${item.name}`;
      toast.message = await cloneErrorMessage(item.remoteUrl, error);
    }
  }

  async function loadProjectFormValues(item: StandardProject) {
    const row = (await readProjectSourceRows(preferences)).find(
      (candidate) => normalizeRepositoryUrl(candidate.url) === item.remoteUrl,
    );
    if (!row) {
      throw new Error(`Could not find ${item.remoteUrl} in ${preferences.projectListFile}`);
    }

    return {
      name: typeof row.name === "string" ? row.name : (item.name ?? ""),
      description: typeof row.description === "string" ? row.description : (item.description ?? ""),
      iconColor: item.iconColor ?? "",
      startupCommand: item.startupCommand ?? "",
      file: [],
      url: row.url,
      tags: normalizeTags(row.tags).join("\n"),
      folders: normalizeFolders(row.folders),
      subpaths: normalizeSubpathPaths(row.subpaths).join("\n"),
    } satisfies EditProjectFormValues;
  }

  async function loadIndividualProjectSettings(item: StandardProject) {
    const row = (await readProjectSourceRows(preferences)).find(
      (candidate) => normalizeRepositoryUrl(candidate.url) === item.remoteUrl,
    );
    if (!row) {
      throw new Error(`Could not find ${item.remoteUrl} in ${preferences.projectListFile}`);
    }

    return {
      allSubpath: row.allSubpath === true,
      removePathFromName: row.removePathFromName === true,
    } satisfies IndividualProjectSettingsValues;
  }

  async function loadProjectSubpathSettings(item: StandardProject) {
    if (!item.relativePath) {
      throw new Error("Choose a repository subpath before opening subpath settings");
    }

    const row = (await readProjectSourceRows(preferences)).find(
      (candidate) => normalizeRepositoryUrl(candidate.url) === item.remoteUrl,
    );
    if (!row) {
      throw new Error(`Could not find ${item.remoteUrl} in ${preferences.projectListFile}`);
    }

    const subpath = normalizeSubpaths(row.subpaths).find((candidate) => candidate.path === item.relativePath);

    return {
      allSubpath: subpath ? (subpath.allSubpath ?? true) : false,
      removePathFromName: subpath?.removePathFromName ?? item.removePathFromName ?? row.removePathFromName === true,
    } satisfies ProjectSubpathSettingsValues;
  }

  async function saveProject(item: StandardProject, values: EditProjectFormValues) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Saving repository",
      message: item.remoteUrl,
    });

    try {
      const rows = await readProjectSourceRows(preferences);
      const index = rows.findIndex((row) => normalizeRepositoryUrl(row.url) === item.remoteUrl);
      if (index === -1) {
        throw new Error(`Could not find ${item.remoteUrl} in ${preferences.projectListFile}`);
      }

      const nextRow = projectRowFromValues(values);
      const nextSubpaths = mergeExistingSubpathSettings(rows[index].subpaths, nextRow.subpaths);
      if (nextSubpaths.length) nextRow.subpaths = nextSubpaths;
      else delete nextRow.subpaths;
      if (rows[index].clonePathTemplate) nextRow.clonePathTemplate = rows[index].clonePathTemplate;
      if (rows[index].removePathFromName === true) nextRow.removePathFromName = true;
      if (rows[index].allSubpath === true) nextRow.allSubpath = true;
      const nextUrl = normalizeRepositoryUrl(nextRow.url);

      if (preferences.projectSource === "turso") {
        await replaceTursoProjectUrl(preferences, item.remoteUrl, nextRow);
      } else {
        rows[index] = nextRow;
        writeImportedRepositoryRows(preferences.projectListFile, rows);
      }
      await refreshProjects();

      toast.style = Toast.Style.Success;
      toast.title = "Repository saved";
      toast.message = nextUrl;
      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not save repository";
      toast.message = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  async function saveIndividualProjectSettings(item: StandardProject, values: IndividualProjectSettingsValues) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Saving project settings",
      message: item.remoteUrl,
    });

    try {
      const rows = await readProjectSourceRows(preferences);
      const index = rows.findIndex((row) => normalizeRepositoryUrl(row.url) === item.remoteUrl);
      if (index === -1) {
        throw new Error(`Could not find ${item.remoteUrl} in ${preferences.projectListFile}`);
      }

      const nextRow: ImportedRepositoryRow = {
        ...rows[index],
        ...(values.allSubpath ? { allSubpath: true } : {}),
        ...(values.removePathFromName ? { removePathFromName: true } : {}),
      };
      if (!values.allSubpath) delete nextRow.allSubpath;
      if (!values.removePathFromName) delete nextRow.removePathFromName;

      if (preferences.projectSource === "turso") {
        await upsertTursoProjectRow(preferences, nextRow);
      } else {
        rows[index] = nextRow;
        writeImportedRepositoryRows(preferences.projectListFile, rows);
      }
      await refreshProjects({ force: true });

      toast.style = Toast.Style.Success;
      toast.title = "Project settings saved";
      toast.message = item.name ?? item.remoteUrl;
      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not save project settings";
      toast.message = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  async function saveProjectSubpathSettings(item: StandardProject, values: ProjectSubpathSettingsValues) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Saving subpath settings",
      message: item.relativePath ?? item.remoteUrl,
    });

    try {
      if (!item.relativePath) {
        throw new Error("Choose a repository subpath before saving subpath settings");
      }

      const rows = await readProjectSourceRows(preferences);
      const index = rows.findIndex((row) => normalizeRepositoryUrl(row.url) === item.remoteUrl);
      if (index === -1) {
        throw new Error(`Could not find ${item.remoteUrl} in ${preferences.projectListFile}`);
      }

      const normalizedSubpath = normalizeSubpathPath(item.relativePath);
      if (!normalizedSubpath) {
        throw new Error("Choose a valid subpath");
      }

      const nextRow: ImportedRepositoryRow = {
        ...rows[index],
        subpaths: upsertSubpathSettings(rows[index].subpaths, normalizedSubpath, values),
      };

      if (preferences.projectSource === "turso") {
        await upsertTursoProjectRow(preferences, nextRow);
      } else {
        rows[index] = nextRow;
        writeImportedRepositoryRows(preferences.projectListFile, rows);
      }
      await refreshProjects({ force: true });

      toast.style = Toast.Style.Success;
      toast.title = "Subpath settings saved";
      toast.message = normalizedSubpath;
      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not save subpath settings";
      toast.message = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  async function addProjectSubpath(item: StandardProject, subpath: string, options?: { createFolder?: boolean }) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Adding subpath",
      message: subpath,
    });

    try {
      const normalizedSubpath = normalizeSubpathPaths([subpath])[0];
      if (!normalizedSubpath) {
        throw new Error("Choose a valid subpath");
      }
      if (normalizedSubpath.includes("/")) {
        throw new Error("Subpath must be a first-level folder");
      }

      const rows = await readProjectSourceRows(preferences);
      const index = rows.findIndex((row) => normalizeRepositoryUrl(row.url) === item.remoteUrl);
      if (index === -1) {
        throw new Error(`Could not find ${item.remoteUrl} in ${preferences.projectListFile}`);
      }

      const existingSubpaths = normalizeSubpathPaths(rows[index].subpaths);
      if (existingSubpaths.includes(normalizedSubpath)) {
        throw new Error(`${normalizedSubpath} is already a subpath`);
      }

      if (options?.createFolder) {
        const folderPath = path.join(item.repositoryRoot, normalizedSubpath);
        if (existsSync(folderPath)) {
          if (!statSync(folderPath).isDirectory()) {
            throw new Error(`${normalizedSubpath} already exists and is not a folder`);
          }
        } else {
          await mkdir(folderPath);
        }
      }

      const existingRawSubpaths =
        rows[index].subpaths === true
          ? [{ path: "." }]
          : Array.isArray(rows[index].subpaths)
            ? rows[index].subpaths
            : existingSubpaths;
      const nextRow: ImportedRepositoryRow = {
        ...rows[index],
        subpaths: [...existingRawSubpaths, normalizedSubpath],
      };

      if (preferences.projectSource === "turso") {
        await upsertTursoProjectRow(preferences, nextRow);
      } else {
        rows[index] = nextRow;
        writeImportedRepositoryRows(preferences.projectListFile, rows);
      }
      await refreshProjects();

      toast.style = Toast.Style.Success;
      toast.title = "Subpath added";
      toast.message = normalizedSubpath;
      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not add subpath";
      toast.message = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  async function deleteProject(item: StandardProject) {
    const normalizedRemoteUrl = normalizeRepositoryUrl(item.remoteUrl);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Deleting project",
      message: item.remoteUrl,
    });

    try {
      const rows = await readProjectSourceRows(preferences);
      const filteredRows = rows.filter((row) => normalizeRepositoryUrl(row.url) !== normalizedRemoteUrl);

      if (filteredRows.length === rows.length) {
        throw new Error(`Could not find ${item.remoteUrl} in ${preferences.projectListFile}`);
      }

      if (preferences.projectSource === "turso") {
        await deleteTursoProjectRow(preferences, item.remoteUrl);
      } else {
        writeImportedRepositoryRows(preferences.projectListFile, filteredRows);
      }
      setState((current) => ({
        ...current,
        items: current.items.filter((currentItem) => !isProjectFromRepository(currentItem, normalizedRemoteUrl)),
      }));
      await refreshProjects({ force: true, refreshSource: true });

      toast.style = Toast.Style.Success;
      toast.title = "Project deleted";
      toast.message = item.remoteUrl;
      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not delete project";
      toast.message = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadProjectSettings() {
      const storedSettings = await getStandardProjectsSettings();
      if (!isCancelled) {
        setProjectSettings(storedSettings);
        setSettingsLoaded(true);
        setOpenInTarget(storedSettings.openInTarget ?? defaultOpenInOption(extensionPreferences.openInTarget).target);
        const storedPreferences = standardProjectsPreferencesWithOverrides(storedSettings);
        const storedSourceKey = standardProjectsSourceKey(storedPreferences);
        const storedSnapshot =
          readStandardProjectsSnapshot(storedSourceKey) ?? readLastStandardProjectsSnapshot(storedSourceKey);
        if (storedSnapshot?.items.length) {
          setState((current) => ({
            ...current,
            items: storedSnapshot.items,
            loading: false,
            err: undefined,
          }));
        }
      }
    }

    void loadProjectSettings();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    if (needsTursoProjectSourceSetup(preferences)) {
      setState((current) => ({ ...current, loading: false, err: undefined }));

      if (!didOpenTursoSetupRef.current) {
        didOpenTursoSetupRef.current = true;
        openProjectSettings("turso");
      }

      return;
    }

    void refreshProjects({ showLoading: initialItems.length === 0 });
  }, [
    preferences.projectSource,
    preferences.projectListFile,
    preferences.cloneDirectory,
    projectActionsDirectoryKey,
    ignoredSubpathsKey,
    preferences.tursoDatabaseUrl,
    settingsLoaded,
  ]);

  if (state.err) {
    return (
      <List
        isLoading={state.loading}
        searchBarPlaceholder="Search standard projects..."
        searchBarAccessory={<OpenInDropdown value={openInTarget} onChange={setOpenInTarget} />}
      >
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Could not load standard projects"
          description={state.err}
          actions={
            <ActionPanel>
              <Action
                title="Reload Projects"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={refreshProjects}
              />
              <Action
                title="Add New Project"
                icon={Icon.Plus}
                shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
                onAction={() => {
                  push(<AddProjectForm defaultCloneDirectory={preferences.cloneDirectory} onSubmit={addProject} />);
                }}
              />
              <Action
                title="Project Settings"
                icon={Icon.Gear}
                shortcut={{ modifiers: ["cmd", "shift"], key: "," }}
                onAction={openProjectSettings}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const showPendingFavourites = !state.loading && favouriteState.pendingFavouriteKeys.length > 0;
  const showFavouritesSection = !showUsernameList && (visibleFavourites.length > 0 || showPendingFavourites);
  const showEmptyProjectsView = !showUsernameList && !state.loading && filteredItems.length === 0;
  const hasHiddenFavourites = visibleFavourites.length < filteredFavouriteCount;
  const hasHiddenNonFavourites = visibleNonFavourites.length < filteredNonFavouriteCount;
  const showLoadingSection = false;
  // const showLoadingSection = state.loading && state.items.length === 0;

  function projectActionsTarget(item: StandardProject) {
    return (
      <ProjectActionsList
        item={item}
        projectListFile={preferences.projectListFile}
        openInTarget={openInTarget}
        defaultTerminalTarget={preferences.defaultTerminalTarget}
        defaultIdeTarget={preferences.defaultIdeTarget}
        defaultAiClientTarget={preferences.defaultAiClientTarget}
        defaultDocumentsTarget={preferences.defaultDocumentsTarget}
        defaultGitDiffTarget={preferences.defaultGitDiffTarget}
        multiOpenInTargets={preferences.multiOpenInTargets}
        multiOpenInShortcuts={preferences.multiOpenInShortcuts}
        gitPullRequestAuthors={preferences.gitPullRequestAuthors}
        onOpenProject={async (project) => {
          favouriteState.recordSelection(project.worktree);
          await openOrCloneProject(project);
        }}
        onOpenProjectIn={async (project, target) => {
          favouriteState.recordSelection(project.worktree);
          await openOrCloneProject(project, target);
        }}
        onOpenProjectNewSession={async (project, target) => {
          favouriteState.recordSelection(project.worktree);
          await openOrCloneProject(project, target, { newSession: true });
        }}
        onDeleteProject={(project) => deleteProject(project as StandardProject)}
      />
    );
  }

  function deleteProjectTarget(item: StandardProject) {
    return (
      <DeleteProjectConfirmation item={item} onDeleteProject={(project) => deleteProject(project as StandardProject)} />
    );
  }

  return (
    <List
      isLoading={state.loading}
      filtering={false}
      searchBarPlaceholder="Search standard projects..."
      searchBarAccessory={
        <OpenInDropdown value={openInTarget} browserUrl={selectedProjectBrowserUrl} onChange={setOpenInTarget} />
      }
      searchText={searchText}
      onSearchTextChange={updateSearchText}
      onSelectionChange={(id) => setSelectedProjectId(id ?? undefined)}
    >
      {showLoadingSection ? (
        <List.Section title="Loading" subtitle="Scanning repositories">
          {Array.from({ length: 6 }, (_, index) => (
            <List.Item
              key={`loading-${index}`}
              title="Loading projects..."
              subtitle="Checking local clones and folders"
              icon={Icon.Clock}
            />
          ))}
        </List.Section>
      ) : null}
      {showUsernameList ? (
        <ProjectUsernameList
          items={usernameListItems}
          query={parsedSearch.usernameQuery ?? ""}
          onSelectUsername={(username) => setSearchText(`from:${username}`)}
          onRefreshProjects={() => refreshProjects({ force: true })}
          onOpenSettings={openProjectSettings}
        />
      ) : null}
      {showFavouritesSection ? (
        <List.Section
          title="Favorites"
          subtitle={`${visibleFavourites.length + favouriteState.pendingFavouriteKeys.length} of ${filteredFavouriteCount + favouriteState.pendingFavouriteKeys.length}`}
        >
          {!state.loading
            ? favouriteState.pendingFavouriteKeys.map((worktree) => {
                const cachedProject = cachedProjectsByWorktree.get(worktree);
                const hasLocalProject = existsSync(worktree);
                const defaultOpenIn = defaultOpenInOption(openInTarget);
                const item =
                  cachedProject ??
                  ({
                    id: worktree,
                    worktree,
                    sandboxCount: 0,
                    hasIcon: false,
                    isSessionOnly: false,
                    isFavorite: true,
                    relatedIds: [worktree],
                  } satisfies Project);
                const title = projectTitle(item);

                return (
                  <List.Item
                    id={`pending-${worktree}`}
                    key={`pending-${worktree}`}
                    title={title}
                    keywords={item.keywords ?? projectKeywords(item)}
                    accessories={[
                      ...(repositorySubtitle(undefined, item.relatedIds)
                        ? [{ text: repositorySubtitle(undefined, item.relatedIds) as string }]
                        : []),
                      { icon: { source: Icon.Star, tintColor: Color.Yellow } },
                      ...(item.sandboxCount
                        ? [
                            {
                              tag: `${item.sandboxCount} sandbox${item.sandboxCount === 1 ? "" : "es"}`,
                            },
                          ]
                        : []),
                    ]}
                    icon={item.icon ? { source: item.icon } : undefined}
                    actions={
                      <ActionPanel>
                        {hasLocalProject ? (
                          <Action
                            title={`Open in ${defaultOpenIn.title}`}
                            icon={Icon.Terminal}
                            onAction={async () => {
                              favouriteState.recordSelection(worktree);
                              await openProject(worktree, defaultOpenIn.target);
                            }}
                          />
                        ) : (
                          <Action
                            title="Reload Projects"
                            icon={Icon.ArrowClockwise}
                            shortcut={{ modifiers: ["cmd"], key: "r" }}
                            onAction={refreshProjects}
                          />
                        )}
                        <Action
                          title="Remove from Favorites"
                          icon={Icon.StarDisabled}
                          shortcut={{ modifiers: ["cmd", "shift"], key: "l" }}
                          onAction={() => toggleFavouriteProject(worktree, title)}
                        />
                        <Action
                          title="Project Settings"
                          icon={Icon.Gear}
                          shortcut={{ modifiers: ["cmd", "shift"], key: "," }}
                          onAction={openProjectSettings}
                        />
                      </ActionPanel>
                    }
                  />
                );
              })
            : null}
          {visibleFavourites.map((item) => {
            const title = item.name ?? item.worktree;
            const subtitle = projectSubpathSubtitle(item);
            const itemId = projectListItemId(item);
            const isSelected = selectedProjectId === itemId;
            const showRepositoryRootMarker = isMainRepositoryProject(item, state.items);

            return (
              <ProjectListItem
                key={itemId}
                item={{ ...item, isFavorite: true }}
                listItemId={itemId}
                defaultCloneDirectory={preferences.cloneDirectory}
                showRepositoryRootMarker={showRepositoryRootMarker}
                showPathAccessory={false}
                showSubtitle={Boolean(subtitle)}
                hasLocalProject={item.isCloned}
                includeManagementActions={isSelected}
                subtitle={subtitle}
                accessoryText={projectAccessoryText(item)}
                onOpenProject={async (project) => {
                  favouriteState.recordSelection(project.worktree);
                  await openOrCloneProject(project as StandardProject);
                }}
                onOpenProjectIn={async (project, target) => {
                  favouriteState.recordSelection(project.worktree);
                  await openOrCloneProject(project as StandardProject, target);
                }}
                onOpenProjectNewSession={async (project, target) => {
                  favouriteState.recordSelection(project.worktree);
                  await openOrCloneProject(project as StandardProject, target, { newSession: true });
                }}
                onCloneProject={(project, values) => cloneProjectOnly(project as StandardProject, values)}
                onRefreshProjects={async () => {
                  await refreshProjects({ force: true });
                }}
                onSaveProject={(project, values) => saveProject(project as StandardProject, values)}
                onLoadProjectFormValues={(project) => loadProjectFormValues(project as StandardProject)}
                onLoadIndividualProjectSettings={(project) => loadIndividualProjectSettings(project as StandardProject)}
                onSaveIndividualProjectSettings={(project, values) =>
                  saveIndividualProjectSettings(project as StandardProject, values)
                }
                onLoadProjectSubpathSettings={(project) => loadProjectSubpathSettings(project as StandardProject)}
                onSaveProjectSubpathSettings={(project, values) =>
                  saveProjectSubpathSettings(project as StandardProject, values)
                }
                onAddSubpath={(project, subpath, options) =>
                  addProjectSubpath(project as StandardProject, subpath, options)
                }
                onDeleteProject={(project) => deleteProject(project as StandardProject)}
                onAddProject={addProject}
                remoteUrl={projectBrowserUrl(item)}
                openInTarget={openInTarget}
                supportsNewSessionTarget={supportsNewSessionTarget}
                defaultTerminalTarget={preferences.defaultTerminalTarget}
                defaultIdeTarget={preferences.defaultIdeTarget}
                defaultAiClientTarget={preferences.defaultAiClientTarget}
                defaultDocumentsTarget={preferences.defaultDocumentsTarget}
                defaultGitDiffTarget={preferences.defaultGitDiffTarget}
                onOpenSettings={openProjectSettings}
                projectActionsTarget={isSelected ? projectActionsTarget(item) : undefined}
                deleteProjectTarget={isSelected ? deleteProjectTarget(item) : undefined}
                projectActionItems={[]}
                extraActions={
                  <>
                    {favouriteState.createToggleFavoriteAction(item)}
                    <Action
                      title="Move Favorite up"
                      icon={Icon.ArrowUp}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "arrowUp" }}
                      onAction={() => moveFavouriteProjectUp(item.worktree, title)}
                    />
                    <Action
                      title="Move Favorite Down"
                      icon={Icon.ArrowDown}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "arrowDown" }}
                      onAction={() => moveFavouriteProjectDown(item.worktree, title)}
                    />
                  </>
                }
              />
            );
          })}
          {hasHiddenFavourites ? (
            <ShowMoreProjectsListItem
              shown={visibleFavourites.length}
              total={filteredFavouriteCount}
              onShowMore={() =>
                setFavoriteRenderLimit((currentLimit) => nextProjectRenderLimit(currentLimit, filteredFavouriteCount))
              }
            />
          ) : null}
        </List.Section>
      ) : null}
      {!showUsernameList && visibleNonFavourites.length ? (
        <List.Section
          title={showFavouritesSection ? "Projects" : undefined}
          subtitle={
            showFavouritesSection || hasHiddenNonFavourites
              ? `${visibleNonFavourites.length} of ${filteredNonFavouriteCount}`
              : undefined
          }
        >
          {visibleNonFavourites.map((item) => {
            const subtitle = projectSubpathSubtitle(item);
            const itemId = projectListItemId(item);
            const isSelected = selectedProjectId === itemId;
            const showRepositoryRootMarker = isMainRepositoryProject(item, state.items);

            return (
              <ProjectListItem
                key={itemId}
                item={{ ...item, isFavorite: false }}
                listItemId={itemId}
                defaultCloneDirectory={preferences.cloneDirectory}
                showRepositoryRootMarker={showRepositoryRootMarker}
                showPathAccessory={false}
                showSubtitle={Boolean(subtitle)}
                hasLocalProject={item.isCloned}
                includeManagementActions={isSelected}
                subtitle={subtitle}
                accessoryText={projectAccessoryText(item)}
                onOpenProject={async (project) => {
                  favouriteState.recordSelection(project.worktree);
                  await openOrCloneProject(project as StandardProject);
                }}
                onOpenProjectIn={async (project, target) => {
                  favouriteState.recordSelection(project.worktree);
                  await openOrCloneProject(project as StandardProject, target);
                }}
                onOpenProjectNewSession={async (project, target) => {
                  favouriteState.recordSelection(project.worktree);
                  await openOrCloneProject(project as StandardProject, target, { newSession: true });
                }}
                onCloneProject={(project, values) => cloneProjectOnly(project as StandardProject, values)}
                onRefreshProjects={async () => {
                  await refreshProjects({ force: true });
                }}
                onSaveProject={(project, values) => saveProject(project as StandardProject, values)}
                onLoadProjectFormValues={(project) => loadProjectFormValues(project as StandardProject)}
                onLoadIndividualProjectSettings={(project) => loadIndividualProjectSettings(project as StandardProject)}
                onSaveIndividualProjectSettings={(project, values) =>
                  saveIndividualProjectSettings(project as StandardProject, values)
                }
                onLoadProjectSubpathSettings={(project) => loadProjectSubpathSettings(project as StandardProject)}
                onSaveProjectSubpathSettings={(project, values) =>
                  saveProjectSubpathSettings(project as StandardProject, values)
                }
                onAddSubpath={(project, subpath, options) =>
                  addProjectSubpath(project as StandardProject, subpath, options)
                }
                onDeleteProject={(project) => deleteProject(project as StandardProject)}
                onAddProject={addProject}
                remoteUrl={projectBrowserUrl(item)}
                openInTarget={openInTarget}
                supportsNewSessionTarget={supportsNewSessionTarget}
                defaultTerminalTarget={preferences.defaultTerminalTarget}
                defaultIdeTarget={preferences.defaultIdeTarget}
                defaultAiClientTarget={preferences.defaultAiClientTarget}
                defaultDocumentsTarget={preferences.defaultDocumentsTarget}
                defaultGitDiffTarget={preferences.defaultGitDiffTarget}
                onOpenSettings={openProjectSettings}
                projectActionsTarget={isSelected ? projectActionsTarget(item) : undefined}
                deleteProjectTarget={isSelected ? deleteProjectTarget(item) : undefined}
                projectActionItems={[]}
                extraActions={
                  <>
                    {favouriteState.createToggleFavoriteAction(item)}
                    {favouriteState.createMoveToBottomAction(item)}
                  </>
                }
              />
            );
          })}
          {hasHiddenNonFavourites ? (
            <ShowMoreProjectsListItem
              shown={visibleNonFavourites.length}
              total={filteredNonFavouriteCount}
              onShowMore={() =>
                setNonFavoriteRenderLimit((currentLimit) =>
                  nextProjectRenderLimit(currentLimit, filteredNonFavouriteCount),
                )
              }
            />
          ) : null}
        </List.Section>
      ) : null}
      {!showUsernameList && parsedSearch.remoteOwner ? (
        <ProjectOwnerRepositoryList
          owner={parsedSearch.remoteOwner}
          storedRepositoryUrls={storedRepositoryUrls}
          onAddProject={addProject}
        />
      ) : null}
      {showEmptyProjectsView ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No Projects"
          description="Add a project, import JSON into Turso, or open settings to change the project source."
          actions={
            <ActionPanel>
              <Action
                title="Reload Projects"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={() => refreshProjects({ force: true })}
              />
              <Action
                title="Add New Project"
                icon={Icon.Plus}
                shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
                onAction={() => {
                  push(<AddProjectForm defaultCloneDirectory={preferences.cloneDirectory} onSubmit={addProject} />);
                }}
              />
              <Action
                title="Project Settings"
                icon={Icon.Gear}
                shortcut={{ modifiers: ["cmd", "shift"], key: "," }}
                onAction={openProjectSettings}
              />
            </ActionPanel>
          }
        />
      ) : null}
    </List>
  );
}
