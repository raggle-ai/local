import { type ImportedRepository, type ImportedRepositoryRow } from "./import";
export type AddProjectValues = {
    url: string;
    name: string;
    description: string;
    tags: string;
    folders: string[];
    subpaths: string;
};
export declare function getRepositoryNameFromUrl(url: string): string;
export declare function getRepositoryDirectoryNameFromUrl(url: string): string;
export declare function deriveLocalProjectPath(url: string, defaultCloneDirectory?: string, folderName?: string): string;
export declare function deriveProjectName(url: string): string;
export declare function clonePathTemplateFromFormValue(clonePath: string, defaultCloneDirectory: string, defaultRepositoryName: string): string | undefined;
export declare function projectRowFromValues(values: AddProjectValues): ImportedRepositoryRow;
export declare function repositoryRootPath(repository: Pick<ImportedRepository, "repository" | "clonePathTemplate"> & {
    remoteUrl?: string;
}, defaultCloneDirectory: string): string;
export declare function repositoryCloneParentDirectory(repository: Pick<ImportedRepository, "repository" | "clonePathTemplate">, defaultCloneDirectory: string): string;
