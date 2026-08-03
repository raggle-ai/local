import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  githubAuthenticatedAccounts,
  githubCliPath,
  githubPullRequestsBrowserUrl,
  discoverProjectIcon,
  discoverLocalProjects,
  mergeRaggleProjectConfig,
  readImportedRepositoryPlugins,
  raggleProjectConfigFromProjectActionConfigs,
} from "../dist/index.js";

const repository = {
  owner: "raggle-ai",
  repo: "local",
  browserUrl: "https://github.com/raggle-ai/local",
};

assert.equal(typeof githubCliPath(), "string");
assert.equal(typeof githubAuthenticatedAccounts, "function");
assert.equal(typeof mergeRaggleProjectConfig, "function");
assert.equal(githubPullRequestsBrowserUrl(repository), "https://github.com/raggle-ai/local/pulls");
assert.equal(
  githubPullRequestsBrowserUrl(repository, ["alice", "bob"]),
  "https://github.com/raggle-ai/local/pulls?q=is%3Apr%20is%3Aopen%20author%3Aalice%20author%3Abob",
);

const mergedConfig = raggleProjectConfigFromProjectActionConfigs([
  {
    tags: ["cli", "shared"],
    folders: ["team-a"],
    subpaths: ["apps/web"],
    ignoredSubpaths: ["dist"],
  },
  {
    tags: ["shared", "ui"],
    folders: ["team-b"],
    subpaths: [{ path: "apps/api" }],
    allSubpath: true,
    removePathFromName: true,
  },
]);

assert.deepEqual(mergedConfig.tags, ["cli", "shared", "ui"]);
assert.deepEqual(mergedConfig.folders, ["team-a", "team-b"]);
assert.deepEqual(mergedConfig.subpaths, [{ path: "apps/web" }, { path: "apps/api" }]);
assert.equal(mergedConfig.allSubpath, true);
assert.equal(mergedConfig.removePathFromName, true);

const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "raggle-local-public-api-"));

try {
  const logoPath = path.join(tempDirectory, "logo.png");
  writeFileSync(logoPath, "fixture");
  assert.equal(discoverProjectIcon(tempDirectory), logoPath);

  const importFile = path.join(tempDirectory, "projects.json");
  writeFileSync(
    importFile,
    JSON.stringify(
      {
        plugins: ["./plugins/local-plugin", "~/plugins/home-plugin", "@raggle/plugin-a"],
        projects: [{ url: "https://github.com/raggle-ai/local.git" }],
      },
      null,
      2,
    ),
  );

  const plugins = readImportedRepositoryPlugins(importFile);

  assert.equal(plugins.length, 3);
  assert.equal(plugins[0], path.resolve(tempDirectory, "plugins/local-plugin"));
  assert.equal(plugins[1], path.join(os.homedir(), "plugins/home-plugin"));
  assert.equal(plugins[2], "@raggle/plugin-a");

  const cloneDirectory = path.join(tempDirectory, "clones");
  const worktree = path.join(cloneDirectory, "example");
  mkdirSync(path.join(worktree, ".git"), { recursive: true });
  writeFileSync(
    path.join(worktree, ".git", "config"),
    '[remote "origin"]\n  url = https://github.com/raggle-ai/example.git\n',
  );
  writeFileSync(path.join(worktree, ".git", "HEAD"), "ref: refs/heads/main\n");

  const discovered = await discoverLocalProjects({ cloneDirectory });
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].worktree, worktree);
  assert.equal(discovered[0].name, "example");
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

console.log("public API checks passed");
