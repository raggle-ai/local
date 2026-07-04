export type LocalRepositoryMatch = {
    worktree: string;
    isMatch: true;
} | {
    worktree: string;
    actualRemoteUrl: string;
    isMatch: false;
};
export type CloneDirectoryRepositoryIndex = {
    worktreeByRepositoryKey: Map<string, string>;
    remoteUrlByWorktree: Map<string, string>;
};
export type StandardProjectsCloneIndexEntry = {
    worktree: string;
    remoteUrl: string;
    currentBranch?: string;
};
export declare function findLocalRepository(remoteUrl: string, preferredWorktree: string, repositoryIndex: CloneDirectoryRepositoryIndex): Promise<LocalRepositoryMatch | undefined>;
export declare function prepareCloneDirectoryIndex(cloneDirectory: string, options?: {
    force?: boolean;
    cachePath?: string;
    scannedRepositories?: StandardProjectsCloneIndexEntry[];
}): Promise<CloneDirectoryRepositoryIndex>;
