"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.githubRepositoryFromUrl = githubRepositoryFromUrl;
exports.githubViewerLogin = githubViewerLogin;
exports.githubSearchUsers = githubSearchUsers;
exports.githubSearchOwnerRepositories = githubSearchOwnerRepositories;
exports.githubPullRequestLookupErrorMessage = githubPullRequestLookupErrorMessage;
exports.fallbackGitHubViewerLogin = fallbackGitHubViewerLogin;
exports.githubPullRequestsByAuthor = githubPullRequestsByAuthor;
exports.githubSearchPullRequests = githubSearchPullRequests;
exports.githubSearchIssues = githubSearchIssues;
exports.githubSearchPullRequestsAndIssues = githubSearchPullRequestsAndIssues;
exports.githubPullRequestForCurrentBranch = githubPullRequestForCurrentBranch;
exports.githubPullRequestsBrowserUrl = githubPullRequestsBrowserUrl;
exports.githubSearchBrowserUrl = githubSearchBrowserUrl;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_util_1 = require("node:util");
const project_remote_1 = require("./project-remote");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
function githubRepositoryFromUrl(input) {
    if (!input)
        return undefined;
    const browserUrl = (0, project_remote_1.remoteToBrowserUrl)(input);
    if (!browserUrl)
        return undefined;
    const parsedUrl = new URL(browserUrl);
    if (parsedUrl.hostname !== "github.com")
        return undefined;
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    if (segments.length < 2)
        return undefined;
    return {
        owner: segments[0],
        repo: segments[1],
        browserUrl: `https://github.com/${segments[0]}/${segments[1]}`,
    };
}
async function ghOutput(args, options = {}) {
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
        ...(process.env.PATH || "").split(node_path_1.default.delimiter).filter(Boolean),
        node_path_1.default.join(node_os_1.default.homedir(), ".local", "bin"),
        node_path_1.default.join(node_os_1.default.homedir(), ".bun", "bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
    ];
}
function githubCliPath() {
    for (const directory of executableSearchPaths()) {
        const candidate = node_path_1.default.join(directory, "gh");
        try {
            (0, node_fs_1.accessSync)(candidate, node_fs_1.constants.X_OK);
            return candidate;
        }
        catch {
            // Try next location.
        }
    }
    return "gh";
}
async function githubViewerLogin() {
    return ghOutput(["api", "user", "--template", "{{.login}}"]);
}
async function githubSearchUsers(query, limit = 20) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery)
        return [];
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
    const results = JSON.parse(output);
    return (results.items ?? [])
        .filter((item) => item.login)
        .map((item) => {
        const username = item.login;
        return {
            username,
            kind: item.type === "Organization" ? "Organization" : "User",
            browserUrl: item.html_url ?? `https://github.com/${encodeURIComponent(username)}`,
            avatarUrl: item.avatar_url,
        };
    });
}
async function githubSearchOwnerRepositories(owner, limit = 30) {
    const trimmedOwner = owner.trim();
    if (!trimmedOwner)
        return [];
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
    const results = JSON.parse(output);
    return (results.items ?? [])
        .filter((item) => item.name && item.full_name && item.html_url)
        .map((item) => ({
        name: item.name,
        fullName: item.full_name,
        browserUrl: item.html_url,
        description: item.description ?? undefined,
        updatedAt: item.updated_at,
        isPrivate: Boolean(item.private),
        isFork: Boolean(item.fork),
    }));
}
function githubPullRequestLookupErrorMessage(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("spawn gh ENOENT")) {
        return "GitHub CLI is not installed, so the action is using local Git config for the username when available.";
    }
    return "GitHub CLI is not authenticated, so the action is using local Git config for the username when available.";
}
async function gitConfigValue(key, worktree) {
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
    }
    catch {
        return undefined;
    }
}
async function gitCurrentBranch(worktree) {
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
    }
    catch {
        return undefined;
    }
}
async function fallbackGitHubViewerLogin(worktree) {
    return ((await gitConfigValue("github.user", worktree)) ??
        (await gitConfigValue("github.username", worktree)) ??
        (await gitConfigValue("user.name", worktree)));
}
async function githubPullRequestsByAuthor(repository, author) {
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
    return JSON.parse(output);
}
function githubSearchArgs(command, repository, query, limit) {
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
async function githubSearchPullRequests(repository, query = "", limit = 30) {
    const output = await ghOutput(githubSearchArgs("pr", repository, query, limit));
    const pullRequests = JSON.parse(output);
    return pullRequests.map((pullRequest) => ({
        ...pullRequest,
        kind: "pull-request",
    }));
}
async function githubSearchIssues(repository, query = "", limit = 30) {
    const output = await ghOutput(githubSearchArgs("issue", repository, query, limit));
    const issues = JSON.parse(output);
    return issues.map((issue) => ({
        ...issue,
        kind: "issue",
    }));
}
async function githubSearchPullRequestsAndIssues(repository, query = "", limit = 30) {
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
async function githubPullRequestForCurrentBranch(repository, worktree) {
    const branch = await gitCurrentBranch(worktree);
    if (!branch)
        return undefined;
    try {
        const output = await ghOutput(["pr", "view", branch, "--repo", `${repository.owner}/${repository.repo}`, "--json", "number,title,url"], { cwd: worktree });
        return JSON.parse(output);
    }
    catch {
        return undefined;
    }
}
function githubPullRequestsBrowserUrl(repository, author) {
    if (!author)
        return `${repository.browserUrl}/pulls`;
    const query = encodeURIComponent(`is:pr is:open author:${author}`);
    return `${repository.browserUrl}/pulls?q=${query}`;
}
function githubSearchBrowserUrl(repository, query, kind = "all") {
    const qualifiers = ["is:open"];
    if (kind === "pull-request")
        qualifiers.push("is:pr");
    if (kind === "issue")
        qualifiers.push("is:issue");
    const search = [...qualifiers, query.trim()].filter(Boolean).join(" ");
    return `${repository.browserUrl}/issues?q=${encodeURIComponent(search)}`;
}
