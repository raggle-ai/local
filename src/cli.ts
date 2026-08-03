#!/usr/bin/env node
import { statSync } from "node:fs";
import path from "node:path";
import { discoverLocalProjectsUnderFolder } from "./discovery/discover-local-projects";

const usage = "Usage: raggle-local [--folder PATH] list\n\n--folder defaults to the current directory.";

function parseArguments(args: string[]) {
  let folder = process.cwd();
  const commands: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--folder") {
      const value = args[index + 1];
      if (!value) throw new Error(`--folder requires a path\n${usage}`);
      folder = path.resolve(value);
      index += 1;
      continue;
    }

    if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}\n${usage}`);
    commands.push(argument);
  }

  if (commands.length !== 1 || commands[0] !== "list") throw new Error(usage);
  return { folder };
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage);
    return;
  }

  const { folder } = parseArguments(process.argv.slice(2));
  if (!statSync(folder, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Folder does not exist: ${folder}`);
  }

  const log = console.info;
  console.info = console.error;
  const projects = await discoverLocalProjectsUnderFolder({ folder }).finally(() => {
    console.info = log;
  });
  console.log(
    JSON.stringify(
      projects.map((project) => project.worktree),
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
