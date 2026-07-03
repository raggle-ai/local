import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { scanCloneDirectoryRepositories } from "../dist/scanner.js";

const repositoryCount = Number.parseInt(process.env.RAGGLE_BENCH_REPOS ?? "1000", 10);
const root = mkdtempSync(path.join(os.tmpdir(), "raggle-local-bench-"));

try {
  for (let index = 0; index < repositoryCount; index += 1) {
    const worktree = path.join(root, `owner-repo-${index}`);
    const gitDirectory = path.join(worktree, ".git");
    mkdirSync(gitDirectory, { recursive: true });
    writeFileSync(
      path.join(gitDirectory, "config"),
      `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://github.com/owner/repo-${index}.git\n`,
    );
    writeFileSync(path.join(gitDirectory, "HEAD"), "ref: refs/heads/main\n");
  }

  const startedAt = performance.now();
  const repositories = scanCloneDirectoryRepositories(root);
  const durationMs = performance.now() - startedAt;

  console.log(
    JSON.stringify(
      {
        repositories: repositories.length,
        durationMs: Number(durationMs.toFixed(2)),
        repositoriesPerSecond: Number((repositories.length / (durationMs / 1000)).toFixed(2)),
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
