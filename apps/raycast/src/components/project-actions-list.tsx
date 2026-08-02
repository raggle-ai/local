import { Action, ActionPanel, Icon, List, Toast, closeMainWindow, open, showToast } from "@raycast/api";
import { type JSX, useEffect, useMemo, useState } from "react";
import { multiOpenInShortcutForIndex, type OpenInShortcutSetting } from "../config/open-in-apps";
import {
  fallbackGitHubViewerLogin,
  githubPullRequestLookupErrorMessage,
  githubPullRequestForCurrentBranch,
  githubPullRequestsBrowserUrl,
  githubPullRequestsByAuthor,
  githubRepositoryFromUrl,
  githubSearchBrowserUrl,
  githubSearchIssues,
  type GitHubSearchItem,
  type GitHubSearchItemKind,
  githubSearchPullRequests,
  githubSearchPullRequestsAndIssues,
  githubViewerLogin,
  type GitHubRepository,
  remoteToBrowserUrl,
} from "@raggle-ai/local";
import { showMoveFavoriteToast } from "../lib/favorites";
import { useAiChatClientRegistry } from "../hooks/use-ai-chat-clients";
import { defaultOpenInAppItems, defaultOpenInAppLabelsByTarget } from "../lib/default-open-in-apps";
import { syncGitRemoteWithToast } from "../lib/git-sync";
import { type OpenInTarget } from "../lib/open-in";
import {
  browserHostOpenInOptions,
  defaultOpenInOption,
  installedOpenInOptions,
  openInOptionForTarget,
} from "../lib/open-in";
import {
  type ProjectActionPluginDiagnostic,
  loadProjectActionPluginsWithDiagnostics,
} from "../lib/project-action-plugin-loader";
import { type ProjectActionContext, type ProjectActionItem } from "../lib/project-actions";
import { type StandardProjectSnapshotItem } from "../lib/standard-project-cache";
import { DeleteProjectConfirmation } from "./delete-project-confirmation";
import { EnhancedListActionPanel, useEnhancedListFavourites } from "./enhanced-list";

type ProjectGitHubState = {
  loading: boolean;
  login?: string;
  pullRequestAuthors?: string[];
  currentPullRequest?: {
    number: number;
    title: string;
    url: string;
  };
  openPullRequestCount?: number;
  error?: string;
};

type ProjectActionsListProps = {
  item: StandardProjectSnapshotItem;
  projectListFile: string;
  openInTarget: OpenInTarget;
  defaultTerminalTarget?: OpenInTarget;
  defaultIdeTarget?: OpenInTarget;
  defaultAiClientTarget?: OpenInTarget;
  defaultDocumentsTarget?: OpenInTarget;
  defaultGitDiffTarget?: OpenInTarget;
  multiOpenInTargets?: OpenInTarget[];
  multiOpenInShortcuts?: OpenInShortcutSetting[];
  gitPullRequestAuthors?: string[];
  onOpenProject: (project: StandardProjectSnapshotItem) => Promise<void>;
  onOpenProjectIn: (project: StandardProjectSnapshotItem, target: OpenInTarget) => Promise<void>;
  onOpenProjectNewSession: (project: StandardProjectSnapshotItem, target: OpenInTarget) => Promise<void>;
  onDeleteProject?: (project: StandardProjectSnapshotItem) => Promise<boolean>;
};

type ProjectActionItemsListProps = {
  title: string;
  actions: ProjectActionItem[];
};

type GitHubSearchFilter = GitHubSearchItemKind | "all";

type ProjectGitHubSearchListProps = {
  repository: GitHubRepository;
};

function titleFromActionId(action: ProjectActionItem) {
  return action.id
    .split(":")
    .at(-1)
    ?.replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pullRequestAuthorsLabel(authors?: string[]) {
  if (!authors?.length) return undefined;
  if (authors.length === 1) return authors[0];

  return authors.map((author) => `@${author}`).join(", ");
}

export function normalizePluginActionItems(actions: ProjectActionItem[]) {
  const emailSignatureActions = actions.filter((action) => action.id.startsWith("plugin:emailos-config:"));
  if (!emailSignatureActions.length || actions.some((action) => action.id === "plugin:emailos-config")) {
    return actions;
  }

  const emailSignatureActionIds = new Set(emailSignatureActions.map((action) => action.id));
  const groupedEmailSignatureAction: ProjectActionItem = {
    id: "plugin:emailos-config",
    title: "Insert Email Signature",
    subtitle: `Choose from ${emailSignatureActions.length} signature${emailSignatureActions.length === 1 ? "" : "s"}`,
    icon: Icon.Envelope,
    section: "custom",
    childActions: emailSignatureActions.map((action) => ({
      ...action,
      title: titleFromActionId(action) ?? action.title,
      subtitle: action.title,
    })),
  };

  const normalizedActions: ProjectActionItem[] = [];
  let insertedEmailSignatureAction = false;

  for (const action of actions) {
    if (emailSignatureActionIds.has(action.id)) {
      if (!insertedEmailSignatureAction) {
        normalizedActions.push(groupedEmailSignatureAction);
        insertedEmailSignatureAction = true;
      }
      continue;
    }

    normalizedActions.push(action);
  }

  return normalizedActions;
}

export function ProjectActionItemsList({ title, actions }: ProjectActionItemsListProps) {
  function renderActionItem(action: ProjectActionItem): JSX.Element {
    const childActions = action.childActions ?? [];
    const hasChildActions = childActions.length > 0;
    const pushTarget = action.pushTarget;

    return (
      <List.Item
        key={action.id}
        title={action.title}
        subtitle={action.subtitle}
        icon={action.icon ?? undefined}
        accessories={action.accessories}
        actions={
          <ActionPanel>
            {pushTarget ? (
              <Action.Push title={action.title} icon={action.icon ?? undefined} target={pushTarget} />
            ) : hasChildActions ? (
              <Action.Push
                title={action.title}
                icon={action.icon ?? undefined}
                target={<ProjectActionItemsList title={action.title} actions={childActions} />}
              />
            ) : action.onAction ? (
              <Action title={action.title} icon={action.icon ?? undefined} onAction={action.onAction} />
            ) : null}
            {action.extraActions}
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List navigationTitle={title}>
      <List.Section title={title} subtitle={String(actions.length)}>
        {actions.map((action) => renderActionItem(action))}
      </List.Section>
    </List>
  );
}

function githubSearchItemIcon(item: GitHubSearchItem) {
  if (item.kind === "pull-request") return item.isDraft ? Icon.CircleProgress50 : Icon.Bubble;

  return Icon.Circle;
}

function githubSearchItemKindLabel(kind: GitHubSearchItemKind) {
  return kind === "pull-request" ? "PR" : "Issue";
}

function githubSearchItemUpdatedAt(item: GitHubSearchItem) {
  if (!item.updatedAt) return undefined;

  return new Date(item.updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function ProjectGitHubSearchList({ repository }: ProjectGitHubSearchListProps) {
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<GitHubSearchFilter>("all");
  const [items, setItems] = useState<GitHubSearchItem[]>([]);
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      setIsLoading(true);
      setError(undefined);

      try {
        const results =
          filter === "pull-request"
            ? await githubSearchPullRequests(repository, searchText)
            : filter === "issue"
              ? await githubSearchIssues(repository, searchText)
              : await githubSearchPullRequestsAndIssues(repository, searchText);

        if (cancelled) return;
        setItems(results);
      } catch (error) {
        if (cancelled) return;
        setError(error instanceof Error ? error.message : String(error));
        setItems([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    const timeout = setTimeout(() => {
      void loadItems();
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [filter, repository, searchText]);

  const browserSearchUrl = githubSearchBrowserUrl(repository, searchText, filter);

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`${repository.owner}/${repository.repo}`}
      searchBarPlaceholder="Search open pull requests and issues"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter" value={filter} onChange={(value) => setFilter(value as GitHubSearchFilter)}>
          <List.Dropdown.Item title="Pull Requests and Issues" value="all" />
          <List.Dropdown.Item title="Pull Requests" value="pull-request" />
          <List.Dropdown.Item title="Issues" value="issue" />
        </List.Dropdown>
      }
    >
      {error ? (
        <List.EmptyView
          title="GitHub search failed"
          description={error}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open Search in GitHub" url={browserSearchUrl} icon={Icon.Globe} />
              <Action.CopyToClipboard title="Copy Error" content={error} />
            </ActionPanel>
          }
        />
      ) : null}
      {!error && !items.length && !isLoading ? (
        <List.EmptyView
          title="No open items found"
          description={searchText ? `No results match "${searchText}"` : "No open pull requests or issues found"}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open Search in GitHub" url={browserSearchUrl} icon={Icon.Globe} />
            </ActionPanel>
          }
        />
      ) : null}
      <List.Section title="Open Items" subtitle={String(items.length)}>
        {items.map((item) => (
          <List.Item
            key={`${item.kind}:${item.number}`}
            title={item.title}
            subtitle={item.author?.login}
            icon={githubSearchItemIcon(item)}
            accessories={[
              { tag: `${githubSearchItemKindLabel(item.kind)} #${item.number}` },
              ...(item.isDraft ? [{ tag: "Draft" }] : []),
              ...(item.updatedAt ? [{ text: githubSearchItemUpdatedAt(item) }] : []),
            ]}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser
                  title={`Open ${githubSearchItemKindLabel(item.kind)} in GitHub`}
                  url={item.url}
                  icon={Icon.Globe}
                />
                <Action.CopyToClipboard title="Copy URL" content={item.url} />
                <Action.OpenInBrowser
                  title="Open Search in GitHub"
                  url={browserSearchUrl}
                  icon={Icon.MagnifyingGlass}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

export function ProjectActionsList(props: ProjectActionsListProps) {
  const {
    item,
    projectListFile,
    openInTarget,
    defaultTerminalTarget,
    defaultIdeTarget,
    defaultAiClientTarget,
    defaultDocumentsTarget,
    defaultGitDiffTarget,
    multiOpenInTargets = [],
    multiOpenInShortcuts,
    gitPullRequestAuthors = [],
    onOpenProject,
    onOpenProjectIn,
    onOpenProjectNewSession,
    onDeleteProject,
  } = props;
  const hasLocalProject = item.isCloned;
  const defaultOpenIn = defaultOpenInOption(openInTarget);
  const defaultAppItems = defaultOpenInAppItems({
    defaultTerminalTarget,
    defaultIdeTarget,
    defaultAiClientTarget,
    defaultDocumentsTarget,
    defaultGitDiffTarget,
  });
  const defaultAppOpenIns = defaultAppItems.map((item) => item.option);
  const installedOpenIns = installedOpenInOptions();
  const browserUrl = item.browserUrl ?? remoteToBrowserUrl(item.remoteUrl);
  const browserHostOpenIns = browserHostOpenInOptions(browserUrl);
  const shortcutSettings = multiOpenInShortcuts?.length
    ? multiOpenInShortcuts
    : multiOpenInTargets
        .map((target, index) => {
          const shortcut = multiOpenInShortcutForIndex(index);
          return shortcut ? { target, shortcut } : undefined;
        })
        .filter((item): item is OpenInShortcutSetting => Boolean(item));
  const multiOpenIns = shortcutSettings.map((item) => openInOptionForTarget(item.target));
  const shortcutByTarget = new Map(shortcutSettings.map((item) => [item.target, item.shortcut]));
  for (const defaultApp of defaultAppItems) {
    shortcutByTarget.set(defaultApp.target, defaultApp.shortcut);
  }
  const defaultAppLabelsByTarget = defaultOpenInAppLabelsByTarget(defaultAppItems);
  const orderedOpenIns = [
    defaultOpenIn,
    ...defaultAppOpenIns.filter((option) => option.target !== defaultOpenIn.target),
    ...multiOpenIns.filter((option) => option.target !== defaultOpenIn.target),
    ...installedOpenIns.filter((option) => option.target !== defaultOpenIn.target),
    ...browserHostOpenIns.filter(
      (option) =>
        option.target !== defaultOpenIn.target && !installedOpenIns.some((item) => item.target === option.target),
    ),
  ].filter((option, index, options) => options.findIndex((item) => item.target === option.target) === index);
  const githubRepository = useMemo(
    () => githubRepositoryFromUrl(item.browserUrl ?? item.remoteUrl),
    [item.browserUrl, item.remoteUrl],
  );
  const gitPullRequestAuthorsKey = gitPullRequestAuthors.join("\n");
  const [gitHubState, setGitHubState] = useState<ProjectGitHubState>({ loading: Boolean(githubRepository) });
  const [customActionItems, setCustomActionItems] = useState<ProjectActionItem[]>([]);
  const [pluginDiagnostics, setPluginDiagnostics] = useState<ProjectActionPluginDiagnostic[]>([]);
  const { supportsNewSession } = useAiChatClientRegistry();

  useEffect(() => {
    if (!githubRepository) {
      setGitHubState({ loading: false });
      return;
    }

    const repository = githubRepository;
    const configuredPullRequestAuthors = gitPullRequestAuthorsKey.split("\n").filter(Boolean);
    let cancelled = false;

    async function loadGitHubState() {
      const currentPullRequestPromise = hasLocalProject
        ? githubPullRequestForCurrentBranch(repository, item.worktree)
        : Promise.resolve(undefined);

      try {
        const login = await githubViewerLogin();
        const pullRequestAuthors = configuredPullRequestAuthors.length ? configuredPullRequestAuthors : [login];
        const [pullRequests, currentPullRequest] = await Promise.all([
          Promise.all(pullRequestAuthors.map((author) => githubPullRequestsByAuthor(repository, author))),
          currentPullRequestPromise,
        ]);
        if (cancelled) return;

        setGitHubState({
          loading: false,
          login,
          pullRequestAuthors,
          currentPullRequest,
          openPullRequestCount: pullRequests.reduce(
            (total, authorPullRequests) => total + authorPullRequests.length,
            0,
          ),
        });
      } catch (error) {
        const currentPullRequest = await currentPullRequestPromise;
        const fallbackLogin = await fallbackGitHubViewerLogin(item.worktree);
        const pullRequestAuthors = configuredPullRequestAuthors.length
          ? configuredPullRequestAuthors
          : fallbackLogin
            ? [fallbackLogin]
            : [];
        if (cancelled) return;

        if (fallbackLogin) {
          setGitHubState({
            loading: false,
            login: fallbackLogin,
            pullRequestAuthors,
            currentPullRequest,
            error: githubPullRequestLookupErrorMessage(error),
          });
          return;
        }

        setGitHubState({
          loading: false,
          pullRequestAuthors,
          currentPullRequest,
          error: githubPullRequestLookupErrorMessage(error),
        });
      }
    }

    void loadGitHubState();

    return () => {
      cancelled = true;
    };
  }, [githubRepository, hasLocalProject, item.worktree, gitPullRequestAuthorsKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectActions() {
      try {
        const context: ProjectActionContext = {
          project: item,
          name: item.name ?? item.worktree,
          folderPath: item.worktree,
          hasLocalProject,
          browserUrl: item.browserUrl,
          remoteUrl: item.remoteUrl,
          githubRepository,
        };
        const result = await loadProjectActionPluginsWithDiagnostics(item.plugins, context, projectListFile);
        if (cancelled) return;

        setCustomActionItems(normalizePluginActionItems(result.actions));
        setPluginDiagnostics(result.diagnostics);
      } catch (error) {
        if (cancelled) return;

        const errorMessage = error instanceof Error ? error.message : String(error);

        setCustomActionItems([
          {
            id: "custom:project-actions-load-error",
            title: "Project Actions Failed to Load",
            subtitle: errorMessage,
            icon: Icon.Warning,
            section: "custom",
            onAction: async () => {
              await showToast({
                style: Toast.Style.Failure,
                title: "Project actions failed to load",
                message: errorMessage,
              });
            },
            extraActions: <Action.CopyToClipboard title="Copy Error" content={errorMessage} />,
          },
        ]);
        setPluginDiagnostics([]);
      }
    }

    void loadProjectActions();

    return () => {
      cancelled = true;
    };
  }, [githubRepository, hasLocalProject, item, projectListFile]);

  async function openMyPullRequests() {
    if (!githubRepository) {
      await showToast({
        style: Toast.Style.Failure,
        title: "GitHub repo not available",
        message: "This project does not have a GitHub remote.",
      });
      return;
    }

    const url = githubPullRequestsBrowserUrl(githubRepository, gitHubState.pullRequestAuthors);
    await closeMainWindow().catch(() => undefined);
    await open(url);
  }

  async function openCurrentPullRequest() {
    if (!githubRepository) {
      await showToast({
        style: Toast.Style.Failure,
        title: "GitHub repo not available",
        message: "This project does not have a GitHub remote.",
      });
      return;
    }

    const currentPullRequest =
      gitHubState.currentPullRequest ?? (await githubPullRequestForCurrentBranch(githubRepository, item.worktree));

    if (!currentPullRequest) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Pull request not found",
        message: "No open pull request was found for this project's current branch.",
      });
      return;
    }

    await closeMainWindow().catch(() => undefined);
    await open(currentPullRequest.url);
  }

  const pluginDiagnosticsAction = useMemo<ProjectActionItem | undefined>(() => {
    if (!pluginDiagnostics.length) return undefined;

    const actionCount = pluginDiagnostics.reduce((total, diagnostic) => total + diagnostic.actionCount, 0);
    const errorCount = pluginDiagnostics.filter((diagnostic) => diagnostic.error).length;
    const diagnosticsText = JSON.stringify(pluginDiagnostics, null, 2);

    return {
      id: "custom:project-plugin-diagnostics",
      title: "Show Plugin Diagnostics",
      subtitle: errorCount
        ? `${actionCount} actions, ${errorCount} plugin errors`
        : `${actionCount} actions from ${pluginDiagnostics.length} plugin source${pluginDiagnostics.length === 1 ? "" : "s"}`,
      icon: errorCount ? Icon.Warning : Icon.Info,
      section: "custom",
      accessories: [{ tag: String(actionCount) }],
      onAction: async () => {
        await showToast({
          style: errorCount ? Toast.Style.Failure : Toast.Style.Success,
          title: "Project plugin diagnostics",
          message: errorCount ? `${errorCount} plugin errors` : `${actionCount} actions loaded`,
        });
      },
      extraActions: <Action.CopyToClipboard title="Copy Plugin Diagnostics" content={diagnosticsText} />,
    };
  }, [pluginDiagnostics]);

  const actionItems: ProjectActionItem[] = [
    ...orderedOpenIns.map((option, index) => ({
      id: `open-in:${option.target}`,
      title: `Open in ${option.title}`,
      icon: option.icon,
      section: "open-in" as const,
      accessories: [
        ...(index === 0 ? [{ tag: "Default" }] : []),
        ...(defaultAppLabelsByTarget.get(option.target) ?? []).map((label) => ({ tag: label })),
      ],
      shortcut: shortcutByTarget.get(option.target),
      onAction: async () => {
        await onOpenProjectIn(item, option.target);
      },
      extraActions: (
        <>
          <Action
            title={hasLocalProject ? `Open in ${defaultOpenIn.title}` : `Clone and Open in ${defaultOpenIn.title}`}
            icon={defaultOpenIn.icon}
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onAction={async () => {
              await onOpenProject(item);
            }}
          />
          {supportsNewSession(option.target) ? (
            <Action
              title={`Open New Session in ${option.title}`}
              icon={Icon.Plus}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
              onAction={async () => {
                await onOpenProjectNewSession(item, option.target);
              }}
            />
          ) : null}
        </>
      ),
    })),
    ...(hasLocalProject
      ? [
          {
            id: "repository:open-default-app",
            title: "Open Folder in Default App",
            icon: Icon.AppWindow,
            section: "repository" as const,
            onAction: async () => {
              await open(item.worktree);
            },
            extraActions: <Action.Open title="Open Folder in Finder" target={item.worktree} icon={Icon.Finder} />,
          },
          {
            id: "repository:open-finder",
            title: "Open Folder in Finder",
            icon: Icon.Finder,
            section: "repository" as const,
            onAction: async () => {
              await open(item.worktree);
            },
            extraActions: (
              <Action.Open title="Open Folder in Default App" target={item.worktree} icon={Icon.AppWindow} />
            ),
          },
          {
            id: "repository:sync-remote",
            title: "Sync Remote",
            subtitle: "Fast-forward the current branch from its Git remote",
            icon: Icon.ArrowClockwise,
            section: "repository" as const,
            shortcut: { modifiers: ["cmd", "shift"], key: "b" } as ProjectActionItem["shortcut"],
            onAction: () => syncGitRemoteWithToast(item.repositoryRoot),
          },
        ]
      : []),
    ...(item.browserUrl
      ? [
          {
            id: "repository:open-github",
            title: "Open Repository in GitHub",
            subtitle: item.browserUrl,
            icon: Icon.Globe,
            section: "repository" as const,
            onAction: async () => {
              await closeMainWindow().catch(() => undefined);
              await open(item.browserUrl as string);
            },
          },
        ]
      : []),
    ...(githubRepository
      ? [
          ...(hasLocalProject
            ? [
                {
                  id: "repository:view-current-pull-request",
                  title: "View Pull Request",
                  subtitle: gitHubState.currentPullRequest
                    ? `#${gitHubState.currentPullRequest.number} ${gitHubState.currentPullRequest.title}`
                    : "Open the pull request for the current branch",
                  icon: Icon.Bubble,
                  section: "repository" as const,
                  accessories: gitHubState.currentPullRequest
                    ? [{ tag: `#${gitHubState.currentPullRequest.number}` }]
                    : undefined,
                  onAction: openCurrentPullRequest,
                  extraActions: (
                    <Action.OpenInBrowser
                      title="Open Repository in GitHub"
                      url={githubRepository.browserUrl}
                      icon={Icon.Globe}
                    />
                  ),
                },
              ]
            : []),
          {
            id: "repository:view-my-pull-requests",
            title: "View My Pull Requests",
            subtitle: gitHubState.error
              ? gitHubState.pullRequestAuthors?.length
                ? `Filtering by ${pullRequestAuthorsLabel(gitHubState.pullRequestAuthors)}. ${gitHubState.error}`
                : `${gitHubState.error} Opening all repo pull requests instead.`
              : gitHubState.pullRequestAuthors?.length
                ? `${gitHubState.openPullRequestCount ?? 0} open pull requests by ${pullRequestAuthorsLabel(gitHubState.pullRequestAuthors)}`
                : "Load pull requests for the current GitHub account",
            icon: Icon.TwoPeople,
            section: "repository" as const,
            accessories:
              gitHubState.openPullRequestCount === undefined || gitHubState.error
                ? undefined
                : [{ tag: String(gitHubState.openPullRequestCount) }],
            onAction: openMyPullRequests,
            extraActions: (
              <Action.OpenInBrowser
                title="Open Repository in GitHub"
                url={githubRepository.browserUrl}
                icon={Icon.Globe}
              />
            ),
          },
          {
            id: "repository:search-github-pull-requests-and-issues",
            title: "Search Pull Requests and Issues",
            subtitle: `Search open items in ${githubRepository.owner}/${githubRepository.repo}`,
            icon: Icon.MagnifyingGlass,
            section: "repository" as const,
            pushTarget: <ProjectGitHubSearchList repository={githubRepository} />,
            extraActions: (
              <Action.OpenInBrowser
                title="Open Repository in GitHub"
                url={githubRepository.browserUrl}
                icon={Icon.Globe}
              />
            ),
          },
        ]
      : []),
    ...customActionItems,
    ...(onDeleteProject
      ? [
          {
            id: "repository:delete-project",
            title: "Delete Project",
            subtitle: item.remoteUrl,
            icon: Icon.Trash,
            section: "repository" as const,
            pushTarget: <DeleteProjectConfirmation item={item} onDeleteProject={onDeleteProject} />,
            extraActions: <Action.CopyToClipboard title="Copy Repository URL" content={item.remoteUrl} />,
          },
        ]
      : []),
    ...(pluginDiagnosticsAction ? [pluginDiagnosticsAction] : []),
  ];

  const favouriteState = useEnhancedListFavourites(actionItems, {
    storageKey: "project-actions-favorites",
    getItemKey: (action) => action.id,
  });

  function moveFavouriteActionUp(action: ProjectActionItem) {
    if (!favouriteState.moveFavouriteUp(action.id)) return;
    showMoveFavoriteToast(action.title, "up");
  }

  function moveFavouriteActionDown(action: ProjectActionItem) {
    if (!favouriteState.moveFavouriteDown(action.id)) return;
    showMoveFavoriteToast(action.title, "down");
  }

  function renderActionItem(action: ProjectActionItem, includeReorderActions = false) {
    const childActions = action.childActions ?? [];
    const hasChildActions = childActions.length > 0;
    const pushTarget = action.pushTarget;

    return (
      <List.Item
        key={action.id}
        title={action.title}
        subtitle={action.subtitle}
        icon={action.icon ?? undefined}
        accessories={action.accessories}
        actions={
          <EnhancedListActionPanel
            onSelect={
              pushTarget ? (
                <Action.Push
                  title={action.title}
                  icon={action.icon ?? undefined}
                  target={pushTarget}
                  onPush={() => {
                    favouriteState.recordSelection(action.id);
                  }}
                />
              ) : hasChildActions ? (
                <Action.Push
                  title={action.title}
                  icon={action.icon ?? undefined}
                  target={<ProjectActionItemsList title={action.title} actions={childActions} />}
                  onPush={() => {
                    favouriteState.recordSelection(action.id);
                  }}
                />
              ) : action.onAction ? (
                <Action
                  title={action.title}
                  icon={action.icon ?? undefined}
                  onAction={async () => {
                    favouriteState.recordSelection(action.id);
                    await action.onAction?.();
                  }}
                />
              ) : null
            }
          >
            {favouriteState.createToggleFavoriteAction(action)}
            {!includeReorderActions ? favouriteState.createMoveToBottomAction(action) : null}
            {action.shortcut && action.onAction ? (
              <Action
                title={action.title}
                icon={action.icon ?? undefined}
                shortcut={action.shortcut}
                onAction={async () => {
                  favouriteState.recordSelection(action.id);
                  await action.onAction?.();
                }}
              />
            ) : null}
            {includeReorderActions ? (
              <>
                <Action
                  title="Move Favorite up"
                  icon={Icon.ArrowUp}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "arrowUp" }}
                  onAction={() => moveFavouriteActionUp(action)}
                />
                <Action
                  title="Move Favorite Down"
                  icon={Icon.ArrowDown}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "arrowDown" }}
                  onAction={() => moveFavouriteActionDown(action)}
                />
              </>
            ) : null}
            {action.extraActions}
          </EnhancedListActionPanel>
        }
      />
    );
  }

  const favouriteActions = favouriteState.orderedFavourites;
  const openInActions = favouriteState.nonFavourites.filter((action) => action.section === "open-in");
  const repositoryActions = favouriteState.nonFavourites.filter((action) => action.section === "repository");
  const customActions = favouriteState.nonFavourites.filter((action) => action.section === "custom");

  const projectTitle = item.name ?? item.worktree;

  return (
    <List navigationTitle={`${projectTitle} Actions`}>
      {/* Project header - always visible at the top */}
      <List.Section title={projectTitle} />

      {/* Favorites section - below the project title */}
      {favouriteActions.length > 0 ? (
        <List.Section title="Favorites" subtitle={String(favouriteActions.length)}>
          {favouriteActions.map((action) => renderActionItem(action, true))}
        </List.Section>
      ) : null}

      {openInActions.length ? (
        <List.Section title="Open In" subtitle={String(openInActions.length)}>
          {openInActions.map((action) => renderActionItem(action))}
        </List.Section>
      ) : null}
      {repositoryActions.length ? (
        <List.Section title="Repository" subtitle={githubRepository ? "GitHub" : undefined}>
          {repositoryActions.map((action) => renderActionItem(action))}
        </List.Section>
      ) : null}
      {customActions.length ? (
        <List.Section title="Custom" subtitle={String(customActions.length)}>
          {customActions.map((action) => renderActionItem(action))}
        </List.Section>
      ) : null}
    </List>
  );
}
