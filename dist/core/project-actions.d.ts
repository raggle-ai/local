export type ProjectActionConfig = {
    tags?: string[];
    folders?: string[];
    subpaths?: unknown;
    allSubpath?: boolean;
    allTopLevelFolders?: boolean;
    removePathFromName?: boolean;
    ignoredSubpaths?: string[] | string;
};
