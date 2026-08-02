type ProjectListItem = {
  worktree: string;
};

export function mergeProgressiveProjectUpdate<T extends ProjectListItem>(currentItems: T[], updatedItems: T[]): T[] {
  const updatedByWorktree = new Map(updatedItems.map((item) => [item.worktree, item]));
  const existingItems = currentItems.map((item) => {
    const updatedItem = updatedByWorktree.get(item.worktree);
    if (!updatedItem) return item;
    updatedByWorktree.delete(item.worktree);
    return updatedItem;
  });

  return [...existingItems, ...updatedByWorktree.values()];
}

export function preserveProjectOrder<T extends ProjectListItem>(currentItems: T[], updatedItems: T[]): T[] {
  const updatedByWorktree = new Map(updatedItems.map((item) => [item.worktree, item]));
  const existingItems = currentItems.flatMap((item) => {
    const updatedItem = updatedByWorktree.get(item.worktree);
    if (!updatedItem) return [];
    updatedByWorktree.delete(item.worktree);
    return [updatedItem];
  });

  return [...existingItems, ...updatedByWorktree.values()];
}
