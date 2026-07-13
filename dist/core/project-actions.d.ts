export type ProjectActionConfig = {
    tags?: string[];
    folders?: string[];
    subpaths?: unknown;
    allSubpath?: boolean;
    removePathFromName?: boolean;
    ignoredSubpaths?: string[] | string;
};
