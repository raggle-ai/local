export type ImportedRepositorySubpath = {
    path: string;
    allSubpath?: boolean;
    removePathFromName?: boolean;
};
export type ProjectSubpathSettingsValues = {
    allSubpath: boolean;
    removePathFromName: boolean;
};
export declare function normalizeSubpathPath(input: string): string;
export declare function normalizeSubpaths(input: unknown): ImportedRepositorySubpath[];
export declare function normalizeSubpathPaths(input: unknown): string[];
export declare function mergeExistingSubpathSettings(existingInput: unknown, nextInput: unknown): (string | ImportedRepositorySubpath)[];
export declare function upsertSubpathSettings(input: unknown, subpathPath: string, values: ProjectSubpathSettingsValues): ImportedRepositorySubpath[];
export declare function shouldIncludeSubpathDirectory(name: string): boolean;
export declare function readSubpathChildDirectories(parentDirectory: string): string[];
