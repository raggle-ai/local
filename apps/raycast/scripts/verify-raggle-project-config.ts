import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadImportedRepositoriesFromRows,
  mergeRaggleProjectConfig,
  readRaggleProjectConfig,
  readSubpathChildDirectories,
} from "@raggle-ai/local";

const defaultRemoteUrl = "https://gitlab.com/baker-street/cdp-index.git";
const expectedSubpaths = ["connectors", "projects", "partners"];
const expectedChildrenBySubpath = {
  connectors: ["posthog", "slack", "typeform"],
  projects: ["adapt-action-explorer", "cdp-ask-ai"],
  partners: ["baker-street", "briink", "geospatial-ops", "google"],
} satisfies Record<string, string[]>;

function writeFixtureRepository() {
  const repositoryPath = mkdtempSync(path.join(os.tmpdir(), "raggle-project-config-"));
  writeFileSync(
    path.join(repositoryPath, "raggle.json"),
    `${JSON.stringify(
      {
        tags: ["cdp", "baker-street"],
        subpaths: expectedSubpaths.map((subpath) => ({ path: subpath, removePathFromName: true })),
        ignoredSubpaths: [".raggle"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  for (const [subpath, children] of Object.entries(expectedChildrenBySubpath)) {
    for (const child of children) mkdirSync(path.join(repositoryPath, subpath, child), { recursive: true });
  }

  return repositoryPath;
}

function verifyProjectConfig(repositoryPath: string, remoteUrl: string) {
  const [repository] = loadImportedRepositoriesFromRows([{ url: remoteUrl }]);
  const config = readRaggleProjectConfig(repositoryPath);
  const merged = mergeRaggleProjectConfig(repository, config);

  assert.equal(merged.name ?? merged.repository, "cdp-index");
  assert.equal(merged.hasCustomName, false);
  assert.deepEqual(merged.tags, ["cdp", "baker-street"]);
  assert.deepEqual(
    merged.subpaths.map((subpath) => subpath.path),
    expectedSubpaths,
  );
  assert.equal(
    merged.subpaths.every((subpath) => subpath.removePathFromName === true),
    true,
  );

  for (const subpath of expectedSubpaths) {
    const directory = path.join(repositoryPath, subpath);
    const children = readSubpathChildDirectories(directory);
    assert.ok(children.length > 0, `${subpath} should contain searchable child folders`);
    console.log(`${subpath}: ${children.map((child) => path.basename(child)).join(", ")}`);
  }

  console.log(`Verified raggle.json project config for ${repositoryPath}`);
}

const repositoryPath = process.argv[2] ?? writeFixtureRepository();
const remoteUrl = process.argv[3] ?? defaultRemoteUrl;

try {
  verifyProjectConfig(repositoryPath, remoteUrl);
} finally {
  if (!process.argv[2]) rmSync(repositoryPath, { recursive: true, force: true });
}
