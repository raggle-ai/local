import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import raggleLocal from "../dist/index.js";

const { applyLocalProjectDelta, createLocalProjectUpdate, loadLocalProjects } = raggleLocal;

function project(worktree, overrides = {}) {
  return {
    id: worktree,
    worktree,
    name: path.basename(worktree),
    sandboxCount: 0,
    hasIcon: false,
    isSessionOnly: false,
    isFavorite: false,
    relatedIds: [],
    remoteUrl: `https://github.com/example/${path.basename(worktree)}`,
    isCloned: true,
    repositoryRoot: worktree,
    ...overrides,
  };
}

const previousItems = [project("/projects/root", { name: "Old root" }), project("/projects/root/packages/stale")];
const repositoryItems = [project("/projects/root", { name: "Updated root" }), project("/projects/new")];
const repositoryUpdate = createLocalProjectUpdate(previousItems, repositoryItems, "repositories");

assert.equal(repositoryUpdate.phase, "repositories");
assert.equal(repositoryUpdate.authoritative, false);
assert.deepEqual(
  repositoryUpdate.delta.upserted.map((item) => item.worktree),
  ["/projects/root", "/projects/new"],
);
assert.deepEqual(repositoryUpdate.delta.removedWorktrees, []);
assert.deepEqual(
  applyLocalProjectDelta(previousItems, repositoryUpdate.delta).map((item) => item.worktree),
  ["/projects/root", "/projects/root/packages/stale", "/projects/new"],
);

const finalItems = [
  project("/projects/root", { name: "Updated root" }),
  project("/projects/new"),
  project("/projects/root/packages/current"),
];
const finalUpdate = createLocalProjectUpdate(previousItems, finalItems, "subpaths");

assert.equal(finalUpdate.authoritative, true);
assert.deepEqual(finalUpdate.delta.removedWorktrees, ["/projects/root/packages/stale"]);
assert.deepEqual(
  applyLocalProjectDelta(previousItems, finalUpdate.delta).map((item) => item.worktree),
  ["/projects/root", "/projects/new", "/projects/root/packages/current"],
);

const cloneDirectory = mkdtempSync(path.join(os.tmpdir(), "raggle-local-updates-"));
const updates = [];
const legacyUpdates = [];

try {
  const result = await loadLocalProjects([], {
    cloneDirectory,
    previousItems,
    onUpdate: (items, update) => {
      updates.push(update);
      legacyUpdates.push(items);
    },
  });

  assert.deepEqual(
    updates.map((update) => [update.phase, update.authoritative]),
    [
      ["repositories", false],
      ["resolved", false],
      ["subpaths", true],
    ],
  );
  assert.deepEqual(updates.at(-1).items, result);
  assert.deepEqual(
    updates.at(-1).delta.removedWorktrees,
    previousItems.map((item) => item.worktree),
  );
  assert.equal(legacyUpdates.length, 3);
} finally {
  rmSync(cloneDirectory, { recursive: true, force: true });
}

console.log("project update phases and deltas verified");
