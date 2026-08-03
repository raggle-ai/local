import {
  mergeLocalProjectMetadata,
  projectKeywords,
  standardProjectWithKeywords,
  type LocalProject,
} from "@raggle-ai/local";
import { maxProgressiveIconHydrationProjects } from "@raggle-ai/raycast-adapter";
import { discoverProjectIcon, hydrateProjectIcons } from "./project-store";

export { projectKeywords, standardProjectWithKeywords };

function iconOwnerWorktrees(items: LocalProject[]) {
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

function branchIconOwnerItems(items: LocalProject[], iconOwners: Set<string>) {
  return items.filter((item) => Boolean(item.relativePath) && iconOwners.has(item.worktree));
}

function rootIconOwnerItems(items: LocalProject[], iconOwners: Set<string>) {
  return items.filter((item) => !item.relativePath && iconOwners.has(item.worktree));
}

export async function hydrateStandardProjectMetadata(
  items: LocalProject[],
  options?: { force?: boolean; onUpdate?: (items: LocalProject[]) => void },
) {
  const onUpdate = options?.onUpdate;
  const hydrateProgressively = Boolean(onUpdate && items.length <= maxProgressiveIconHydrationProjects);
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
          onUpdate?.(mergeLocalProjectMetadata(items, [...hydratedBranchIconOwners, ...updated]));
        }
      : undefined,
    options,
  );
  return mergeLocalProjectMetadata(items, [...hydratedBranchIconOwners, ...hydratedRootIconOwners]);
}
