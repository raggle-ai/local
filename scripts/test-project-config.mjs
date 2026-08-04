import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadImportedRepositoriesFromRows, loadLocalProjects, readRaggleProjectConfig } from "../dist/index.js";

const cloneDirectory = mkdtempSync(path.join(os.tmpdir(), "raggle-local-project-config-"));
const worktree = path.join(cloneDirectory, "example-raycast-essentials");

try {
  mkdirSync(path.join(worktree, ".git"), { recursive: true });
  writeFileSync(
    path.join(worktree, ".git", "config"),
    '[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://github.com/example/raycast-essentials\n',
  );
  writeFileSync(path.join(worktree, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(
    path.join(worktree, "raggle.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        name: "Raycast Essentials",
        tags: ["raycast"],
        collapseSubpaths: true,
        ignoredSubpaths: ["cache"],
        excludeFolders: ["scripts"],
      },
      null,
      2,
    )}\n`,
  );
  mkdirSync(path.join(worktree, "commands"));
  mkdirSync(path.join(worktree, "commands", "scripts"));
  mkdirSync(path.join(worktree, "commands", "scripts", "deep"));
  mkdirSync(path.join(worktree, "commands", "cache"));
  mkdirSync(path.join(worktree, "__pycache__"));
  mkdirSync(path.join(worktree, "_generated"));
  mkdirSync(path.join(worktree, "workspace", "apps", "web"), { recursive: true });
  mkdirSync(path.join(worktree, "workspace", "apps", "generated"));
  writeFileSync(
    path.join(worktree, "workspace", "raggle.json"),
    JSON.stringify({ collapseSubpaths: true, ignoredSubpaths: ["generated"] }),
  );
  mkdirSync(path.join(worktree, "scripts"));

  const config = readRaggleProjectConfig(worktree);
  assert.equal("name" in config, false);
  assert.deepEqual(config.tags, ["raycast"]);
  assert.equal(config.collapseSubpaths, true);
  assert.deepEqual(config.ignoredSubpaths, ["cache"]);
  assert.deepEqual(config.excludeFolders, ["scripts"]);

  const repositories = loadImportedRepositoriesFromRows([{ url: "https://github.com/example/raycast-essentials" }]);
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
  assert.ok(
    projects.some((item) => item.relativePath === "commands"),
    "Expected collapseSubpaths to make an unlisted child folder searchable",
  );
  assert.equal(
    projects.some((item) => item.relativePath === "scripts"),
    false,
    "Expected excludeFolders to hide the matching top-level folder",
  );
  assert.ok(
    projects.some((item) => item.relativePath === "commands/scripts"),
    "Expected collapseSubpaths to expand child folders",
  );
  assert.ok(
    projects.some((item) => item.relativePath === "commands/scripts/deep"),
    "Expected collapseSubpaths to recursively expand folders at every depth",
  );
  assert.equal(
    projects.some((item) => item.relativePath === "commands/cache"),
    false,
    "Expected root ignoredSubpaths to apply inside collapsed subpath folders",
  );
  assert.equal(
    projects.some((item) => item.relativePath?.split("/").some((segment) => segment.startsWith("_"))),
    false,
    "Expected internal and cache directories to be excluded from automatic discovery",
  );
  assert.ok(
    projects.some((item) => item.relativePath === "workspace/apps/web"),
    "Expected collapseSubpaths in a nested folder config to expand that folder's descendants",
  );
  assert.equal(
    projects.some((item) => item.relativePath === "workspace/apps/generated"),
    false,
    "Expected nested ignoredSubpaths to apply throughout that config's subtree",
  );

  const comparisonWorktree = path.join(cloneDirectory, "scope-comparison");
  mkdirSync(path.join(comparisonWorktree, ".git"), { recursive: true });
  writeFileSync(
    path.join(comparisonWorktree, ".git", "config"),
    '[remote "origin"]\n  url = https://github.com/raggle-ai/scope-comparison.git\n',
  );
  writeFileSync(path.join(comparisonWorktree, ".git", "HEAD"), "ref: refs/heads/main\n");
  mkdirSync(path.join(comparisonWorktree, "alpha", "one", "deep"), { recursive: true });
  mkdirSync(path.join(comparisonWorktree, "beta", "two"), { recursive: true });

  const comparisonRepositories = loadImportedRepositoriesFromRows([
    { url: "https://github.com/raggle-ai/scope-comparison.git" },
  ]);
  writeFileSync(path.join(comparisonWorktree, "raggle.json"), JSON.stringify({ allTopLevelFolders: true }));
  const topLevelProjects = await loadLocalProjects(comparisonRepositories, { cloneDirectory, force: true });
  const topLevelPaths = topLevelProjects.flatMap((item) => (item.relativePath ? [item.relativePath] : [])).sort();
  assert.deepEqual(topLevelPaths, ["alpha", "beta"]);

  writeFileSync(path.join(comparisonWorktree, "raggle.json"), JSON.stringify({ allSubpaths: true }));
  assert.equal(readRaggleProjectConfig(comparisonWorktree).allTopLevelFolders, true);
  const shimProjects = await loadLocalProjects(comparisonRepositories, { cloneDirectory, force: true });
  const shimPaths = shimProjects.flatMap((item) => (item.relativePath ? [item.relativePath] : [])).sort();
  assert.deepEqual(shimPaths, topLevelPaths);

  writeFileSync(path.join(comparisonWorktree, "raggle.json"), JSON.stringify({ collapseSubpaths: true }));
  const collapsedProjects = await loadLocalProjects(comparisonRepositories, { cloneDirectory, force: true });
  const collapsedPaths = collapsedProjects.flatMap((item) => (item.relativePath ? [item.relativePath] : [])).sort();
  assert.deepEqual(collapsedPaths, ["alpha", "alpha/one", "alpha/one/deep", "beta", "beta/two"]);
  assert.equal(topLevelPaths.length, 2);
  assert.equal(collapsedPaths.length, 5);

  writeFileSync(path.join(comparisonWorktree, "raggle.json"), "{}");
  const remoteShimRepositories = loadImportedRepositoriesFromRows([
    { url: "https://github.com/raggle-ai/scope-comparison.git", allSubpath: true },
  ]);
  const remoteShimProjects = await loadLocalProjects(remoteShimRepositories, { cloneDirectory, force: true });
  const remoteShimPaths = remoteShimProjects.flatMap((item) => (item.relativePath ? [item.relativePath] : [])).sort();
  assert.deepEqual(remoteShimPaths, topLevelPaths);

  const remoteCollapsedRepositories = loadImportedRepositoriesFromRows([
    { url: "https://github.com/raggle-ai/scope-comparison.git", collapseSubpaths: true },
  ]);
  const remoteCollapsedProjects = await loadLocalProjects(remoteCollapsedRepositories, {
    cloneDirectory,
    force: true,
  });
  const remoteCollapsedPaths = remoteCollapsedProjects
    .flatMap((item) => (item.relativePath ? [item.relativePath] : []))
    .sort();
  assert.deepEqual(remoteCollapsedPaths, collapsedPaths);

  console.log(`scope comparison: allSubpaths=${shimPaths.length}, collapseSubpaths=${collapsedPaths.length}`);

  const invalidConfigDirectory = path.join(cloneDirectory, "invalid-config");
  mkdirSync(invalidConfigDirectory);
  writeFileSync(path.join(invalidConfigDirectory, "raggle.json"), '{\n  "schemaVersion": 1,\n}\n');
  assert.throws(
    () => readRaggleProjectConfig(invalidConfigDirectory),
    (error) => {
      assert.equal(error.name, "RaggleProjectConfigParseError");
      assert.equal(error.configPath, path.join(invalidConfigDirectory, "raggle.json"));
      assert.match(error.message, /Trailing commas are not valid JSON at line 2, column 21/);
      assert.match(error.message, /"schemaVersion": 1,\n {20}\^/);
      return true;
    },
  );
} finally {
  rmSync(cloneDirectory, { recursive: true, force: true });
}

console.log("project config checks passed");
