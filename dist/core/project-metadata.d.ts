import type { LocalProject } from "./types";
export type LocalProjectMetadata = Pick<LocalProject, "worktree"> & Partial<Pick<LocalProject, "name" | "worktreeName" | "tags" | "latestSessionTitle" | "icon" | "iconColor" | "startupCommand" | "sandboxCount" | "updatedAt" | "hasIcon" | "isSessionOnly" | "isFavorite" | "relatedIds">>;
/** Merges consumer metadata into discovered projects and inherits repository icons for subpaths. */
export declare function mergeLocalProjectMetadata(projects: LocalProject[], metadataItems: readonly LocalProjectMetadata[]): LocalProject[];
