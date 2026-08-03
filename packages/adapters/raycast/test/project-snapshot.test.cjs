const assert = require("node:assert/strict");
const { mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = (request, parent, isMain) => {
  if (request === "@raycast/api") return { environment: { supportPath: "/tmp/raycast/extensions/test" } };
  return originalLoad(request, parent, isMain);
};
const {
  raggleProjectSnapshotPath,
  readRaycastProjectsSnapshot,
  readRaggleProjectListSnapshot,
  readRaggleProjectSnapshot,
  writeRaycastProjectListState,
  writeRaycastProjectsSnapshot,
} = require("../dist/project-snapshot");
Module._load = originalLoad;

test("resolves the sibling Raggle extension snapshot", () => {
  const currentSupportPath = path.join("/tmp", "raycast", "extensions", "raycast-essentials");

  assert.equal(
    raggleProjectSnapshotPath({ currentSupportPath }),
    path.join("/tmp", "raycast", "extensions", "raggle", "standard-projects-snapshot.json"),
  );
});

test("applies shared favorite and recent-selection ordering", () => {
  const fixturePath = path.join(tmpdir(), `raggle-project-list-state-${process.pid}`, "snapshot.json");
  const project = (id) => ({
    id,
    worktree: `/tmp/${id}`,
    remoteUrl: `https://github.com/raggle-ai/${id}`,
    repositoryRoot: `/tmp/${id}`,
    sandboxCount: 0,
    hasIcon: false,
    isSessionOnly: false,
    isFavorite: false,
    relatedIds: [],
    isCloned: true,
  });
  mkdirSync(path.dirname(fixturePath), { recursive: true });
  writeFileSync(
    fixturePath,
    JSON.stringify({
      schemaVersion: 2,
      generatedAt: 123,
      items: [project("one"), project("two"), project("three")],
      listState: {
        favoriteWorktrees: ["/tmp/two"],
        recentSelectionWorktrees: ["/tmp/three", "/tmp/one"],
        updatedAt: 456,
      },
    }),
  );

  try {
    const snapshot = readRaggleProjectListSnapshot({ snapshotPath: fixturePath });
    assert.equal(snapshot.schemaVersion, 2);
    assert.equal(snapshot.generatedAt, 123);
    assert.deepEqual(
      snapshot.projects.map(({ worktree, isFavorite }) => ({ worktree, isFavorite })),
      [
        { worktree: "/tmp/two", isFavorite: true },
        { worktree: "/tmp/three", isFavorite: false },
        { worktree: "/tmp/one", isFavorite: false },
      ],
    );
  } finally {
    rmSync(path.dirname(fixturePath), { recursive: true });
  }
});

test("reads validated projects from the snapshot", () => {
  const fixturePath = path.join(tmpdir(), `raggle-project-snapshot-${process.pid}`, "snapshot.json");
  mkdirSync(path.dirname(fixturePath), { recursive: true });
  writeFileSync(
    fixturePath,
    JSON.stringify({
      items: [
        {
          id: "project-1",
          worktree: "/tmp/project-1",
          remoteUrl: "https://github.com/raggle-ai/project-1",
          repositoryRoot: "/tmp/project-1",
          sandboxCount: 0,
          hasIcon: false,
          isSessionOnly: false,
          isFavorite: false,
          relatedIds: [],
          isCloned: true,
        },
      ],
    }),
  );

  try {
    assert.equal(readRaggleProjectSnapshot({ snapshotPath: fixturePath }).length, 1);
  } finally {
    rmSync(path.dirname(fixturePath), { recursive: true });
  }
});

test("writes and validates the Raycast project snapshot contract", () => {
  const fixtureDirectory = path.join(tmpdir(), `raggle-project-snapshot-store-${process.pid}`);
  const fixturePath = path.join(fixtureDirectory, "snapshot.json");
  const sourcePath = path.join(fixtureDirectory, "projects.json");
  const project = {
    id: "project-1",
    worktree: "/tmp/project-1",
    remoteUrl: "https://github.com/raggle-ai/project-1",
    repositoryRoot: "/tmp/project-1",
    sandboxCount: 0,
    hasIcon: false,
    isSessionOnly: false,
    isFavorite: false,
    relatedIds: [],
    isCloned: true,
  };
  mkdirSync(fixtureDirectory, { recursive: true });
  writeFileSync(sourcePath, "[]");

  try {
    writeRaycastProjectsSnapshot(sourcePath, [project], { snapshotPath: fixturePath });
    writeRaycastProjectListState(
      { favoriteWorktrees: [project.worktree], recentSelectionWorktrees: [] },
      { snapshotPath: fixturePath },
    );
    const snapshot = readRaycastProjectsSnapshot(sourcePath, { snapshotPath: fixturePath });
    assert.equal(snapshot.items.length, 1);
    assert.deepEqual(snapshot.listState.favoriteWorktrees, [project.worktree]);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});
