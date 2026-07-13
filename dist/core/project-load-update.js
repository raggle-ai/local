"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLocalProjectUpdate = createLocalProjectUpdate;
exports.applyLocalProjectDelta = applyLocalProjectDelta;
const node_util_1 = require("node:util");
function createLocalProjectUpdate(previousItems, items, phase) {
    const authoritative = phase === "subpaths";
    const previousByWorktree = new Map(previousItems.map((item) => [item.worktree, item]));
    const currentWorktrees = new Set(items.map((item) => item.worktree));
    const upserted = items.filter((item) => {
        const previousItem = previousByWorktree.get(item.worktree);
        return !previousItem || !(0, node_util_1.isDeepStrictEqual)(previousItem, item);
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
function applyLocalProjectDelta(currentItems, delta) {
    const removedWorktrees = new Set(delta.removedWorktrees);
    const upsertedByWorktree = new Map(delta.upserted.map((item) => [item.worktree, item]));
    const existingItems = currentItems.flatMap((item) => {
        if (removedWorktrees.has(item.worktree))
            return [];
        const updatedItem = upsertedByWorktree.get(item.worktree);
        if (!updatedItem)
            return [item];
        upsertedByWorktree.delete(item.worktree);
        return [updatedItem];
    });
    return [...existingItems, ...upsertedByWorktree.values()];
}
