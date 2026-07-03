export declare function normalizeRepositoryUrl(remoteUrl: string): string;
export declare function repositoryName(remoteUrl: string): string;
export declare function githubRepositoryPath(remoteUrl: string): {
    owner: string;
    repo: string;
} | undefined;
export declare function repositoryDirectoryName(remoteUrl: string): string;
export declare function repositoryLookupKey(remoteUrl: string): string;
export declare function gitRemoteUrl(worktree: string): Promise<string>;
export declare function gitCurrentBranch(worktree: string): Promise<string | undefined>;
