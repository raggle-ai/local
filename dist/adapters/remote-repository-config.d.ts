import { normalizeSubpaths } from "../core/project-subpaths";
export type RemoteRepositoryConfig = {
    repository: string;
    source: "remote-database";
    name?: string;
    description?: string;
    tags: string[];
    folders: string[];
    subpaths: ReturnType<typeof normalizeSubpaths>;
    allSubpaths: boolean;
    clonePathTemplate?: string;
    removePathFromName: boolean;
};
export declare function normalizeRepositoryReference(input: string): string;
export declare function readRemoteRepositoryConfig(options: {
    repository: string;
    databaseUrl: string;
    authToken?: string;
}): Promise<RemoteRepositoryConfig | undefined>;
