import type { LocalProject, LoadLocalProjectsOptions } from "../core/types";
import { type ScanCloneDirectoryOptions } from "./scanner";
export type DiscoverLocalProjectsOptions = Omit<LoadLocalProjectsOptions, "cloneDirectory" | "scannedRepositories"> & {
    cloneDirectory: string;
    scan?: ScanCloneDirectoryOptions;
};
export type DiscoverLocalProjectsUnderFolderOptions = Omit<LoadLocalProjectsOptions, "cloneDirectory" | "scannedRepositories"> & {
    folder: string;
    scan?: ScanCloneDirectoryOptions;
};
/** Discovers cloned repositories and expands their configured Raggle folders. */
export declare function discoverLocalProjects(options: DiscoverLocalProjectsOptions): Promise<LocalProject[]>;
/** Lists only configured projects strictly beneath a folder. */
export declare function discoverLocalProjectsUnderFolder(options: DiscoverLocalProjectsUnderFolderOptions): Promise<LocalProject[]>;
