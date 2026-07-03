export declare const projectIconExtensions: string[];
export declare function discoverProjectIcon(worktree: string): string | undefined;
export declare function githubOwnerFromRemoteUrl(remoteUrl: string | undefined): string | undefined;
export declare function fetchGithubOwnerIcon(remoteUrl: string | undefined): Promise<{
    owner: string;
    data: Buffer<ArrayBuffer>;
    ext: string;
    sourceUrl: string;
} | undefined>;
