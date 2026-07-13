import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repositoryRoot = process.cwd();
const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "raggle-local-packed-consumer-"));
let tarballPath;

try {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json"], { cwd: repositoryRoot, encoding: "utf8" }));
  tarballPath = path.join(repositoryRoot, packed[0].filename);
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
        const url = pkg.githubPullRequestsBrowserUrl(
          { owner: "raggle-ai", repo: "local", browserUrl: "https://github.com/raggle-ai/local" },
          ["alice", "bob"],
        );
        if (typeof pkg.githubCliPath !== "function") throw new Error("missing githubCliPath");
        if (typeof pkg.readImportedRepositoryPlugins !== "function") throw new Error("missing readImportedRepositoryPlugins");
        if (typeof pkg.raggleProjectConfigFromProjectActionConfigs !== "function") throw new Error("missing config helper");
        process.stdout.write(url);
      `,
    ],
    { cwd: consumerDirectory, encoding: "utf8" },
  ).trim();

  assert.equal(output, "https://github.com/raggle-ai/local/pulls?q=is%3Apr%20is%3Aopen%20author%3Aalice%20author%3Abob");
  console.log("packed consumer checks passed");
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
  if (tarballPath) rmSync(tarballPath, { force: true });
}
