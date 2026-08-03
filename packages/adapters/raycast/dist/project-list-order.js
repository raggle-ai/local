"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preserveProjectOrder = preserveProjectOrder;
exports.recordRecentSelection = recordRecentSelection;
exports.resetRecentSelection = resetRecentSelection;
exports.sortNonFavouritesByRecentSelection = sortNonFavouritesByRecentSelection;
function preserveProjectOrder(currentItems, updatedItems) {
    const updatedByWorktree = new Map(updatedItems.map((item) => [item.worktree, item]));
    const existingItems = currentItems.flatMap((item) => {
        const updatedItem = updatedByWorktree.get(item.worktree);
        if (!updatedItem)
            return [];
        updatedByWorktree.delete(item.worktree);
        return [updatedItem];
    });
    return [...existingItems, ...updatedByWorktree.values()];
}
function recordRecentSelection(recentSelections, itemKey) {
    const nextSelections = recentSelections.filter((currentItemKey) => currentItemKey !== itemKey);
    nextSelections.unshift(itemKey);
    return nextSelections;
}
function resetRecentSelection(recentSelections, itemKey) {
    return recentSelections.filter((currentItemKey) => currentItemKey !== itemKey);
}
function sortNonFavouritesByRecentSelection(items, favourites, recentSelections, getItemKey) {
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
