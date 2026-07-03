import { projectKeywords, standardProjectWithKeywords } from "./project-keywords";
import { type LocalProject, type LoadLocalProjectsOptions, type RemoteProject } from "./types";
export declare function loadLocalProjects(remoteProjects: RemoteProject[], options: LoadLocalProjectsOptions): Promise<LocalProject[]>;
export { projectKeywords, standardProjectWithKeywords };
