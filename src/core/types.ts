import type { ImportedRepositorySubpath } from "./project-subpaths";
export type { ImportedRepositorySubpath } from "./project-subpaths";

export type RemoteProject = {
  remoteUrl: string;
  repository?: string;
  name?: string;
  description?: string;
  tags?: string[];
  subpaths?: ImportedRepositorySubpath[];
  allSubpath?: boolean;
  folders?: string[];
  clonePathTemplate?: string;
  removePathFromName?: boolean;
  plugins?: string[];
};

export type LocalProject = {
  id: string;
  worktree: string;
  name?: string;
  description?: string;
  worktreeName?: string;
  keywords?: string[];
  tags?: string[];
  plugins?: string[];
  latestSessionTitle?: string;
  icon?: string;
  iconColor?: string;
  startupCommand?: string;
  sandboxCount: number;
  updatedAt?: number;
  hasIcon: boolean;
  isSessionOnly: boolean;
  isFavorite: boolean;
  relatedIds: string[];
  remoteUrl: string;
  browserUrl?: string;
  isCloned: boolean;
  repositoryRoot: string;
  parentProjectName?: string;
  relativePath?: string;
  isSubpathRoot?: boolean;
  allSubpath?: boolean;
  subpathAllSubpath?: boolean;
  removePathFromName?: boolean;
  hasCustomName?: boolean;
  remoteMismatch?: {
    worktree: string;
    actualRemoteUrl: string;
  };
};

export type LoadLocalProjectsOptions = {
  cloneDirectory: string;
  ignoredSubpaths?: string[];
  force?: boolean;
  onUpdate?: (items: LocalProject[]) => void;
  cloneIndexCachePath?: string;
  cachedProjectsByWorktree?: Map<string, LocalProject>;
};

export type NormalizedRemoteProject = Required<
  Pick<
    RemoteProject,
    "remoteUrl" | "repository" | "tags" | "subpaths" | "allSubpath" | "folders" | "plugins" | "removePathFromName"
  >
> &
  Omit<
    RemoteProject,
    "remoteUrl" | "repository" | "tags" | "subpaths" | "allSubpath" | "folders" | "plugins" | "removePathFromName"
  > & {
    hasCustomName: boolean;
  };

export type { ProjectActionConfig } from "./project-actions";
