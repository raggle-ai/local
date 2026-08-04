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
  discoverLocalProjectsUnderFolder,
  applyProjectActionPlugins,
  mergeLocalProjectMetadata,
  mergeRaggleProjectConfig,
  repositoryRemoteMetadata,
  readImportedRepositoryPlugins,
  raggleProjectConfigFromProjectActionConfigs,
  projectWithKeywords,
} from "../dist/index.js";
import raggleLocal from "../dist/index.js";

const repository = {
  owner: "raggle-ai",
  repo: "local",
  browserUrl: "https://github.com/raggle-ai/local",
};

assert.deepEqual(projectWithKeywords({ worktree: "/tmp/example", name: "Example" }).keywords, [
  "/tmp/example",
  "tmp",
  "example",
  "Example",
]);
assert.equal(raggleLocal.standardProjectWithKeywords, undefined);

assert.deepEqual(repositoryRemoteMetadata("git@github.com:raggle-ai/local.git"), {
  provider: "github",
  host: "github.com",
  owner: "raggle-ai",
  repository: "local",
});

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
    collapseSubpaths: true,
    removePathFromName: true,
  },
]);

assert.deepEqual(mergedConfig.tags, ["cli", "shared", "ui"]);
assert.deepEqual(mergedConfig.folders, ["team-a", "team-b"]);
assert.deepEqual(mergedConfig.subpaths, [{ path: "apps/web" }, { path: "apps/api" }]);
assert.equal(mergedConfig.allSubpaths, true);
assert.equal(mergedConfig.collapseSubpaths, true);
assert.equal(mergedConfig.allTopLevelFolders, true);
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

  const actionDirectory = path.join(tempDirectory, "actions");
  mkdirSync(path.join(actionDirectory, "plugins"), { recursive: true });
  assert.deepEqual(
    applyProjectActionPlugins(
      [{ remoteUrl: "https://github.com/raggle-ai/local", repository: "local", plugins: [] }],
      [actionDirectory],
    )[0].plugins,
    [path.join(actionDirectory, "plugins")],
  );

  const repositoryProject = {
    id: "root",
    worktree: path.join(tempDirectory, "metadata-root"),
    name: "Configured Name",
    sandboxCount: 0,
    hasIcon: false,
    isSessionOnly: false,
    isFavorite: false,
    relatedIds: [],
    remoteUrl: "https://github.com/raggle-ai/local",
    isCloned: true,
    repositoryRoot: path.join(tempDirectory, "metadata-root"),
  };
  const childProject = {
    ...repositoryProject,
    id: "child",
    worktree: path.join(repositoryProject.worktree, "apps", "web"),
    name: "web",
    relativePath: "apps/web",
  };
  const [mergedRoot, mergedChild] = mergeLocalProjectMetadata([repositoryProject, childProject], [
    {
      worktree: repositoryProject.worktree,
      name: "Hydrated Name",
      icon: "/tmp/icon.png",
      sandboxCount: 2,
      hasIcon: true,
      isSessionOnly: false,
      isFavorite: true,
      relatedIds: ["session-1"],
    },
  ]);
  assert.equal(mergedRoot.name, "Hydrated Name");
  assert.equal(mergedRoot.sandboxCount, 2);
  assert.equal(mergedChild.icon, "/tmp/icon.png");

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

  const repositoryRoot = path.join(tempDirectory, "main");
  const scopedFolder = path.join(repositoryRoot, "happysoft");
  const scopedChild = path.join(scopedFolder, "accounting");
  const otherFolder = path.join(repositoryRoot, "other");
  mkdirSync(path.join(repositoryRoot, ".git"), { recursive: true });
  mkdirSync(scopedChild, { recursive: true });
  mkdirSync(otherFolder, { recursive: true });
  writeFileSync(
    path.join(repositoryRoot, ".git", "config"),
    '[remote "origin"]\n  url = https://github.com/raggle-ai/main.git\n',
  );
  writeFileSync(path.join(repositoryRoot, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(path.join(repositoryRoot, "raggle.json"), JSON.stringify({ collapseSubpaths: true }));

  const scoped = await discoverLocalProjectsUnderFolder({ folder: scopedFolder });
  assert.deepEqual(
    scoped.map((project) => project.worktree),
    [scopedChild],
  );

  const repositoryChildren = await discoverLocalProjectsUnderFolder({ folder: repositoryRoot });
  assert.deepEqual(
    repositoryChildren.map((project) => project.worktree).sort(),
    [scopedFolder, scopedChild, otherFolder].sort(),
  );
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

console.log("public API checks passed");
