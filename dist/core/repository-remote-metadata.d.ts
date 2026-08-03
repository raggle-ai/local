export type RepositoryRemoteMetadata = {
    provider: string;
    host: string;
    owner?: string;
    repository?: string;
};
export declare function repositoryRemoteMetadata(remoteUrl: string | undefined): RepositoryRemoteMetadata | undefined;
export declare function repositoryRemoteProvider(remoteUrl: string | undefined): string | undefined;
