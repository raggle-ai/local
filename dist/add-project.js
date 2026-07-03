"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRepositoryNameFromUrl = getRepositoryNameFromUrl;
exports.getRepositoryDirectoryNameFromUrl = getRepositoryDirectoryNameFromUrl;
exports.deriveLocalProjectPath = deriveLocalProjectPath;
exports.deriveProjectName = deriveProjectName;
exports.clonePathTemplateFromFormValue = clonePathTemplateFromFormValue;
exports.projectRowFromValues = projectRowFromValues;
exports.repositoryRootPath = repositoryRootPath;
exports.repositoryCloneParentDirectory = repositoryCloneParentDirectory;
const node_path_1 = __importDefault(require("node:path"));
const git_repository_1 = require("./git-repository");
const import_1 = require("./import");
const project_subpaths_1 = require("./project-subpaths");
function splitListInput(input) {
    return input
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
}
function getRepositoryNameFromUrl(url) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl)
        return "";
    try {
        return (0, git_repository_1.repositoryName)((0, git_repository_1.normalizeRepositoryUrl)(trimmedUrl));
    }
    catch {
        return "";
    }
}
function getRepositoryDirectoryNameFromUrl(url) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl)
        return "";
    try {
        return (0, git_repository_1.repositoryDirectoryName)(trimmedUrl);
    }
    catch {
        return "";
    }
}
function deriveLocalProjectPath(url, defaultCloneDirectory, folderName) {
    const repository = folderName?.trim() || getRepositoryDirectoryNameFromUrl(url);
    if (!defaultCloneDirectory)
        return repository;
    if (!repository)
        return defaultCloneDirectory;
    return node_path_1.default.join(defaultCloneDirectory, repository);
}
function deriveProjectName(url) {
    return (0, git_repository_1.repositoryName)((0, git_repository_1.normalizeRepositoryUrl)(url.trim()));
}
function clonePathTemplateFromFormValue(clonePath, defaultCloneDirectory, defaultRepositoryName) {
    const trimmedClonePath = clonePath.trim();
    if (!trimmedClonePath)
        return undefined;
    const clonePathTemplate = (() => {
        if (!node_path_1.default.isAbsolute(trimmedClonePath) || !defaultCloneDirectory)
            return trimmedClonePath;
        const relativePath = node_path_1.default.relative(defaultCloneDirectory, trimmedClonePath);
        if (!relativePath || relativePath.startsWith("..") || node_path_1.default.isAbsolute(relativePath))
            return trimmedClonePath;
        return relativePath;
    })();
    const normalized = (0, import_1.normalizeClonePathTemplate)(clonePathTemplate);
    if (!normalized || normalized === defaultRepositoryName)
        return undefined;
    return normalized;
}
function projectRowFromValues(values) {
    const normalizedUrl = (0, git_repository_1.normalizeRepositoryUrl)(values.url.trim());
    const derivedName = deriveProjectName(normalizedUrl);
    const trimmedName = values.name.trim();
    const description = values.description.trim();
    const tags = (0, import_1.normalizeTags)(splitListInput(values.tags));
    const folders = (0, import_1.normalizeFolders)(values.folders ?? []);
    const subpaths = (0, project_subpaths_1.normalizeSubpathPaths)(splitListInput(values.subpaths));
    const row = { url: normalizedUrl };
    if (trimmedName && trimmedName !== derivedName)
        row.name = trimmedName;
    if (description)
        row.description = description;
    if (tags.length)
        row.tags = tags;
    if (folders.length)
        row.folders = folders;
    if (subpaths.length)
        row.subpaths = subpaths;
    return row;
}
function repositoryRootPath(repository, defaultCloneDirectory) {
    const clonePathTemplate = (0, import_1.normalizeClonePathTemplate)(repository.clonePathTemplate);
    if (clonePathTemplate) {
        return node_path_1.default.isAbsolute(clonePathTemplate) ? clonePathTemplate : node_path_1.default.join(defaultCloneDirectory, clonePathTemplate);
    }
    return node_path_1.default.join(defaultCloneDirectory, repository.remoteUrl ? (0, git_repository_1.repositoryDirectoryName)(repository.remoteUrl) : repository.repository);
}
function repositoryCloneParentDirectory(repository, defaultCloneDirectory) {
    return node_path_1.default.dirname(repositoryRootPath(repository, defaultCloneDirectory));
}
