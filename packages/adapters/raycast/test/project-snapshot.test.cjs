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
const { raggleProjectSnapshotPath, readRaggleProjectSnapshot } = require("../dist/project-snapshot");
Module._load = originalLoad;

test("resolves the sibling Raggle extension snapshot", () => {
  const currentSupportPath = path.join("/tmp", "raycast", "extensions", "raycast-essentials");

  assert.equal(
    raggleProjectSnapshotPath({ currentSupportPath }),
    path.join("/tmp", "raycast", "extensions", "raggle", "standard-projects-snapshot.json"),
  );
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
