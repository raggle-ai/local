import path from "node:path";
import { projectWithKeywords } from "./project-keywords";
import type { LocalProject } from "./types";

export type LocalProjectMetadata = Pick<LocalProject, "worktree"> &
  Partial<
    Pick<
      LocalProject,
      | "name"
      | "worktreeName"
      | "tags"
      | "latestSessionTitle"
      | "icon"
      | "iconColor"
      | "startupCommand"
      | "sandboxCount"
      | "updatedAt"
      | "hasIcon"
      | "isSessionOnly"
      | "isFavorite"
      | "relatedIds"
    >
  >;

function resolvedProjectName(project: LocalProject, metadata?: LocalProjectMetadata) {
  if (project.relativePath || project.hasCustomName) return project.name;
  return metadata?.name ?? project.name;
}

function nearestInheritedIconSource(
  project: LocalProject,
  projectsByWorktree: Map<string, LocalProject>,
  metadataByWorktree: Map<string, LocalProjectMetadata>,
) {
  if (!project.relativePath) return undefined;

  let currentDirectory = path.dirname(project.worktree);
  while (currentDirectory && currentDirectory !== project.worktree) {
    if (projectsByWorktree.has(currentDirectory)) {
      const metadata = metadataByWorktree.get(currentDirectory);
      if (metadata?.icon) return metadata;
    }

    const nextDirectory = path.dirname(currentDirectory);
    if (nextDirectory === currentDirectory) break;
    currentDirectory = nextDirectory;
  }

  return metadataByWorktree.get(project.repositoryRoot);
}

/** Merges consumer metadata into discovered projects and inherits repository icons for subpaths. */
export function mergeLocalProjectMetadata(
  projects: LocalProject[],
  metadataItems: readonly LocalProjectMetadata[],
): LocalProject[] {
  const projectsByWorktree = new Map(projects.map((project) => [project.worktree, project]));
  const metadataByWorktree = new Map(metadataItems.map((metadata) => [metadata.worktree, metadata]));

  return projects.map((project) => {
    const metadata = metadataByWorktree.get(project.worktree);
    const inheritedIcon = nearestInheritedIconSource(project, projectsByWorktree, metadataByWorktree);

    if (!metadata) {
      if (!inheritedIcon?.icon) return project;

      return projectWithKeywords({
        ...project,
        icon: project.icon ?? inheritedIcon.icon,
        iconColor: project.iconColor ?? inheritedIcon.iconColor,
        hasIcon: project.hasIcon || Boolean(inheritedIcon.icon),
      });
    }

    return projectWithKeywords({
      ...project,
      name: resolvedProjectName(project, metadata),
      worktreeName: metadata.worktreeName ?? project.worktreeName,
      tags: metadata.tags ?? project.tags,
      latestSessionTitle: metadata.latestSessionTitle ?? project.latestSessionTitle,
      icon: metadata.icon ?? inheritedIcon?.icon ?? project.icon,
      iconColor: metadata.iconColor ?? inheritedIcon?.iconColor ?? project.iconColor,
      startupCommand: metadata.startupCommand ?? project.startupCommand,
      sandboxCount: metadata.sandboxCount ?? project.sandboxCount,
      updatedAt: metadata.updatedAt ?? project.updatedAt,
      hasIcon: Boolean(metadata.hasIcon) || Boolean(inheritedIcon?.icon) || project.hasIcon,
      isSessionOnly: metadata.isSessionOnly ?? project.isSessionOnly,
      isFavorite: metadata.isFavorite ?? project.isFavorite,
      relatedIds: metadata.relatedIds ?? project.relatedIds,
    });
  });
}
