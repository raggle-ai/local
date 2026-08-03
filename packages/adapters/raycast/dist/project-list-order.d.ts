type ProjectListItem = {
    worktree: string;
};
export declare function preserveProjectOrder<T extends ProjectListItem>(currentItems: T[], updatedItems: T[]): T[];
export declare function recordRecentSelection(recentSelections: string[], itemKey: string): string[];
export declare function resetRecentSelection(recentSelections: string[], itemKey: string): string[];
export declare function sortNonFavouritesByRecentSelection<T>(items: T[], favourites: string[], recentSelections: string[], getItemKey: (item: T) => string): T[];
export {};
