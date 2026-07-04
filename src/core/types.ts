import type { ImportedRepositorySubpath } from "./project-subpaths";
import type { DiscoveredRepository } from "../discovery/scanner";
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
  /** Repositories already discovered in cloneDirectory, so indexing can skip its own scan. */
  scannedRepositories?: DiscoveredRepository[];
  /**
   * Extra marker file names (like the built-in kennel.json). A directory that
   * contains one becomes an allSubpath subpath root, so its child folders are
   * included automatically. Root-level discovery of these markers runs for any
   * repository whose root has a raggle.json, even without allSubpath.
   */
  subpathMarkerFiles?: string[];
  /**
   * Repo config file names checked at repository roots and subpath folders.
   * Checked in order, first existing file wins; custom names take priority
   * over the defaults raggle.json and index.json (which always remain as
   * fallbacks).
   */
  projectConfigFiles?: string[];
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
