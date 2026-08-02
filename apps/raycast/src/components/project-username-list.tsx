import { Action, ActionPanel, Icon, Image, List } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { githubSearchUsers, type GitHubUserSearchItem } from "@raggle-ai/local";

export type ProjectUsernameListItem = {
  username: string;
  projectCount: number;
  browserUrl: string;
  avatarUrl?: string;
};

type GitHubUsernameSearchState = {
  items: GitHubUserSearchItem[];
  isLoading: boolean;
  error?: string;
};

type ProjectUsernameListProps = {
  items: ProjectUsernameListItem[];
  query: string;
  onSelectUsername: (username: string) => void;
  onRefreshProjects: () => void;
  onOpenSettings: () => void;
};

export function ProjectUsernameList({
  items,
  query,
  onSelectUsername,
  onRefreshProjects,
  onOpenSettings,
}: ProjectUsernameListProps) {
  const [githubState, setGithubState] = useState<GitHubUsernameSearchState>({ items: [], isLoading: Boolean(query) });

  useEffect(() => {
    const trimmedQuery = query.trim();
    let cancelled = false;

    if (!trimmedQuery) {
      setGithubState({ items: [], isLoading: false });
      return;
    }

    setGithubState((state) => ({ ...state, isLoading: true, error: undefined }));

    const timeout = setTimeout(() => {
      async function loadGitHubUsers() {
        try {
          const results = await githubSearchUsers(trimmedQuery);

          if (cancelled) return;
          setGithubState({ items: results, isLoading: false });
        } catch (error) {
          if (cancelled) return;
          setGithubState({
            items: [],
            isLoading: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      void loadGitHubUsers();
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  const storedUsernames = useMemo(() => new Set(items.map((item) => item.username.toLowerCase())), [items]);
  const githubItems = useMemo(
    () => githubState.items.filter((item) => !storedUsernames.has(item.username.toLowerCase())),
    [githubState.items, storedUsernames],
  );
  const hasGitHubSearch = Boolean(query.trim());

  if (!items.length && !githubItems.length && !githubState.isLoading && !githubState.error) {
    return (
      <List.EmptyView
        icon={Icon.Person}
        title="No GitHub Owners"
        description={
          query ? `No usernames or organizations match @${query}.` : "No GitHub usernames or organizations found."
        }
        actions={
          <ActionPanel>
            <Action
              title="Reload Projects"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              onAction={onRefreshProjects}
            />
            <Action
              title="Project Settings"
              icon={Icon.Gear}
              shortcut={{ modifiers: ["cmd", "shift"], key: "," }}
              onAction={onOpenSettings}
            />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <>
      {items.length ? (
        <List.Section
          title="Stored GitHub Owners"
          subtitle={`${items.length} ${items.length === 1 ? "match" : "matches"}`}
        >
          {items.map((item) => (
            <List.Item
              key={item.username}
              id={`username:${item.username}`}
              title={`@${item.username}`}
              icon={
                item.avatarUrl
                  ? { source: item.avatarUrl, fallback: Icon.Person, mask: Image.Mask.Circle }
                  : Icon.Person
              }
              accessories={[{ text: `${item.projectCount} ${item.projectCount === 1 ? "project" : "projects"}` }]}
              actions={
                <ProjectUsernameActions
                  username={item.username}
                  browserUrl={item.browserUrl}
                  onSelectUsername={onSelectUsername}
                  onRefreshProjects={onRefreshProjects}
                  onOpenSettings={onOpenSettings}
                />
              }
            />
          ))}
        </List.Section>
      ) : null}
      {hasGitHubSearch ? (
        <List.Section
          title="GitHub Search"
          subtitle={
            githubState.isLoading
              ? "Searching"
              : githubState.error
                ? "Unavailable"
                : `${githubItems.length} ${githubItems.length === 1 ? "match" : "matches"}`
          }
        >
          {githubState.error ? (
            <List.Item
              icon={Icon.Warning}
              title="GitHub search failed"
              subtitle={githubState.error}
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser
                    title="Search GitHub in Browser"
                    icon={Icon.Globe}
                    url={`https://github.com/search?q=${encodeURIComponent(`${query.trim()} in:login`)}&type=users`}
                  />
                </ActionPanel>
              }
            />
          ) : null}
          {!githubState.error && !githubState.isLoading && !githubItems.length ? (
            <List.Item icon={Icon.MagnifyingGlass} title="No GitHub users found" />
          ) : null}
          {githubItems.map((item) => (
            <List.Item
              key={item.username}
              id={`github-username:${item.username}`}
              title={`@${item.username}`}
              icon={
                item.avatarUrl
                  ? { source: item.avatarUrl, fallback: Icon.Person, mask: Image.Mask.Circle }
                  : Icon.Person
              }
              accessories={[{ tag: item.kind }]}
              actions={
                <ProjectUsernameActions
                  username={item.username}
                  browserUrl={item.browserUrl}
                  onSelectUsername={onSelectUsername}
                  onRefreshProjects={onRefreshProjects}
                  onOpenSettings={onOpenSettings}
                />
              }
            />
          ))}
        </List.Section>
      ) : null}
    </>
  );
}

type ProjectUsernameActionsProps = {
  username: string;
  browserUrl: string;
  onSelectUsername: (username: string) => void;
  onRefreshProjects: () => void;
  onOpenSettings: () => void;
};

function ProjectUsernameActions({
  username,
  browserUrl,
  onSelectUsername,
  onRefreshProjects,
  onOpenSettings,
}: ProjectUsernameActionsProps) {
  return (
    <ActionPanel>
      <Action
        title="Show Projects from Owner"
        icon={Icon.MagnifyingGlass}
        onAction={() => onSelectUsername(username)}
      />
      <Action.OpenInBrowser
        title="Open Owner in GitHub"
        url={browserUrl}
        shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
      />
      <Action.CopyToClipboard title="Copy Owner" content={username} />
      <Action
        title="Reload Projects"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={onRefreshProjects}
      />
      <Action
        title="Project Settings"
        icon={Icon.Gear}
        shortcut={{ modifiers: ["cmd", "shift"], key: "," }}
        onAction={onOpenSettings}
      />
    </ActionPanel>
  );
}
