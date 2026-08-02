import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import {
  type AddProjectValues,
  githubSearchOwnerRepositories,
  type GitHubRepositorySearchItem,
} from "@raggle-ai/local";

type ProjectOwnerRepositorySearchState = {
  items: GitHubRepositorySearchItem[];
  isLoading: boolean;
  error?: string;
};

type ProjectOwnerRepositoryListProps = {
  owner: string;
  storedRepositoryUrls: Set<string>;
  onAddProject: (values: AddProjectValues) => Promise<boolean>;
};

function repositoryUpdatedAt(item: GitHubRepositorySearchItem) {
  if (!item.updatedAt) return undefined;

  return new Date(item.updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ProjectOwnerRepositoryList({
  owner,
  storedRepositoryUrls,
  onAddProject,
}: ProjectOwnerRepositoryListProps) {
  const [githubState, setGithubState] = useState<ProjectOwnerRepositorySearchState>({
    items: [],
    isLoading: Boolean(owner),
  });

  useEffect(() => {
    const trimmedOwner = owner.trim();
    let cancelled = false;

    if (!trimmedOwner) {
      setGithubState({ items: [], isLoading: false });
      return;
    }

    setGithubState((state) => ({ ...state, isLoading: true, error: undefined }));

    async function loadGitHubRepositories() {
      try {
        const results = await githubSearchOwnerRepositories(trimmedOwner);

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

    void loadGitHubRepositories();

    return () => {
      cancelled = true;
    };
  }, [owner]);

  const githubItems = useMemo(
    () => githubState.items.filter((item) => !storedRepositoryUrls.has(item.browserUrl.toLowerCase())),
    [githubState.items, storedRepositoryUrls],
  );

  if (!owner.trim()) return null;

  return (
    <List.Section
      title="GitHub Repositories"
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
          title="GitHub repository search failed"
          subtitle={githubState.error}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Search GitHub in Browser"
                icon={Icon.Globe}
                url={`https://github.com/search?q=${encodeURIComponent(`user:${owner} fork:true`)}&type=repositories&s=updated&o=desc`}
              />
            </ActionPanel>
          }
        />
      ) : null}
      {!githubState.error && !githubState.isLoading && !githubItems.length ? (
        <List.Item icon={Icon.MagnifyingGlass} title="No additional repositories found" />
      ) : null}
      {githubItems.map((item) => {
        const updatedAt = repositoryUpdatedAt(item);

        return (
          <List.Item
            key={item.fullName}
            id={`github-repository:${item.fullName}`}
            title={item.name}
            subtitle={item.description}
            icon={Icon.Code}
            accessories={[
              ...(updatedAt ? [{ text: updatedAt, tooltip: `Updated ${updatedAt}` }] : []),
              ...(item.isPrivate ? [{ tag: "Private" }] : []),
              ...(item.isFork ? [{ tag: "Fork" }] : []),
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Add Repository"
                  icon={Icon.Plus}
                  onAction={async () => {
                    await onAddProject({
                      url: item.browserUrl,
                      name: "",
                      description: item.description ?? "",
                      tags: "",
                      folders: [],
                      subpaths: "",
                    });
                  }}
                />
                <Action.OpenInBrowser
                  title="Open Repository in GitHub"
                  url={item.browserUrl}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                />
                <Action.CopyToClipboard title="Copy Repository URL" content={item.browserUrl} />
              </ActionPanel>
            }
          />
        );
      })}
    </List.Section>
  );
}
