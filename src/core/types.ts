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
  collapseSubpaths?: boolean;
  allTopLevelFolders?: boolean;
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
  collapseSubpaths?: boolean;
  allTopLevelFolders?: boolean;
  subpathAllSubpath?: boolean;
  removePathFromName?: boolean;
  hasCustomName?: boolean;
  remoteMismatch?: {
    worktree: string;
    actualRemoteUrl: string;
  };
};

export type LocalProjectLoadPhase = "repositories" | "resolved" | "subpaths";

export type LocalProjectDelta = {
  /** New or changed projects relative to LoadLocalProjectsOptions.previousItems. */
  upserted: LocalProject[];
  /** Stale worktrees, populated only by the authoritative final update. */
  removedWorktrees: string[];
};

export type LocalProjectUpdate = {
  /** The phase snapshot. Partial snapshots intentionally omit undiscovered subpaths. */
  items: LocalProject[];
  phase: LocalProjectLoadPhase;
  /** True only when items is complete and safe to use as a replacement list. */
  authoritative: boolean;
  delta: LocalProjectDelta;
};

export type LoadLocalProjectsOptions = {
  cloneDirectory: string;
  ignoredSubpaths?: string[];
  force?: boolean;
  /** Receives the legacy phase items plus metadata describing completeness and changes. */
  onUpdate?: (items: LocalProject[], update: LocalProjectUpdate) => void;
  /** Last complete result, used as the baseline for progressive update deltas. */
  previousItems?: readonly LocalProject[];
  cloneIndexCachePath?: string;
  cachedProjectsByWorktree?: Map<string, LocalProject>;
  /** Repositories already discovered in cloneDirectory, so indexing can skip its own scan. */
  scannedRepositories?: DiscoveredRepository[];
  /**
   * Extra marker file names (like the built-in kennel.json). A directory that
   * contains one becomes an all-folder subpath root, so its child folders are
   * included automatically. Root-level discovery of these markers runs for any
   * repository whose root has a raggle.json, even without collapseSubpaths.
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
    | "remoteUrl"
    | "repository"
    | "tags"
    | "subpaths"
    | "allSubpath"
    | "collapseSubpaths"
    | "allTopLevelFolders"
    | "folders"
    | "plugins"
    | "removePathFromName"
  >
> &
  Omit<
    RemoteProject,
    | "remoteUrl"
    | "repository"
    | "tags"
    | "subpaths"
    | "allSubpath"
    | "collapseSubpaths"
    | "allTopLevelFolders"
    | "folders"
    | "plugins"
    | "removePathFromName"
  > & {
    hasCustomName: boolean;
  };

export type { ProjectActionConfig } from "./project-actions";
