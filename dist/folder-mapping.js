"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.folderDisplayName = folderDisplayName;
exports.repoPrefixedProjectName = repoPrefixedProjectName;
exports.subpathContextName = subpathContextName;
exports.subpathProjectName = subpathProjectName;
exports.subpathParentDisplayName = subpathParentDisplayName;
const node_path_1 = __importDefault(require("node:path"));
function folderDisplayName(folder) {
    return folder.split("/").join(" - ");
}
function repoPrefixedProjectName(parent, folder, removePathFromName) {
    if (removePathFromName)
        return node_path_1.default.posix.basename(folder);
    return `${parent.name ?? parent.repositoryRoot} - ${folderDisplayName(folder)}`;
}
function normalizeRelativeFolder(folder) {
    return folder
        .trim()
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .filter(Boolean)
        .join("/");
}
function normalizeSubpathContext(subpathRoot) {
    const normalizedSubpath = normalizeRelativeFolder(subpathRoot);
    if (normalizedSubpath === "subpaths")
        return "";
    if (normalizedSubpath.startsWith("subpaths/"))
        return normalizedSubpath.slice("subpaths/".length);
    return normalizedSubpath;
}
function subpathContextName(parent, subpathRoot) {
    const repositoryName = node_path_1.default.basename(parent.repositoryRoot) || parent.name || parent.repositoryRoot;
    const normalizedSubpath = normalizeSubpathContext(subpathRoot);
    return normalizedSubpath ? `${repositoryName}/${normalizedSubpath}` : repositoryName;
}
function subpathProjectName(folder) {
    return node_path_1.default.posix.basename(normalizeRelativeFolder(folder) || folder);
}
function subpathParentDisplayName(folder) {
    const parentPath = normalizeSubpathContext(node_path_1.default.posix.dirname(normalizeRelativeFolder(folder)));
    if (!parentPath || parentPath === ".")
        return undefined;
    return folderDisplayName(parentPath);
}
