export type DiscoveredRepository = {
    worktree: string;
    remoteUrl: string;
    currentBranch?: string;
};
export type ScanCloneDirectoryOptions = {
    maxDepth?: number;
    maxRepos?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onProgress?: (repository: DiscoveredRepository, count: number) => void;
};
export type ScanCloneDirectoryResult = {
    repositories: DiscoveredRepository[];
    warnings: string[];
    truncated: boolean;
    timedOut: boolean;
    stopped: boolean;
    durationMs: number;
    maxDepth: number;
    maxRepos: number;
    timeoutMs: number;
};
/** Identifies a Git repository rooted at exactly the supplied directory. */
export declare function discoverRepository(directory: string): DiscoveredRepository | undefined;
/**
 * Discovers repositories without blocking the JavaScript event loop. Traversal
 * runs in napi-rs' async worker pool and is bounded by depth, count, and time.
 */
export declare function scanCloneDirectoryRepositories(cloneDirectory: string, options?: ScanCloneDirectoryOptions): Promise<ScanCloneDirectoryResult>;
