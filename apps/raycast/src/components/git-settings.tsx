import {
  Action,
  ActionPanel,
  Form,
  Icon,
  Image,
  Toast,
  openExtensionPreferences,
  showToast,
  useNavigation,
} from "@raycast/api";
import { githubAuthenticatedAccounts, type GitHubAuthenticatedAccount } from "@raggle-ai/local";
import { useEffect, useState } from "react";

import type { StandardProjectsSettings } from "../lib/config";

type GitSettingsFormProps<TSettings extends StandardProjectsSettings> = {
  settings: TSettings;
  onSave: (settings: TSettings) => Promise<void>;
};

function normalizeGitHubUsers(input: string) {
  return [
    ...new Set(
      input
        .split(/[\s,]+/)
        .map((value) => value.trim().replace(/^@/, ""))
        .filter(Boolean),
    ),
  ];
}

export function gitPullRequestAuthorsSummary(settings: Pick<StandardProjectsSettings, "gitPullRequestAuthors">) {
  if (!settings.gitPullRequestAuthors?.length) return "Current GitHub user";

  return settings.gitPullRequestAuthors.map((author) => `@${author}`).join(", ");
}

export function gitSettingsSummary(
  settings: Pick<StandardProjectsSettings, "gitCloneAccount" | "gitPullRequestAuthors">,
) {
  const cloneAccount = settings.gitCloneAccount ? `Clone @${settings.gitCloneAccount}` : "Clone active account";
  return `${cloneAccount} / PRs ${gitPullRequestAuthorsSummary(settings)}`;
}

export function GitSettingsForm<TSettings extends StandardProjectsSettings>({
  settings,
  onSave,
}: GitSettingsFormProps<TSettings>) {
  const { pop } = useNavigation();
  const [authenticatedAccounts, setAuthenticatedAccounts] = useState<GitHubAuthenticatedAccount[]>([]);
  const [gitCloneAccount, setGitCloneAccount] = useState(settings.gitCloneAccount ?? "");
  const [gitPullRequestAuthors, setGitPullRequestAuthors] = useState<string[]>(settings.gitPullRequestAuthors ?? []);
  const [newGitHubUsers, setNewGitHubUsers] = useState("");
  const authenticatedUsernames = authenticatedAccounts.map((account) => account.username);
  const activeAuthenticatedUsername = authenticatedAccounts.find((account) => account.active)?.username;
  const authorOptions = [
    ...authenticatedUsernames,
    ...gitPullRequestAuthors,
    ...normalizeGitHubUsers(newGitHubUsers),
  ].filter((value, index, values) => values.indexOf(value) === index);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthenticatedAccounts() {
      try {
        const accounts = await githubAuthenticatedAccounts();
        if (!cancelled) setAuthenticatedAccounts(accounts);
      } catch {
        if (!cancelled) setAuthenticatedAccounts([]);
      }
    }

    void loadAuthenticatedAccounts();

    return () => {
      cancelled = true;
    };
  }, []);

  async function addGitHubUsers() {
    const nextUsers = normalizeGitHubUsers(newGitHubUsers);
    if (!nextUsers.length) return;

    setGitPullRequestAuthors([...new Set([...gitPullRequestAuthors, ...nextUsers])]);
    setNewGitHubUsers("");
  }

  async function handleSubmit() {
    await onSave({
      ...settings,
      gitCloneAccount: gitCloneAccount || undefined,
      gitPullRequestAuthors,
    });
    await showToast({ style: Toast.Style.Success, title: "Git settings saved" });
    pop();
  }

  return (
    <Form
      navigationTitle="Git"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Git Settings" icon={Icon.Check} onSubmit={handleSubmit} />
          <Action
            title="Add GitHub Users"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            onAction={addGitHubUsers}
          />
          <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="gitCloneAccount"
        title="Clone Account"
        value={gitCloneAccount}
        onChange={setGitCloneAccount}
        info="When set, cloning switches GitHub CLI to this account before cloning GitHub repositories."
      >
        <Form.Dropdown.Item value="" title="Use Active GitHub Account" icon={Icon.Person} />
        {authenticatedAccounts.map((account) => (
          <Form.Dropdown.Item
            key={account.username}
            value={account.username}
            title={`@${account.username}${account.active ? " (active)" : ""}`}
            icon={gitHubUserIcon(account.username)}
          />
        ))}
      </Form.Dropdown>
      <Form.TagPicker
        id="gitPullRequestAuthors"
        title="Pull Request Authors"
        value={gitPullRequestAuthors}
        onChange={setGitPullRequestAuthors}
        info={
          activeAuthenticatedUsername
            ? `Used by View My Pull Requests. Leave empty to use the active GitHub account: @${activeAuthenticatedUsername}.`
            : "Used by View My Pull Requests. Leave empty to use the currently logged-in GitHub user."
        }
      >
        {authorOptions.map((author) => (
          <Form.TagPicker.Item
            key={author}
            value={author}
            title={`@${author}${author === activeAuthenticatedUsername ? " (active)" : ""}`}
            icon={gitHubUserIcon(author)}
          />
        ))}
      </Form.TagPicker>
      <Form.TextField
        id="newGitHubUsers"
        title="Add Users"
        placeholder="octocat, hubot"
        value={newGitHubUsers}
        onChange={setNewGitHubUsers}
        info="Enter GitHub usernames, then use Cmd+N to add them to the selector."
      />
    </Form>
  );
}

function gitHubUserIcon(username: string) {
  return {
    source: `https://github.com/${encodeURIComponent(username)}.png`,
    fallback: Icon.Person,
    mask: Image.Mask.Circle,
  };
}
