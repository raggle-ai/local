type FolderProjectParent = {
    name?: string;
    repositoryRoot: string;
};
export declare function folderDisplayName(folder: string): string;
export declare function repoPrefixedProjectName(parent: FolderProjectParent, folder: string, removePathFromName?: boolean): string;
export declare function subpathContextName(parent: FolderProjectParent, subpathRoot: string): string;
export declare function subpathProjectName(folder: string): string;
export declare function subpathParentDisplayName(folder: string): string | undefined;
export {};
