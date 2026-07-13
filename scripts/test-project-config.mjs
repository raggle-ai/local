import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadImportedRepositoriesFromRows, loadLocalProjects, readRaggleProjectConfig } from "../dist/index.js";

const cloneDirectory = mkdtempSync(path.join(os.tmpdir(), "raggle-local-project-config-"));
const worktree = path.join(cloneDirectory, "anduimagui-raycast-essentials");

try {
  mkdirSync(path.join(worktree, ".git"), { recursive: true });
  writeFileSync(
    path.join(worktree, ".git", "config"),
    '[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://github.com/anduimagui/raycast-essentials\n',
  );
  writeFileSync(path.join(worktree, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(
    path.join(worktree, "raggle.json"),
    `${JSON.stringify({ schemaVersion: 1, name: "Raycast Essentials", tags: ["raycast"] }, null, 2)}\n`,
  );

  const config = readRaggleProjectConfig(worktree);
  assert.equal("name" in config, false);
  assert.deepEqual(config.tags, ["raycast"]);

  const repositories = loadImportedRepositoriesFromRows([
    { url: "https://github.com/anduimagui/raycast-essentials" },
  ]);
  const updateNames = [];
  const projects = await loadLocalProjects(repositories, {
    cloneDirectory,
    onUpdate(items) {
      const project = items.find((item) => item.worktree === worktree);
      if (project?.name) updateNames.push(project.name);
    },
  });
  const project = projects.find((item) => item.worktree === worktree);

  assert.ok(project, "Expected the fixture repository to load");
  assert.equal(project.name, "raycast-essentials");
  assert.equal(project.hasCustomName, false);
  assert.deepEqual(project.tags, ["raycast"]);
  assert.deepEqual([...new Set(updateNames)], ["raycast-essentials"]);
} finally {
  rmSync(cloneDirectory, { recursive: true, force: true });
}

console.log("project config checks passed");
