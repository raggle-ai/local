const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (module, fileName) => {
  const source = readFileSync(fileName, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName,
  }).outputText;

  module._compile(output, fileName);
};

const { discoverProjectIcon, fetchGithubOwnerIcon, githubOwnerFromRemoteUrl } = require("@raggle-ai/local");

function usage() {
  const script = path.relative(process.cwd(), __filename);
  console.error(`Usage: npm run check:project-icons -- [--github-repo owner/repo] <root-folder> [folder-or-subpath ...]`);
  console.error("");
  console.error("If no subpaths are provided, first-level child folders under <root-folder> are checked.");
}

function parseArgs(args) {
  const values = [...args];
  let githubRepo;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== "--github-repo") continue;

    githubRepo = values[index + 1];
    values.splice(index, 2);
    break;
  }

  return { githubRepo, paths: values };
}

function githubRemoteUrl(input) {
  if (!input) return undefined;
  if (input.startsWith("http://") || input.startsWith("https://") || input.startsWith("git@")) return input;

  const [owner, repo] = input.split("/");
  if (!owner || !repo) throw new Error(`Expected --github-repo owner/repo, got: ${input}`);
  return `https://github.com/${owner}/${repo.replace(/\.git$/, "")}`;
}

function normalizeInputPath(input, rootPath) {
  if (path.isAbsolute(input)) return path.resolve(input);
  return path.resolve(rootPath, input);
}

function firstLevelChildDirectories(rootPath) {
  return readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => path.join(rootPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function relativeSubpath(rootPath, folderPath) {
  const relativePath = path.relative(rootPath, folderPath).split(path.sep).join("/");
  return relativePath === "" ? undefined : relativePath;
}

function projectFromFolder(rootPath, folderPath) {
  const relativePath = relativeSubpath(rootPath, folderPath);
  const id = relativePath ? `local:${rootPath}#${relativePath}` : `local:${rootPath}`;

  return {
    id,
    worktree: folderPath,
    repositoryRoot: rootPath,
    name: path.basename(folderPath),
    relativePath,
    sandboxCount: 0,
    hasIcon: false,
    isSessionOnly: false,
    isFavorite: false,
    relatedIds: [id],
    remoteUrl: `local:${rootPath}`,
    isCloned: true,
  };
}

function isDescendantWorktree(parent, child) {
  return child.startsWith(`${parent}${path.sep}`);
}

function iconOwnerPaths(folderPaths) {
  const worktrees = new Set();
  const [rootPath] = folderPaths;

  for (const folderPath of folderPaths) {
    if (folderPath === rootPath) {
      worktrees.add(folderPath);
      continue;
    }

    if (folderPaths.some((candidate) => candidate !== folderPath && isDescendantWorktree(folderPath, candidate))) {
      worktrees.add(folderPath);
    }
  }

  return worktrees;
}

function renderedIconForFolder(folderPath, folderPaths, ownerIcons) {
  if (ownerIcons.has(folderPath)) return ownerIcons.get(folderPath);

  let currentDirectory = path.dirname(folderPath);
  while (currentDirectory && currentDirectory !== folderPath) {
    if (folderPaths.includes(currentDirectory) && ownerIcons.get(currentDirectory)) {
      return ownerIcons.get(currentDirectory);
    }

    const nextDirectory = path.dirname(currentDirectory);
    if (nextDirectory === currentDirectory) break;
    currentDirectory = nextDirectory;
  }

  return ownerIcons.get(folderPaths[0]);
}

function iconDisplay(icon) {
  return icon ?? "<none>";
}

async function iconForOwnerPath(folderPath, rootPath, remoteUrl) {
  const directIcon = discoverProjectIcon(folderPath);
  if (directIcon) return { icon: directIcon, source: "direct folder icon" };
  if (folderPath !== rootPath || !remoteUrl) return { icon: undefined, source: undefined };

  const githubIcon = await fetchGithubOwnerIcon(remoteUrl);
  return {
    icon: githubIcon?.sourceUrl,
    source: githubIcon ? `GitHub owner avatar: ${githubIcon.owner}` : undefined,
  };
}

async function main() {
  const { githubRepo, paths } = parseArgs(process.argv.slice(2));
  const [rootInput, ...folderInputs] = paths;
  if (!rootInput) {
    usage();
    process.exit(1);
  }

  const rootPath = path.resolve(rootInput);
  const remoteUrl = githubRemoteUrl(githubRepo);
  assert.ok(existsSync(rootPath), `Root folder does not exist: ${rootPath}`);

  const folderPaths = [
    rootPath,
    ...(folderInputs.length
      ? folderInputs.map((input) => normalizeInputPath(input, rootPath))
      : firstLevelChildDirectories(rootPath)),
  ];

  for (const folderPath of folderPaths) {
    assert.ok(existsSync(folderPath), `Folder does not exist: ${folderPath}`);
  }

  const items = folderPaths.map((folderPath) => projectFromFolder(rootPath, folderPath));
  const owners = iconOwnerPaths(folderPaths);
  const ownerIconEntries = await Promise.all(
    [...owners].map(async (folderPath) => [folderPath, await iconForOwnerPath(folderPath, rootPath, remoteUrl)]),
  );
  const ownerIcons = new Map(ownerIconEntries.map(([folderPath, result]) => [folderPath, result.icon]));
  const ownerSources = new Map(ownerIconEntries.map(([folderPath, result]) => [folderPath, result.source]));
  const renderedItems = items.map((item) => ({
    ...item,
    icon: renderedIconForFolder(item.worktree, folderPaths, ownerIcons),
  }));
  const rootIcon = renderedItems.find((item) => item.worktree === rootPath)?.icon;
  const directRootIcon = discoverProjectIcon(rootPath);

  assert.ok(directRootIcon || remoteUrl, `No direct icon discovered for root folder: ${rootPath}`);
  assert.ok(rootIcon, `No rendered icon registered for root folder: ${rootPath}`);

  console.log(`root: ${rootPath}`);
  console.log(`direct root icon: ${iconDisplay(directRootIcon)}`);
  if (remoteUrl) console.log(`github owner: ${githubOwnerFromRemoteUrl(remoteUrl) ?? "<none>"}`);
  console.log("");

  for (const item of renderedItems) {
    const directIcon = discoverProjectIcon(item.worktree);
    const inheritedFromRoot = item.worktree !== rootPath && item.icon === rootIcon;
    const directSource = directIcon && item.icon === directIcon;
    const relativePath = relativeSubpath(rootPath, item.worktree) ?? ".";

    assert.ok(item.icon, `No rendered icon registered for ${item.worktree}`);

    console.log(relativePath);
    console.log(`  folder: ${item.worktree}`);
    console.log(`  direct: ${iconDisplay(directIcon)}`);
    console.log(`  rendered: ${iconDisplay(item.icon)}`);
    console.log(
      `  source: ${
        item.worktree === rootPath
          ? (ownerSources.get(rootPath) ?? "root")
          : inheritedFromRoot
            ? "inherited from root"
            : directSource
            ? "direct folder icon"
            : "inherited"
      }`,
    );
  }

  console.log("");
  console.log(`checked ${renderedItems.length} folder${renderedItems.length === 1 ? "" : "s"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
