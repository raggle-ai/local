#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const remote_repository_config_1 = require("./adapters/remote-repository-config");
const discover_local_projects_1 = require("./discovery/discover-local-projects");
const usage = `Usage:
  raggle-local list [--folder PATH]
  raggle-local config REPOSITORY [--database-url URL]

REPOSITORY accepts a GitHub owner/repository pair or a Git remote URL.
--folder defaults to the current directory.
--database-url defaults to TURSO_DATABASE_URL or the Raggle project database.`;
function parseArguments(args) {
    let folder = process.cwd();
    let databaseUrl = process.env.TURSO_DATABASE_URL;
    const commands = [];
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === "--folder") {
            const value = args[index + 1];
            if (!value)
                throw new Error(`--folder requires a path\n${usage}`);
            folder = node_path_1.default.resolve(value);
            index += 1;
            continue;
        }
        if (argument === "--database-url") {
            const value = args[index + 1];
            if (!value)
                throw new Error(`--database-url requires a URL\n${usage}`);
            databaseUrl = value;
            index += 1;
            continue;
        }
        if (argument.startsWith("-"))
            throw new Error(`Unknown option: ${argument}\n${usage}`);
        commands.push(argument);
    }
    if (commands.length === 1 && commands[0] === "list")
        return { command: "list", folder };
    if (commands.length === 2 && commands[0] === "config") {
        return { command: "config", repository: commands[1], databaseUrl };
    }
    throw new Error(usage);
}
async function main() {
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
        console.log(usage);
        return;
    }
    const parsed = parseArguments(process.argv.slice(2));
    if (parsed.command === "config") {
        const config = await (0, remote_repository_config_1.readRemoteRepositoryConfig)({
            repository: parsed.repository,
            databaseUrl: parsed.databaseUrl,
            authToken: process.env.TURSO_AUTH_TOKEN,
        });
        if (!config)
            throw new Error(`Repository is not configured in the remote database: ${parsed.repository}`);
        console.log(JSON.stringify(config, null, 2));
        return;
    }
    const { folder } = parsed;
    if (!(0, node_fs_1.statSync)(folder, { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error(`Folder does not exist: ${folder}`);
    }
    const log = console.info;
    console.info = console.error;
    const projects = await (0, discover_local_projects_1.discoverLocalProjectsUnderFolder)({ folder }).finally(() => {
        console.info = log;
    });
    console.log(JSON.stringify(projects.map((project) => project.worktree), null, 2));
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
