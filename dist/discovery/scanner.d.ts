export type DiscoveredRepository = {
    worktree: string;
    remoteUrl: string;
    currentBranch?: string;
};
export type ScanCloneDirectoryOptions = {
    maxRepos?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onProgress?: (result: ScanCloneDirectoryResult) => void;
};
export type ScanCloneDirectoryResult = {
    repositories: DiscoveredRepository[];
    truncated: boolean;
    timedOut: boolean;
    stopped: boolean;
    durationMs: number;
    maxRepos: number | undefined;
    timeoutMs: number | undefined;
};
export declare function scanCloneDirectoryRepositories(cloneDirectory: string, options?: ScanCloneDirectoryOptions): ScanCloneDirectoryResult;
