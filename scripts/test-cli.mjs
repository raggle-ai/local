import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
  const repositoryRoot = path.join(tempDirectory, "main");
  const folder = path.join(repositoryRoot, "happysoft");
  const child = path.join(folder, "accounting");
  mkdirSync(path.join(repositoryRoot, ".git"), { recursive: true });
  mkdirSync(child, { recursive: true });
  mkdirSync(path.join(repositoryRoot, "other"), { recursive: true });
  writeFileSync(
    path.join(repositoryRoot, ".git", "config"),
    '[remote "origin"]\n  url = https://github.com/raggle-ai/main.git\n',
  );
  writeFileSync(path.join(repositoryRoot, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(path.join(repositoryRoot, "raggle.json"), JSON.stringify({ allSubpaths: true }));

  assert.deepEqual(list(["list", "--folder", folder]), [child]);
  assert.deepEqual(list(["--folder", folder, "list"]), [child]);
  assert.deepEqual(list(["list"], folder), [realpathSync(child)]);
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

console.log("CLI checks passed");
