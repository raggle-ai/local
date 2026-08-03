import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { scanCloneDirectoryRepositories } from "../dist/scanner.js";

const repositoryCount = Number.parseInt(process.env.RAGGLE_BENCH_REPOS ?? "1000", 10);
const directoryCount = Number.parseInt(process.env.RAGGLE_BENCH_DIRECTORIES ?? "10000", 10);
const iterations = Number.parseInt(process.env.RAGGLE_BENCH_ITERATIONS ?? "5", 10);
const warmup = Number.parseInt(process.env.RAGGLE_BENCH_WARMUP ?? "1", 10);
const root = mkdtempSync(path.join(os.tmpdir(), "raggle-local-bench-"));

function roundMs(value) {
  return Number(value.toFixed(2));
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;

  return {
    min: roundMs(sorted[0]),
    median: roundMs(median),
    mean: roundMs(mean),
    max: roundMs(sorted[sorted.length - 1]),
  };
}

try {
  for (let index = 0; index < repositoryCount; index += 1) {
    const worktree = path.join(root, `owner-${index % 50}`, `repo-${index}`);
    const gitDirectory = path.join(worktree, ".git");
    mkdirSync(gitDirectory, { recursive: true });
    writeFileSync(
      path.join(gitDirectory, "config"),
      `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://github.com/owner/repo-${index}.git\n`,
    );
    writeFileSync(path.join(gitDirectory, "HEAD"), "ref: refs/heads/main\n");
  }

  for (let index = 0; index < directoryCount; index += 1) {
    mkdirSync(path.join(root, "non-repositories", `group-${index % 100}`, `folder-${index}`), { recursive: true });
  }

  for (let index = 0; index < warmup; index += 1) {
    await scanCloneDirectoryRepositories(root, { maxDepth: 3, maxRepos: repositoryCount });
  }

  const samples = [];
  let repositories = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    repositories = (await scanCloneDirectoryRepositories(root, { maxDepth: 3, maxRepos: repositoryCount }))
      .repositories;
    samples.push(performance.now() - startedAt);
  }

  const stats = summarize(samples);

  console.log(
    JSON.stringify(
      {
        repositories: repositories.length,
        directories: directoryCount,
        iterations,
        warmup,
        durationMs: stats,
        repositoriesPerSecond: Number((repositories.length / (stats.median / 1000)).toFixed(2)),
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
