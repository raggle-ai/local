import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repositoryRoot = process.cwd();
const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "raggle-local-packed-consumer-"));

try {
  const packedFilename = execFileSync(
    "npm",
    ["pack", "--ignore-scripts", "--pack-destination", tempDirectory],
    { cwd: repositoryRoot, encoding: "utf8" },
  ).trim();
  assert.equal(path.basename(packedFilename), packedFilename, "npm pack returned an invalid filename");
  assert.match(packedFilename, /\.tgz$/, "npm pack did not produce a tarball");
  const tarballPath = path.join(tempDirectory, packedFilename);
  const consumerDirectory = path.join(tempDirectory, "consumer");

  mkdirSync(consumerDirectory, { recursive: true });
  writeFileSync(
    path.join(consumerDirectory, "package.json"),
    JSON.stringify({ name: "raggle-local-packed-consumer", private: true }, null, 2),
  );

  execFileSync("npm", ["install", tarballPath], {
    cwd: consumerDirectory,
    encoding: "utf8",
    stdio: "inherit",
  });

  const output = execFileSync(
    "node",
    [
      "-e",
      `
        const pkg = require("@raggle-ai/local");
        const fs = require("node:fs");
        const os = require("node:os");
        const path = require("node:path");
        const url = pkg.githubPullRequestsBrowserUrl(
          { owner: "raggle-ai", repo: "local", browserUrl: "https://github.com/raggle-ai/local" },
          ["alice", "bob"],
        );
        if (typeof pkg.githubAuthenticatedAccounts !== "function") throw new Error("missing githubAuthenticatedAccounts");
        if (typeof pkg.githubCliPath !== "function") throw new Error("missing githubCliPath");
        if (typeof pkg.mergeRaggleProjectConfig !== "function") throw new Error("missing mergeRaggleProjectConfig");
        if (typeof pkg.readImportedRepositoryPlugins !== "function") throw new Error("missing readImportedRepositoryPlugins");
        if (typeof pkg.raggleProjectConfigFromProjectActionConfigs !== "function") throw new Error("missing config helper");
        const merged = pkg.mergeRaggleProjectConfig(
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
        );
        if (merged.allSubpath !== true) throw new Error("allSubpaths was not included in the packed package");
        const configDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "raggle-packed-config-"));
        try {
          fs.writeFileSync(
            path.join(configDirectory, "raggle.json"),
            JSON.stringify({ allSubpaths: true, excludeFolders: ["archive"] }),
          );
          const config = pkg.readRaggleProjectConfig(configDirectory);
          if (config.excludeFolders?.[0] !== "archive") {
            throw new Error("excludeFolders was not included in the packed package");
          }
        } finally {
          fs.rmSync(configDirectory, { recursive: true, force: true });
        }
        const scanDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "raggle-packed-scanner-"));
        const scanRepository = path.join(scanDirectory, "owner", "repository");
        fs.mkdirSync(path.join(scanRepository, ".git"), { recursive: true });
        fs.writeFileSync(
          path.join(scanRepository, ".git", "config"),
          '[remote "origin"]\\n  url = https://github.com/raggle-ai/packed-scanner.git\\n',
        );
        fs.writeFileSync(path.join(scanRepository, ".git", "HEAD"), "ref: refs/heads/main\\n");
        pkg.scanCloneDirectoryRepositories(scanDirectory, { maxDepth: 2 })
          .then((scan) => {
            if (scan.repositories.length !== 1 || scan.repositories[0].worktree !== scanRepository) {
              throw new Error("packed native scanner did not discover the nested repository");
            }
            process.stdout.write(url);
          })
          .finally(() => fs.rmSync(scanDirectory, { recursive: true, force: true }));
      `,
    ],
    { cwd: consumerDirectory, encoding: "utf8" },
  ).trim();

  assert.equal(
    output,
    "https://github.com/raggle-ai/local/pulls?q=is%3Apr%20is%3Aopen%20author%3Aalice%20author%3Abob",
  );
  console.log("packed consumer checks passed");
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
