export type ProjectKeywordInput = {
    worktree: string;
    remoteUrl?: string;
    name?: string;
    description?: string;
    parentProjectName?: string;
    relativePath?: string;
    tags?: string[];
    latestSessionTitle?: string;
};
export declare function projectKeywords(item: ProjectKeywordInput): string[];
export declare function standardProjectWithKeywords<T extends ProjectKeywordInput>(item: T): T & {
    keywords: string[];
};
export declare function projectTitle(item: {
    name?: string;
    worktree: string;
}): string;
export declare function projectSubtitle(item: {
    latestSessionTitle?: string;
    tags?: string[];
    worktree: string;
}): string;
export declare function projectAccessoryPath(item: {
    worktree: string;
}): string;
