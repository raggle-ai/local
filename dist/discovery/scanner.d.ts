export type DiscoveredRepository = {
    worktree: string;
    remoteUrl: string;
    currentBranch?: string;
};
export declare function scanCloneDirectoryRepositories(cloneDirectory: string): DiscoveredRepository[];
