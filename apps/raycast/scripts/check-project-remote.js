const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (module, fileName) => {
  const source = readFileSync(fileName, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName,
  }).outputText;

  module._compile(output, fileName);
};

const { normalizeRepositoryUrl, repositoryLookupKey } = require("../src/lib/git-repository.ts");
const { projectRemoteMetadata } = require("../src/lib/project-remote-metadata.ts");
const { remoteToBrowserUrl } = require("../src/lib/project-remote.ts");

function usage() {
  const script = path.relative(process.cwd(), __filename);
  console.error(`Usage: npm run check:project-remote -- [--configured-url <url>] <folder>`);
  console.error("");
  console.error("If --configured-url is omitted, the script reads the last Raggle standard projects snapshot.");
}

function parseArgs(args) {
  const values = [...args];
  let configuredUrl;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== "--configured-url") continue;

    configuredUrl = values[index + 1];
    values.splice(index, 2);
    break;
  }

  return { configuredUrl, folder: values[0] };
}

function gitRemoteUrl(folder) {
  return normalizeRepositoryUrl(execFileSync("git", ["remote", "get-url", "origin"], { cwd: folder, encoding: "utf8" }));
}

function supportPath() {
  return path.join(os.homedir(), "Library/Application Support/com.raycast.macos/extensions/raggle");
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function configuredUrlFromSnapshot(folder) {
  const snapshot = readJson(path.join(supportPath(), "standard-projects-snapshot.json"));
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const match = items.find(
    (item) =>
      !item.relativePath &&
      (item.worktree === folder || item.repositoryRoot === folder || folder.startsWith(`${item.repositoryRoot}${path.sep}`)),
  );
  return match?.remoteUrl;
}

function providerDisplay(remoteUrl) {
  const metadata = projectRemoteMetadata(remoteUrl);
  if (!metadata) return "<unknown>";

  return [metadata.provider, metadata.host, metadata.owner && metadata.repo ? `${metadata.owner}/${metadata.repo}` : undefined]
    .filter(Boolean)
    .join(" ");
}

function main() {
  const { configuredUrl: configuredUrlArg, folder: folderArg } = parseArgs(process.argv.slice(2));
  if (!folderArg) {
    usage();
    process.exit(1);
  }

  const folder = path.resolve(folderArg);
  assert.ok(existsSync(folder), `Folder does not exist: ${folder}`);

  const actualRemoteUrl = gitRemoteUrl(folder);
  const configuredUrl = configuredUrlArg ? normalizeRepositoryUrl(configuredUrlArg) : configuredUrlFromSnapshot(folder);
  const renderedRemoteUrl = configuredUrl && repositoryLookupKey(configuredUrl) !== repositoryLookupKey(actualRemoteUrl)
    ? actualRemoteUrl
    : (configuredUrl ?? actualRemoteUrl);

  console.log(`folder: ${folder}`);
  console.log(`configured remote: ${configuredUrl ?? "<none found in snapshot>"}`);
  console.log(`actual local remote: ${actualRemoteUrl}`);
  console.log(`rendered remote: ${renderedRemoteUrl}`);
  console.log(`browser URL: ${remoteToBrowserUrl(renderedRemoteUrl) ?? "<unsupported>"}`);
  console.log(`configured provider: ${configuredUrl ? providerDisplay(configuredUrl) : "<none>"}`);
  console.log(`actual provider: ${providerDisplay(actualRemoteUrl)}`);
  console.log(
    `status: ${
      configuredUrl && repositoryLookupKey(configuredUrl) !== repositoryLookupKey(actualRemoteUrl)
        ? "mismatch; remote DB should reconcile to the actual local remote"
        : "matched"
    }`,
  );
}

main();
