import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(extensionRoot, "../..");
const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "raggle-raycast-native-bundle-"));

try {
  const fixtureRepository = path.join(tempDirectory, "owner", "repository");
  mkdirSync(path.join(fixtureRepository, ".git"), { recursive: true });
  writeFileSync(
    path.join(fixtureRepository, ".git", "config"),
    '[remote "origin"]\n  url = https://github.com/raggle-ai/bundled-scanner.git\n',
  );
  writeFileSync(path.join(fixtureRepository, ".git", "HEAD"), "ref: refs/heads/main\n");

  const nativeLibraryPath = path.join(
    repositoryRoot,
    "dist",
    "native",
    `raggle-local-scanner.${process.platform}-${process.arch}.node`,
  );
  const bundlePath = path.join(tempDirectory, "projects.cjs");
  buildSync({
    stdin: {
      contents: `
        process.env.NAPI_RS_NATIVE_LIBRARY_PATH = ${JSON.stringify(nativeLibraryPath)};
        const { scanCloneDirectoryRepositories } = require(${JSON.stringify(
          path.join(repositoryRoot, "dist", "discovery", "scanner.js"),
        )});
        scanCloneDirectoryRepositories(${JSON.stringify(tempDirectory)}, { maxDepth: 2 })
          .then((result) => process.stdout.write(JSON.stringify(result.repositories)));
      `,
      resolveDir: extensionRoot,
      sourcefile: "projects-native-scanner.js",
    },
    bundle: true,
    format: "cjs",
    outfile: bundlePath,
    platform: "node",
  });

  const output = execFileSync(process.execPath, [bundlePath], { encoding: "utf8" });
  const repositories = JSON.parse(output);
  assert.equal(repositories.length, 1);
  assert.equal(repositories[0].worktree, fixtureRepository);
  assert.equal(repositories[0].remoteUrl, "https://github.com/raggle-ai/bundled-scanner");
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

console.log("bundled native scanner checks passed");
