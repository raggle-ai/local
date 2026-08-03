"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverLocalProjects = discoverLocalProjects;
exports.discoverLocalProjectsUnderFolder = discoverLocalProjectsUnderFolder;
const node_path_1 = __importDefault(require("node:path"));
const project_load_update_1 = require("../core/project-load-update");
const raggle_project_config_1 = require("../adapters/raggle-project-config");
const load_local_projects_1 = require("./load-local-projects");
const scanner_1 = require("./scanner");
function remoteProjects(repositories) {
    return repositories.map((repository) => ({
        remoteUrl: repository.remoteUrl,
        name: node_path_1.default.basename(repository.worktree),
    }));
}
function repositoryAtOrAbove(folder) {
    let directory = folder;
    while (true) {
        const repository = (0, scanner_1.discoverRepository)(directory);
        if (repository)
            return repository;
        const parent = node_path_1.default.dirname(directory);
        if (parent === directory)
            return undefined;
        directory = parent;
    }
}
async function hasProjectConfig(folder, configFiles) {
    for (const configFile of (0, raggle_project_config_1.resolveProjectConfigFileNames)(configFiles)) {
        if (await (0, raggle_project_config_1.readProjectConfigFileAsync)(node_path_1.default.join(folder, configFile)))
            return true;
    }
    return false;
}
function isUnderFolder(project, folder) {
    const relative = node_path_1.default.relative(folder, project.worktree);
    return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${node_path_1.default.sep}`) && !node_path_1.default.isAbsolute(relative);
}
/** Discovers cloned repositories and expands their configured Raggle folders. */
async function discoverLocalProjects(options) {
    const { cloneDirectory, scan: scanOptions, ...loadOptions } = options;
    const scannedRepositories = (0, scanner_1.scanCloneDirectoryRepositories)(cloneDirectory, scanOptions).repositories;
    return (0, load_local_projects_1.loadLocalProjects)(remoteProjects(scannedRepositories), {
        ...loadOptions,
        cloneDirectory,
        scannedRepositories,
    });
}
/** Lists only configured projects strictly beneath a folder. */
async function discoverLocalProjectsUnderFolder(options) {
    const { folder: inputFolder, scan: scanOptions, onUpdate, previousItems = [], ...loadOptions } = options;
    const folder = node_path_1.default.resolve(inputFolder);
    const containingRepository = repositoryAtOrAbove(folder);
    const useFolderBoundary = containingRepository?.worktree !== folder && (await hasProjectConfig(folder, loadOptions.projectConfigFiles));
    const scopedRepository = containingRepository && useFolderBoundary ? { ...containingRepository, worktree: folder } : containingRepository;
    const cloneDirectory = scopedRepository ? node_path_1.default.dirname(scopedRepository.worktree) : folder;
    const scannedRepositories = scopedRepository
        ? [scopedRepository]
        : (0, scanner_1.scanCloneDirectoryRepositories)(folder, scanOptions).repositories;
    const scopedPreviousItems = previousItems.filter((project) => isUnderFolder(project, folder));
    const projects = await (0, load_local_projects_1.loadLocalProjects)(remoteProjects(scannedRepositories), {
        ...loadOptions,
        cloneDirectory,
        scannedRepositories,
        previousItems: scopedPreviousItems,
        onUpdate: onUpdate
            ? (items, update) => {
                const scopedItems = items.filter((project) => isUnderFolder(project, folder));
                onUpdate(scopedItems, (0, project_load_update_1.createLocalProjectUpdate)(scopedPreviousItems, scopedItems, update.phase));
            }
            : undefined,
    });
    return projects.filter((project) => isUnderFolder(project, folder));
}
