export type LocalRepositoryCandidate = {
    worktree: string;
    remoteUrl: string;
    currentBranch?: string;
};
export declare function compareLocalRepositoryCandidatePreference(a: LocalRepositoryCandidate, b: LocalRepositoryCandidate): number;
export declare function sortLocalRepositoryCandidates<T extends LocalRepositoryCandidate>(candidates: T[]): T[];
