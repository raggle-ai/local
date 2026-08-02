import { Color } from "@raycast/api";
import type { LocalProject } from "@raggle-ai/local";

export type RaycastProjectColor = Color;

export type RaycastProject = Omit<LocalProject, "tint"> & {
  tint?: RaycastProjectColor;
};

export type RaycastCachedProject = {
  id: string;
  worktree: string;
  name?: string;
  description?: string;
  worktreeName?: string;
  keywords?: string[];
  tags?: string[];
  latestSessionTitle?: string;
  icon?: string;
  iconColor?: string;
  tint?: RaycastProjectColor;
  startupCommand?: string;
  sandboxCount: number;
  updatedAt?: number;
  hasIcon: boolean;
  isSessionOnly?: boolean;
  isFavorite?: boolean;
  relatedIds?: string[];
};

export function raycastTintFromIconColor(iconColor?: string | null): RaycastProjectColor | undefined {
  if (!iconColor) return undefined;

  const key = iconColor.toLowerCase();
  if (key.includes("red")) return Color.Red;
  if (key.includes("orange")) return Color.Orange;
  if (key.includes("yellow")) return Color.Yellow;
  if (key.includes("green")) return Color.Green;
  if (key.includes("blue")) return Color.Blue;
  if (key.includes("magenta") || key.includes("pink") || key.includes("purple")) return Color.Magenta;
  if (key.includes("secondary") || key.includes("gray") || key.includes("grey")) return Color.SecondaryText;

  return undefined;
}

export function iconColorFromRaycastTint(tint?: RaycastProjectColor): string | undefined {
  switch (tint) {
    case Color.Red:
      return "red";
    case Color.Orange:
      return "orange";
    case Color.Yellow:
      return "yellow";
    case Color.Green:
      return "green";
    case Color.Blue:
      return "blue";
    case Color.Magenta:
      return "magenta";
    case Color.SecondaryText:
      return "secondary";
    default:
      return undefined;
  }
}

export function cachedRaycastProjectToLocalProject(project: RaycastCachedProject): LocalProject {
  return {
    id: project.id,
    worktree: project.worktree,
    name: project.name,
    description: project.description,
    worktreeName: project.worktreeName,
    keywords: project.keywords,
    tags: project.tags,
    latestSessionTitle: project.latestSessionTitle,
    icon: project.icon,
    iconColor: project.iconColor,
    startupCommand: project.startupCommand,
    sandboxCount: project.sandboxCount,
    updatedAt: project.updatedAt,
    hasIcon: project.hasIcon,
    isSessionOnly: Boolean(project.isSessionOnly),
    isFavorite: Boolean(project.isFavorite),
    relatedIds: project.relatedIds ?? [],
    remoteUrl: project.worktree,
    isCloned: true,
    repositoryRoot: project.worktree,
  };
}

export function localProjectToRaycastProject(project: LocalProject): RaycastProject {
  return {
    ...project,
    tint: raycastTintFromIconColor(project.iconColor),
    keywords: project.keywords ?? [],
  };
}

export { ProjectPicker, type ProjectPickerProps } from "./project-picker";
export {
  raggleProjectSnapshotPath,
  readRaggleProjectSnapshot,
  type RaggleProjectSnapshotOptions,
} from "./project-snapshot";

export * from "./project-search";
