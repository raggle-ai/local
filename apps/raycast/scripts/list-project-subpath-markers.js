const assert = require("node:assert/strict");
const { existsSync, readdirSync } = require("node:fs");
const path = require("node:path");

const markerFiles = ["kennel.json"];
const skippedDirectories = new Set(["node_modules", "dist", "build", "coverage", ".next", ".turbo", ".vercel", "target"]);

function usage() {
  const script = path.relative(process.cwd(), __filename);
  console.error(`Usage: node ${script} <local-path>`);
  console.error("");
  console.error("Lists folders containing kennel.json and the child folders they make searchable.");
}

function shouldIncludeDirectory(name) {
  return !name.startsWith(".") && !skippedDirectories.has(name);
}

function childDirectories(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && shouldIncludeDirectory(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function relativePath(rootPath, itemPath) {
  const relative = path.relative(rootPath, itemPath).split(path.sep).join("/");
  return relative || ".";
}

function markerFilesFor(directory) {
  return markerFiles.filter((markerFile) => existsSync(path.join(directory, markerFile)));
}

function markerParents(rootPath) {
  return [rootPath, ...childDirectories(rootPath)]
    .map((directory) => ({ directory, markers: markerFilesFor(directory) }))
    .filter((item) => item.markers.length > 0);
}

function main() {
  const [rootInput] = process.argv.slice(2);
  if (!rootInput) {
    usage();
    process.exit(1);
  }

  const rootPath = path.resolve(rootInput);
  assert.ok(existsSync(rootPath), `Local path does not exist: ${rootPath}`);

  const parents = markerParents(rootPath);
  console.log(`Root: ${rootPath}`);
  console.log(`Markers: ${markerFiles.join(", ")}`);

  if (!parents.length) {
    console.log("No marker folders found at this path or one level below it.");
    return;
  }

  for (const parent of parents) {
    const children = childDirectories(parent.directory);
    console.log("");
    console.log(`${relativePath(rootPath, parent.directory)} (${parent.markers.join(", ")})`);

    if (!children.length) {
      console.log("  <no child folders>");
      continue;
    }

    for (const child of children) {
      console.log(`  ${relativePath(rootPath, child)}`);
    }
  }
}

main();
