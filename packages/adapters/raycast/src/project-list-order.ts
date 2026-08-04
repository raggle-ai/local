type ProjectListItem = {
  worktree: string;
};

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

export function recordRecentSelection(recentSelections: string[], itemKey: string): string[] {
  const nextSelections = recentSelections.filter((currentItemKey) => currentItemKey !== itemKey);
  nextSelections.unshift(itemKey);
  return nextSelections;
}

export function resetRecentSelection(recentSelections: string[], itemKey: string): string[] {
  return recentSelections.filter((currentItemKey) => currentItemKey !== itemKey);
}

export function sortNonFavouritesByRecentSelection<T>(
  items: T[],
  favourites: string[],
  recentSelections: string[],
  getItemKey: (item: T) => string,
): T[] {
  const favouriteSet = new Set(favourites);
  const recentSelectionIndex = new Map(recentSelections.map((itemKey, index) => [itemKey, index]));

  return items
    .filter((item) => !favouriteSet.has(getItemKey(item)))
    .sort((a, b) => {
      const aIndex = recentSelectionIndex.get(getItemKey(a)) ?? Number.POSITIVE_INFINITY;
      const bIndex = recentSelectionIndex.get(getItemKey(b)) ?? Number.POSITIVE_INFINITY;
      return aIndex - bIndex;
    });
}
