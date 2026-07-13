import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { remoteToBrowserUrl } from "../core/project-remote";

const execFileAsync = promisify(execFile);

export type GitHubRepository = {
  owner: string;
  repo: string;
  browserUrl: string;
};

export type GitHubPullRequestSummary = {
  number: number;
  title: string;
  url: string;
};

export type GitHubSearchItemKind = "pull-request" | "issue";

export type GitHubSearchItem = {
  kind: GitHubSearchItemKind;
  number: number;
  title: string;
  url: string;
  author?: {
    login?: string;
  };
  updatedAt?: string;
  state?: string;
  isDraft?: boolean;
};

export type GitHubUserSearchItem = {
  username: string;
  kind: "User" | "Organization";
  browserUrl: string;
  avatarUrl?: string;
};

export type GitHubRepositorySearchItem = {
  name: string;
  fullName: string;
  browserUrl: string;
  description?: string;
  updatedAt?: string;
  isPrivate: boolean;
  isFork: boolean;
};

export type GitHubAuthenticatedAccount = {
  username: string;
  active: boolean;
  avatarUrl: string;
};

export function githubRepositoryFromUrl(input?: string) {
  if (!input) return undefined;

  const browserUrl = remoteToBrowserUrl(input);
  if (!browserUrl) return undefined;

  const parsedUrl = new URL(browserUrl);
  if (parsedUrl.hostname !== "github.com") return undefined;

  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return undefined;

  return {
    owner: segments[0],
    repo: segments[1],
    browserUrl: `https://github.com/${segments[0]}/${segments[1]}`,
  } satisfies GitHubRepository;
}

async function ghOutput(args: string[], options: { cwd?: string } = {}) {
  const { stdout } = await execFileAsync(githubCliPath(), args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
    maxBuffer: 1024 * 1024 * 4,
  });

  return stdout.trim();
}

function executableSearchPaths() {
  return [
    ...(process.env.PATH || "").split(path.delimiter).filter(Boolean),
    path.join(os.homedir(), ".local", "bin"),
    path.join(os.homedir(), ".bun", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
}

export function githubCliPath() {
  for (const directory of executableSearchPaths()) {
    const candidate = path.join(directory, "gh");

    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try next location.
    }
  }

  return "gh";
}

export async function githubViewerLogin() {
  return ghOutput(["api", "user", "--template", "{{.login}}"]);
}

export async function githubAuthenticatedAccounts(): Promise<GitHubAuthenticatedAccount[]> {
  const output = await ghOutput(["auth", "status"]);
  const accountMatches = [
    ...output.matchAll(/Logged in to github\.com account ([^\s]+) \(keyring\)([\s\S]*?)(?=\n\n|\n  \u2713|\n  X|$)/g),
  ];

  return accountMatches.map((match) => {
    const username = match[1];

    return {
      username,
      active: match[2].includes("Active account: true"),
      avatarUrl: `https://github.com/${encodeURIComponent(username)}.png`,
    };
  });
}

export async function githubSearchUsers(query: string, limit = 20): Promise<GitHubUserSearchItem[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const output = await ghOutput([
    "api",
    "--method",
    "GET",
    "search/users",
    "-f",
    `q=${trimmedQuery} in:login`,
    "-f",
    `per_page=${limit}`,
  ]);
  const results = JSON.parse(output) as {
    items?: Array<{
      login?: string;
      type?: string;
      html_url?: string;
      avatar_url?: string;
    }>;
  };

  return (results.items ?? [])
    .filter((item) => item.login)
    .map((item) => {
      const username = item.login as string;

      return {
        username,
        kind: item.type === "Organization" ? "Organization" : "User",
        browserUrl: item.html_url ?? `https://github.com/${encodeURIComponent(username)}`,
        avatarUrl: item.avatar_url,
      };
    });
}

export async function githubSearchOwnerRepositories(owner: string, limit = 30): Promise<GitHubRepositorySearchItem[]> {
  const trimmedOwner = owner.trim();
  if (!trimmedOwner) return [];

  const output = await ghOutput([
    "api",
    "--method",
    "GET",
    "search/repositories",
    "-f",
    `q=user:${trimmedOwner} fork:true`,
    "-f",
    "sort=updated",
    "-f",
    "order=desc",
    "-f",
    `per_page=${limit}`,
  ]);
  const results = JSON.parse(output) as {
    items?: Array<{
      name?: string;
      full_name?: string;
      html_url?: string;
      description?: string | null;
      updated_at?: string;
      private?: boolean;
      fork?: boolean;
    }>;
  };

  return (results.items ?? [])
    .filter((item) => item.name && item.full_name && item.html_url)
    .map((item) => ({
      name: item.name as string,
      fullName: item.full_name as string,
      browserUrl: item.html_url as string,
      description: item.description ?? undefined,
      updatedAt: item.updated_at,
      isPrivate: Boolean(item.private),
      isFork: Boolean(item.fork),
    }));
}

export function githubPullRequestLookupErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("spawn gh ENOENT")) {
    return "GitHub CLI is not installed, so the action is using local Git config for the username when available.";
  }

  return "GitHub CLI is not authenticated, so the action is using local Git config for the username when available.";
}

async function gitConfigValue(key: string, worktree?: string) {
  try {
    const { stdout } = await execFileAsync("git", ["config", "--get", key], {
      cwd: worktree,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
      maxBuffer: 1024 * 1024 * 4,
    });

    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function gitCurrentBranch(worktree: string) {
  try {
    const { stdout } = await execFileAsync("git", ["branch", "--show-current"], {
      cwd: worktree,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
      maxBuffer: 1024 * 1024 * 4,
    });

    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function fallbackGitHubViewerLogin(worktree?: string) {
  return (
    (await gitConfigValue("github.user", worktree)) ??
    (await gitConfigValue("github.username", worktree)) ??
    (await gitConfigValue("user.name", worktree))
  );
}

export async function githubPullRequestsByAuthor(repository: GitHubRepository, author: string) {
  const output = await ghOutput([
    "pr",
    "list",
    "--repo",
    `${repository.owner}/${repository.repo}`,
    "--author",
    author,
    "--state",
    "open",
    "--json",
    "number,title,url",
  ]);

  return JSON.parse(output) as GitHubPullRequestSummary[];
}

function githubSearchArgs(command: "pr" | "issue", repository: GitHubRepository, query: string, limit: number) {
  const args = [
    command,
    "list",
    "--repo",
    `${repository.owner}/${repository.repo}`,
    "--state",
    "open",
    "--limit",
    String(limit),
    "--json",
    command === "pr" ? "number,title,url,author,updatedAt,state,isDraft" : "number,title,url,author,updatedAt,state",
  ];

  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    args.push("--search", trimmedQuery);
  }

  return args;
}

export async function githubSearchPullRequests(
  repository: GitHubRepository,
  query = "",
  limit = 30,
): Promise<GitHubSearchItem[]> {
  const output = await ghOutput(githubSearchArgs("pr", repository, query, limit));
  const pullRequests = JSON.parse(output) as GitHubSearchItem[];

  return pullRequests.map((pullRequest) => ({
    ...pullRequest,
    kind: "pull-request",
  }));
}

export async function githubSearchIssues(
  repository: GitHubRepository,
  query = "",
  limit = 30,
): Promise<GitHubSearchItem[]> {
  const output = await ghOutput(githubSearchArgs("issue", repository, query, limit));
  const issues = JSON.parse(output) as GitHubSearchItem[];

  return issues.map((issue) => ({
    ...issue,
    kind: "issue",
  }));
}

export async function githubSearchPullRequestsAndIssues(repository: GitHubRepository, query = "", limit = 30) {
  const [pullRequests, issues] = await Promise.all([
    githubSearchPullRequests(repository, query, limit),
    githubSearchIssues(repository, query, limit),
  ]);

  return [...pullRequests, ...issues].sort((first, second) => {
    const firstTime = first.updatedAt ? Date.parse(first.updatedAt) : 0;
    const secondTime = second.updatedAt ? Date.parse(second.updatedAt) : 0;

    return secondTime - firstTime;
  });
}

export async function githubPullRequestForCurrentBranch(repository: GitHubRepository, worktree: string) {
  const branch = await gitCurrentBranch(worktree);
  if (!branch) return undefined;

  try {
    const output = await ghOutput(
      ["pr", "view", branch, "--repo", `${repository.owner}/${repository.repo}`, "--json", "number,title,url"],
      { cwd: worktree },
    );

    return JSON.parse(output) as GitHubPullRequestSummary;
  } catch {
    return undefined;
  }
}

export function githubPullRequestsBrowserUrl(repository: GitHubRepository, authors?: string | string[]) {
  const authorList = Array.isArray(authors) ? authors : authors ? [authors] : [];
  if (!authorList.length) return `${repository.browserUrl}/pulls`;

  const authorQuery = authorList.map((author) => `author:${author}`).join(" ");
  const query = encodeURIComponent(`is:pr is:open ${authorQuery}`);
  return `${repository.browserUrl}/pulls?q=${query}`;
}

export function githubSearchBrowserUrl(
  repository: GitHubRepository,
  query: string,
  kind: GitHubSearchItemKind | "all" = "all",
) {
  const qualifiers = ["is:open"];
  if (kind === "pull-request") qualifiers.push("is:pr");
  if (kind === "issue") qualifiers.push("is:issue");

  const search = [...qualifiers, query.trim()].filter(Boolean).join(" ");
  return `${repository.browserUrl}/issues?q=${encodeURIComponent(search)}`;
}
