#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const { rmSync } = require("node:fs");
const path = require("node:path");

const outputDirectory = path.join(".tmp", "raggle-project-config-verify");
const compiledVerifier = path.join(outputDirectory, "scripts", "verify-raggle-project-config.js");

try {
  rmSync(outputDirectory, { recursive: true, force: true });
  execFileSync(
    "tsc",
    [
      "--module",
      "commonjs",
      "--target",
      "es2021",
      "--esModuleInterop",
      "--resolveJsonModule",
      "--skipLibCheck",
      "--strict",
      "--outDir",
      outputDirectory,
      "scripts/verify-raggle-project-config.ts",
    ],
    { stdio: "inherit" },
  );
  execFileSync("node", [compiledVerifier, ...process.argv.slice(2)], { stdio: "inherit" });
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
