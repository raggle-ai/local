import { isDeepStrictEqual } from "node:util";
import type { LocalProject, LocalProjectDelta, LocalProjectLoadPhase, LocalProjectUpdate } from "./types";

export function createLocalProjectUpdate(
  previousItems: readonly LocalProject[],
  items: LocalProject[],
  phase: LocalProjectLoadPhase,
): LocalProjectUpdate {
  const authoritative = phase === "subpaths";
  const previousByWorktree = new Map(previousItems.map((item) => [item.worktree, item]));
  const currentWorktrees = new Set(items.map((item) => item.worktree));
  const upserted = items.filter((item) => {
    const previousItem = previousByWorktree.get(item.worktree);
    return !previousItem || !isDeepStrictEqual(previousItem, item);
  });
  const removedWorktrees = authoritative
    ? previousItems.filter((item) => !currentWorktrees.has(item.worktree)).map((item) => item.worktree)
    : [];

  return {
    items,
    phase,
    authoritative,
    delta: { upserted, removedWorktrees },
  };
}

export function applyLocalProjectDelta(currentItems: LocalProject[], delta: LocalProjectDelta): LocalProject[] {
  const removedWorktrees = new Set(delta.removedWorktrees);
  const upsertedByWorktree = new Map(delta.upserted.map((item) => [item.worktree, item]));
  const existingItems = currentItems.flatMap((item) => {
    if (removedWorktrees.has(item.worktree)) return [];
    const updatedItem = upsertedByWorktree.get(item.worktree);
    if (!updatedItem) return [item];
    upsertedByWorktree.delete(item.worktree);
    return [updatedItem];
  });

  return [...existingItems, ...upsertedByWorktree.values()];
}
