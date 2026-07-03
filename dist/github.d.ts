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
export declare function githubRepositoryFromUrl(input?: string): {
    owner: string;
    repo: string;
    browserUrl: string;
} | undefined;
export declare function githubViewerLogin(): Promise<string>;
export declare function githubSearchUsers(query: string, limit?: number): Promise<GitHubUserSearchItem[]>;
export declare function githubSearchOwnerRepositories(owner: string, limit?: number): Promise<GitHubRepositorySearchItem[]>;
export declare function githubPullRequestLookupErrorMessage(error: unknown): "GitHub CLI is not installed, so the action is using local Git config for the username when available." | "GitHub CLI is not authenticated, so the action is using local Git config for the username when available.";
export declare function fallbackGitHubViewerLogin(worktree?: string): Promise<string | undefined>;
export declare function githubPullRequestsByAuthor(repository: GitHubRepository, author: string): Promise<GitHubPullRequestSummary[]>;
export declare function githubSearchPullRequests(repository: GitHubRepository, query?: string, limit?: number): Promise<GitHubSearchItem[]>;
export declare function githubSearchIssues(repository: GitHubRepository, query?: string, limit?: number): Promise<GitHubSearchItem[]>;
export declare function githubSearchPullRequestsAndIssues(repository: GitHubRepository, query?: string, limit?: number): Promise<GitHubSearchItem[]>;
export declare function githubPullRequestForCurrentBranch(repository: GitHubRepository, worktree: string): Promise<GitHubPullRequestSummary | undefined>;
export declare function githubPullRequestsBrowserUrl(repository: GitHubRepository, author?: string): string;
export declare function githubSearchBrowserUrl(repository: GitHubRepository, query: string, kind?: GitHubSearchItemKind | "all"): string;
