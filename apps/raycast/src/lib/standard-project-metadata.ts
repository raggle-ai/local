import path from "node:path";
import { maxProgressiveIconHydrationProjects, projectKeywords, standardProjectWithKeywords } from "@raggle-ai/local";
import { discoverProjectIcon, hydrateProjectIcons, type Project } from "./project-store";
import { type StandardProjectSnapshotItem } from "./standard-project-cache";

export type StandardProject = StandardProjectSnapshotItem;

export { projectKeywords, standardProjectWithKeywords };

function resolvedProjectName(item: StandardProject, hydratedItem?: Project) {
  if (item.relativePath || item.hasCustomName) {
    return item.name;
  }

  return hydratedItem?.name;
}

function iconOwnerWorktrees(items: StandardProject[]) {
  const worktrees = new Set<string>();

  for (const item of items) {
    if (!item.relativePath) {
      worktrees.add(item.worktree);
      continue;
    }

    if (discoverProjectIcon(item.worktree)) {
      worktrees.add(item.worktree);
    }
  }

  return worktrees;
}

function branchIconOwnerItems(items: StandardProject[], iconOwners: Set<string>) {
  return items.filter((item) => Boolean(item.relativePath) && iconOwners.has(item.worktree));
}

function rootIconOwnerItems(items: StandardProject[], iconOwners: Set<string>) {
  return items.filter((item) => !item.relativePath && iconOwners.has(item.worktree));
}

function nearestInheritedIconSource(
  item: StandardProject,
  itemsByWorktree: Map<string, StandardProject>,
  hydratedByWorktree: Map<string, Project>,
) {
  if (!item.relativePath) return undefined;

  let currentDirectory = path.dirname(item.worktree);
  while (currentDirectory && currentDirectory !== item.worktree) {
    if (itemsByWorktree.has(currentDirectory)) {
      const hydrated = hydratedByWorktree.get(currentDirectory);
      if (hydrated?.icon) return hydrated;
    }

    const nextDirectory = path.dirname(currentDirectory);
    if (nextDirectory === currentDirectory) break;
    currentDirectory = nextDirectory;
  }

  return hydratedByWorktree.get(item.repositoryRoot);
}

function hydratedStandardProject(
  item: StandardProject,
  itemsByWorktree: Map<string, StandardProject>,
  hydratedByWorktree: Map<string, Project>,
) {
  const hydratedItem = hydratedByWorktree.get(item.worktree);
  const inheritedIcon = nearestInheritedIconSource(item, itemsByWorktree, hydratedByWorktree);
  if (!hydratedItem) {
    if (!inheritedIcon?.icon) return item;

    return standardProjectWithKeywords({
      ...item,
      icon: item.icon ?? inheritedIcon.icon,
      iconColor: item.iconColor ?? inheritedIcon.iconColor,
      tint: item.tint ?? inheritedIcon.tint,
      hasIcon: item.hasIcon || Boolean(inheritedIcon.icon),
    });
  }

  return standardProjectWithKeywords({
    ...item,
    name: resolvedProjectName(item, hydratedItem),
    worktreeName: hydratedItem.worktreeName,
    tags: hydratedItem.tags,
    latestSessionTitle: hydratedItem.latestSessionTitle,
    icon: hydratedItem.icon ?? inheritedIcon?.icon ?? item.icon,
    iconColor: hydratedItem.iconColor ?? inheritedIcon?.iconColor ?? item.iconColor,
    tint: hydratedItem.tint ?? inheritedIcon?.tint ?? item.tint,
    startupCommand: hydratedItem.startupCommand,
    sandboxCount: hydratedItem.sandboxCount,
    updatedAt: hydratedItem.updatedAt,
    hasIcon: hydratedItem.hasIcon || Boolean(inheritedIcon?.icon) || item.hasIcon,
    isSessionOnly: hydratedItem.isSessionOnly,
    isFavorite: hydratedItem.isFavorite,
    relatedIds: hydratedItem.relatedIds,
  });
}

export async function hydrateStandardProjectMetadata(
  items: StandardProject[],
  options?: { force?: boolean; onUpdate?: (items: StandardProject[]) => void },
) {
  const onUpdate = options?.onUpdate;
  const hydrateProgressively = Boolean(onUpdate && items.length <= maxProgressiveIconHydrationProjects);
  const itemsByWorktree = new Map(items.map((item) => [item.worktree, item]));
  const iconOwners = iconOwnerWorktrees(items);
  const hydratedBranchIconOwners = await hydrateProjectIcons(
    branchIconOwnerItems(items, iconOwners),
    () => {},
    options,
  );
  const hydratedRootIconOwners = await hydrateProjectIcons(
    rootIconOwnerItems(items, iconOwners),
    hydrateProgressively
      ? (updated) => {
          const updatedByWorktree = new Map(
            [...hydratedBranchIconOwners, ...updated].map((item) => [item.worktree, item]),
          );
          onUpdate?.(items.map((item) => hydratedStandardProject(item, itemsByWorktree, updatedByWorktree)));
        }
      : undefined,
    options,
  );
  const hydratedByWorktree = new Map(
    [...hydratedBranchIconOwners, ...hydratedRootIconOwners].map((item) => [item.worktree, item]),
  );

  return items.map((item) => hydratedStandardProject(item, itemsByWorktree, hydratedByWorktree));
}
