import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import os from "node:os";
import path from "node:path";

const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "raggle-local-cli-"));
const cliPath = path.join(process.cwd(), "dist/cli.js");

function list(args, cwd = process.cwd()) {
  return JSON.parse(
    execFileSync(process.execPath, [cliPath, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
}

try {
  const databasePath = path.join(tempDirectory, "projects.db");
  const databaseUrl = `file:${databasePath}`;
  const client = createClient({ url: databaseUrl });
  await client.execute(`create table projects (
    url text primary key,
    name text,
    description text,
    tags_json text,
    folders_json text,
    subpaths_json text,
    clone_path_template text,
    all_subpath integer,
    remove_path_from_name integer,
    deleted_at text
  )`);
  await client.execute({
    sql: `insert into projects values (?, ?, ?, ?, ?, ?, ?, ?, ?, null)`,
    args: [
      "https://github.com/bakerstreetco/skills",
      "Skills",
      "Shared skills",
      '["shared"]',
      '[]',
      '[{"path":"commands","allSubpath":true}]',
      null,
      1,
      0,
    ],
  });
  client.close();

  const config = JSON.parse(
    execFileSync(process.execPath, [cliPath, "config", "bakerstreetco/skills", "--database-url", databaseUrl], {
      encoding: "utf8",
    }),
  );
  assert.deepEqual(config, {
    repository: "https://github.com/bakerstreetco/skills",
    source: "remote-database",
    name: "Skills",
    description: "Shared skills",
    tags: ["shared"],
    folders: [],
    subpaths: [{ path: "commands", allSubpath: true }],
    allSubpaths: true,
    removePathFromName: false,
  });

  const missingConfig = spawnSync(
    process.execPath,
    [cliPath, "config", "bakerstreetco/missing", "--database-url", databaseUrl],
    { encoding: "utf8" },
  );
  assert.equal(missingConfig.status, 1);
  assert.match(missingConfig.stderr, /Repository is not configured in the remote database: bakerstreetco\/missing/);

  const repositoryRoot = path.join(tempDirectory, "main");
  const folder = path.join(repositoryRoot, "happysoft");
  const child = path.join(folder, "accounting");
  const grandchild = path.join(child, "invoices");
  mkdirSync(path.join(repositoryRoot, ".git"), { recursive: true });
  mkdirSync(grandchild, { recursive: true });
  mkdirSync(path.join(repositoryRoot, "other"), { recursive: true });
  writeFileSync(
    path.join(repositoryRoot, ".git", "config"),
    '[remote "origin"]\n  url = https://github.com/raggle-ai/main.git\n',
  );
  writeFileSync(path.join(repositoryRoot, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(path.join(repositoryRoot, "raggle.json"), JSON.stringify({ collapseSubpaths: true }));
  writeFileSync(path.join(folder, "raggle.json"), JSON.stringify({ allTopLevelFolders: true }));

  // The selected folder is a discovery boundary: its shallow setting must
  // override the enclosing repository's recursive collapseSubpaths setting.
  assert.deepEqual(list(["list", "--folder", folder]), [child]);
  assert.deepEqual(list(["--folder", folder, "list"]), [child]);
  assert.deepEqual(list(["list"], folder), [realpathSync(child)]);

  writeFileSync(path.join(repositoryRoot, "raggle.json"), JSON.stringify({ allTopLevelFolders: true }));
  assert.deepEqual(list(["list", "--folder", repositoryRoot]), [folder, path.join(repositoryRoot, "other")]);

  writeFileSync(
    path.join(folder, "raggle.json"),
    '{\n  "$schema": "https://raggle.co/config.json",\n  "schemaVersion": 1,\n}\n',
  );
  const invalidConfig = spawnSync(process.execPath, [cliPath, "list"], {
    cwd: folder,
    encoding: "utf8",
  });
  assert.equal(invalidConfig.status, 1);
  assert.equal(invalidConfig.stdout, "");
  assert.match(invalidConfig.stderr, /Invalid Raggle config:/);
  assert.match(invalidConfig.stderr, /Trailing commas are not valid JSON at line 3, column 21/);
  assert.match(invalidConfig.stderr, /"schemaVersion": 1,\n {20}\^/);
  assert.doesNotMatch(invalidConfig.stderr, /at JSON\.parse|parseRaggleProjectConfig/);
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

console.log("CLI checks passed");
