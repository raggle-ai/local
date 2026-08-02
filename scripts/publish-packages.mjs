import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const provenance = args.has("--provenance");

function readPackageJson(packagePath) {
  return JSON.parse(readFileSync(path.join(packagePath, "package.json"), "utf8"));
}

function workspacePackagePaths(rootPackage) {
  const workspaces = Array.isArray(rootPackage.workspaces) ? rootPackage.workspaces : [];
  const packagePaths = [root];

  for (const pattern of workspaces) {
    if (!pattern.endsWith("/*")) {
      const packagePath = path.join(root, pattern);
      if (existsSync(path.join(packagePath, "package.json"))) packagePaths.push(packagePath);
      continue;
    }

    const workspaceRoot = path.join(root, pattern.slice(0, -2));
    if (!existsSync(workspaceRoot)) continue;

    for (const entry of readdirSync(workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packagePath = path.join(workspaceRoot, entry.name);
      if (existsSync(path.join(packagePath, "package.json"))) packagePaths.push(packagePath);
    }
  }

  return packagePaths;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.status !== 0 && !options.allowFailure) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function packageVersionExists(packageName, version) {
  const result = run("npm", ["view", `${packageName}@${version}`, "version", "--silent"], {
    capture: true,
    allowFailure: true,
  });

  return result.status === 0 && result.stdout.trim() === version;
}

function publishPackage(packagePath, packageJson) {
  const result = run(
    "npm",
    ["publish", "--access", "public", ...(provenance ? ["--provenance"] : [])],
    { cwd: packagePath, capture: true, allowFailure: true },
  );

  if (result.status === 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    return;
  }

  const output = `${result.stdout}\n${result.stderr}`;
  if (output.includes("previously published versions") && output.includes(packageJson.version)) {
    console.log(`Skipping already reserved package ${packageJson.name}@${packageJson.version}`);
    return;
  }

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const rootPackage = readPackageJson(root);

for (const packagePath of workspacePackagePaths(rootPackage)) {
  const packageJson = readPackageJson(packagePath);
  const label = `${packageJson.name}@${packageJson.version}`;

  if (packageJson.private) {
    console.log(`Skipping private package ${label}`);
    continue;
  }

  if (dryRun) {
    console.log(`Packing ${label}`);
    run("npm", ["pack", "--dry-run"], { cwd: packagePath });
    continue;
  }

  if (packageVersionExists(packageJson.name, packageJson.version)) {
    console.log(`Skipping already published package ${label}`);
    continue;
  }

  console.log(`Publishing ${label}`);
  publishPackage(packagePath, packageJson);
}
