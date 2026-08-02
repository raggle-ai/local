import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "package.json"));
const entryPath = require.resolve("@raggle-ai/local");
let packageDirectory = path.dirname(entryPath);

while (!existsSync(path.join(packageDirectory, "package.json"))) {
  const parentDirectory = path.dirname(packageDirectory);
  assert.notEqual(parentDirectory, packageDirectory, "Could not locate @raggle-ai/local package.json");
  packageDirectory = parentDirectory;
}

const packageMetadata = JSON.parse(readFileSync(path.join(packageDirectory, "package.json"), "utf8"));
const extensionMetadata = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
const api = require("@raggle-ai/local");
const requiredRuntimeExports = [
  "deriveLocalProjectPath",
  "discoverProjectIcon",
  "githubAuthenticatedAccounts",
  "githubCliPath",
  "githubSearchUsers",
  "latestSessionForWorktree",
  "listVisibleProjects",
  "loadImportedRepositoriesFromRows",
  "loadLocalProjects",
  "mergeRaggleProjectConfig",
  "normalizeRepositoryUrl",
  "normalizeSubpaths",
  "projectKeywords",
  "raggleProjectConfigFromProjectActionConfigs",
  "readImportedRepositoryPlugins",
  "readImportedRepositoryRows",
  "readRaggleProjectConfig",
  "writeImportedRepositoryRows",
];

assert.equal(packageMetadata.name, "@raggle-ai/local");
assert.equal(packageMetadata.version, extensionMetadata.dependencies["@raggle-ai/local"]);
assert.equal(packageDirectory.includes(`${path.sep}packages${path.sep}raggle-local`), false);
assert.equal(
  api.mergeRaggleProjectConfig(
    {
      remoteUrl: "https://github.com/raggle-ai/local",
      repository: "local",
      hasCustomName: false,
      tags: [],
      subpaths: [],
      allSubpath: false,
      folders: [],
      plugins: [],
      removePathFromName: false,
    },
    { allSubpaths: true },
  ).allSubpath,
  true,
);

for (const exportName of requiredRuntimeExports) {
  assert.equal(typeof api[exportName], "function", `Missing runtime export: ${exportName}`);
}

async function verifyExcludeFoldersDiscovery() {
  const cloneDirectory = mkdtempSync(path.join(os.tmpdir(), "raggle-raycast-local-package-"));
  const worktree = path.join(cloneDirectory, "raggle-ai-exclude-folders-fixture");

  try {
    mkdirSync(path.join(worktree, ".git"), { recursive: true });
    writeFileSync(
      path.join(worktree, ".git", "config"),
      '[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://github.com/raggle-ai/exclude-folders-fixture\n',
    );
    writeFileSync(path.join(worktree, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(
      path.join(worktree, "raggle.json"),
      JSON.stringify({
        allSubpaths: true,
        excludeFolders: ["archive"],
        subpaths: [{ path: "projects", allSubpath: true }],
      }),
    );
    mkdirSync(path.join(worktree, "archive", "hidden"), { recursive: true });
    mkdirSync(path.join(worktree, "commands"), { recursive: true });
    writeFileSync(path.join(worktree, "commands", "raggle.json"), JSON.stringify({ allSubpaths: true }));
    mkdirSync(path.join(worktree, "commands", "group", "item"), { recursive: true });
    mkdirSync(path.join(worktree, "projects", "archive"), { recursive: true });

    const repositories = api.loadImportedRepositoriesFromRows([
      { url: "https://github.com/raggle-ai/exclude-folders-fixture" },
    ]);
    const projects = await api.loadLocalProjects(repositories, { cloneDirectory, force: true });
    const relativePaths = projects.map((project) => project.relativePath).filter(Boolean);

    assert.equal(relativePaths.includes("archive"), false);
    assert.equal(relativePaths.some((relativePath) => relativePath.startsWith("archive/")), false);
    assert.equal(relativePaths.includes("commands"), true);
    assert.equal(relativePaths.includes("commands/group/item"), true);
    assert.equal(relativePaths.includes("projects/archive"), true);
  } finally {
    rmSync(cloneDirectory, { recursive: true, force: true });
  }
}

await verifyExcludeFoldersDiscovery();

console.log(`verified ${packageMetadata.name}@${packageMetadata.version} from ${packageDirectory}`);
