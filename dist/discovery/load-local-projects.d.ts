import { type LocalProject, type LoadLocalProjectsOptions, type RemoteProject } from "../core/types";
export declare function loadLocalProjects(remoteProjects: RemoteProject[], options: LoadLocalProjectsOptions): Promise<LocalProject[]>;
