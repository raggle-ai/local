"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverLocalProjects = discoverLocalProjects;
const node_path_1 = __importDefault(require("node:path"));
const load_local_projects_1 = require("./load-local-projects");
const scanner_1 = require("./scanner");
/** Discovers cloned repositories and expands their configured Raggle folders. */
async function discoverLocalProjects(options) {
    const { cloneDirectory, scan: scanOptions, ...loadOptions } = options;
    const scannedRepositories = (0, scanner_1.scanCloneDirectoryRepositories)(cloneDirectory, scanOptions).repositories;
    const remoteProjects = scannedRepositories.map((repository) => ({
        remoteUrl: repository.remoteUrl,
        name: node_path_1.default.basename(repository.worktree),
    }));
    return (0, load_local_projects_1.loadLocalProjects)(remoteProjects, {
        ...loadOptions,
        cloneDirectory,
        scannedRepositories,
    });
}
