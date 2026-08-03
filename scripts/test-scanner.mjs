import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverRepository, scanCloneDirectoryRepositories } from "../dist/scanner.js";

const root = mkdtempSync(path.join(os.tmpdir(), "raggle-local-scanner-"));

function makeRepository(relativePath, remoteUrl, branch = "main") {
  const worktree = path.join(root, relativePath);
  mkdirSync(path.join(worktree, ".git"), { recursive: true });
  writeFileSync(path.join(worktree, ".git", "config"), `[remote "origin"]\n  url = ${remoteUrl}\n`);
  writeFileSync(path.join(worktree, ".git", "HEAD"), `ref: refs/heads/${branch}\n`);
  return worktree;
}

try {
  const direct = makeRepository("direct", "git@github.com:raggle-ai/direct.git", "feature/worker");
  const nested = makeRepository("owners/raggle-ai/nested", "https://github.com/raggle-ai/nested.git");
  makeRepository("node_modules/ignored", "https://github.com/raggle-ai/ignored.git");
  makeRepository("owners/.hidden/ignored", "https://github.com/raggle-ai/hidden.git");

  const worktree = path.join(root, "owners", "raggle-ai", "linked-worktree");
  const worktreeGitDirectory = path.join(root, "worktree-metadata");
  mkdirSync(worktree, { recursive: true });
  mkdirSync(worktreeGitDirectory, { recursive: true });
  writeFileSync(path.join(worktree, ".git"), `gitdir: ${worktreeGitDirectory}\n`);
  writeFileSync(
    path.join(worktreeGitDirectory, "config"),
    '[remote "origin"]\n  url = https://github.com/raggle-ai/worktree.git\n',
  );
  writeFileSync(path.join(worktreeGitDirectory, "HEAD"), "ref: refs/heads/topic\n");

  const bare = path.join(root, "bare.git");
  mkdirSync(path.join(bare, "objects"), { recursive: true });
  mkdirSync(path.join(bare, "refs"), { recursive: true });
  writeFileSync(path.join(bare, "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(path.join(bare, "config"), '[remote "origin"]\n  url = https://github.com/raggle-ai/bare.git\n');

  const progressCounts = [];
  let eventLoopAdvanced = false;
  setImmediate(() => {
    eventLoopAdvanced = true;
  });
  const result = await scanCloneDirectoryRepositories(root, {
    maxDepth: 3,
    maxRepos: 20,
    onProgress(_repository, count) {
      progressCounts.push(count);
    },
  });

  assert.equal(eventLoopAdvanced, true, "Expected scanning to leave the calling event loop responsive");
  assert.deepEqual(result.repositories.map((repository) => path.relative(root, repository.worktree)).sort(), [
    "bare.git",
    "direct",
    "owners/raggle-ai/linked-worktree",
    "owners/raggle-ai/nested",
  ]);
  assert.deepEqual(progressCounts, [1, 2, 3, 4]);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.stopped, false);
  assert.equal(result.timedOut, false);

  const discovered = await discoverRepository(direct);
  assert.equal(discovered?.remoteUrl, "git@github.com:raggle-ai/direct.git");
  assert.equal(discovered?.currentBranch, "feature/worker");

  const shallow = await scanCloneDirectoryRepositories(root, { maxDepth: 1, maxRepos: 20 });
  assert.deepEqual(shallow.repositories.map((repository) => path.relative(root, repository.worktree)).sort(), [
    "bare.git",
    "direct",
  ]);

  const limited = await scanCloneDirectoryRepositories(root, { maxDepth: 3, maxRepos: 2 });
  assert.equal(limited.repositories.length, 2);
  assert.equal(limited.truncated, true);

  const missing = await scanCloneDirectoryRepositories(path.join(root, "missing"));
  assert.equal(missing.repositories.length, 0);
  assert.equal(missing.warnings.length, 1);
  assert.match(missing.warnings[0], /missing/);

  const preAbortedController = new AbortController();
  preAbortedController.abort();
  const preAborted = await scanCloneDirectoryRepositories(root, { signal: preAbortedController.signal });
  assert.equal(preAborted.stopped, true);
  assert.equal(preAborted.repositories.length, 0);

  for (let index = 0; index < 500; index += 1) {
    mkdirSync(path.join(root, "cancellation-fixture", `folder-${index}`), { recursive: true });
  }
  const controller = new AbortController();
  const cancelled = await scanCloneDirectoryRepositories(root, {
    maxDepth: 3,
    maxRepos: 20,
    signal: controller.signal,
    onProgress() {
      controller.abort();
    },
  });
  assert.equal(cancelled.stopped, true);
  assert.ok(cancelled.repositories.length >= 1);
  assert.ok(cancelled.repositories.length < 4);

  const timedOut = await scanCloneDirectoryRepositories(root, { timeoutMs: 1, maxDepth: 3, maxRepos: 20 });
  assert.equal(timedOut.timedOut, true);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("asynchronous repository scanner checks passed");
