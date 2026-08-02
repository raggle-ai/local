export type SearchableProject = {
    name?: string;
    worktree: string;
    remoteUrl?: string;
    keywords?: string[];
    latestSessionTitle?: string;
    relativePath?: string;
    remoteMismatch?: {
        actualRemoteUrl?: string;
    };
};
export type ProjectSearchIndexEntry<T extends SearchableProject = SearchableProject> = {
    project: T;
    primaryText: string;
    compactPrimaryText: string;
    secondaryText: string;
    compactSecondaryText: string;
    title: string;
    repositoryName: string;
    compactRepositoryName: string;
    remoteOwner?: string;
};
export type ProjectSearchIndexOptions<T extends SearchableProject> = {
    getKeywords?: (project: T) => string[];
    getTitle?: (project: T) => string;
    getRepositoryName?: (project: T) => string;
};
export type ProjectUsernameListItem = {
    username: string;
    projectCount: number;
    browserUrl: string;
    avatarUrl?: string;
};
export type ParsedProjectSearch = {
    query: string;
    normalizedQuery: string;
    compactQuery: string;
    queryWords: string[];
    remoteOwner?: string;
    usernameQuery?: string;
};
export declare function parseProjectSearch(searchText: string): ParsedProjectSearch;
export declare function buildProjectSearchIndex<T extends SearchableProject>(items: T[], options?: ProjectSearchIndexOptions<T>): ProjectSearchIndexEntry<T>[];
export declare function projectSearchCanNarrow(previousSearch: ParsedProjectSearch, nextSearch: ParsedProjectSearch): boolean;
export declare function evaluateProjectSearchEntry<T extends SearchableProject>(entry: ProjectSearchIndexEntry<T>, parsedSearch: ParsedProjectSearch): number | undefined;
export declare function projectSearchEntryMatches<T extends SearchableProject>(entry: ProjectSearchIndexEntry<T>, parsedSearch: ParsedProjectSearch): boolean;
export declare function projectSearchEntryScore<T extends SearchableProject>(entry: ProjectSearchIndexEntry<T>, parsedSearch: ParsedProjectSearch): number;
export declare function searchProjects<T extends SearchableProject>(index: ProjectSearchIndexEntry<T>[], parsedSearch: ParsedProjectSearch, options?: {
    limit?: number;
    order?: (entry: ProjectSearchIndexEntry<T>) => number;
}): T[];
export declare function projectUsernameListItems<T extends SearchableProject>(items: T[], query: string | undefined): ProjectUsernameListItem[];
