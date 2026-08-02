"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.raggleProjectSnapshotPath = raggleProjectSnapshotPath;
exports.readRaggleProjectListSnapshot = readRaggleProjectListSnapshot;
exports.readRaggleProjectSnapshot = readRaggleProjectSnapshot;
const api_1 = require("@raycast/api");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const defaultRaggleExtensionName = "raggle";
const snapshotFilename = "standard-projects-snapshot.json";
function isRaycastProject(value) {
    if (!value || typeof value !== "object")
        return false;
    const project = value;
    return (typeof project.id === "string" &&
        typeof project.worktree === "string" &&
        typeof project.remoteUrl === "string" &&
        typeof project.repositoryRoot === "string");
}
function raggleProjectSnapshotPath(options = {}) {
    if (options.snapshotPath)
        return options.snapshotPath;
    const currentSupportPath = options.currentSupportPath ?? api_1.environment.supportPath;
    const raggleExtensionName = options.raggleExtensionName ?? defaultRaggleExtensionName;
    const extensionsPath = node_path_1.default.dirname(currentSupportPath);
    const raggleSupportPath = node_path_1.default.basename(currentSupportPath) === raggleExtensionName
        ? currentSupportPath
        : node_path_1.default.join(extensionsPath, raggleExtensionName);
    return node_path_1.default.join(raggleSupportPath, snapshotFilename);
}
function stringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}
function parseListState(value) {
    if (!value || typeof value !== "object")
        return undefined;
    const listState = value;
    const favoriteWorktrees = stringArray(listState.favoriteWorktrees);
    const recentSelectionWorktrees = stringArray(listState.recentSelectionWorktrees);
    if (!favoriteWorktrees || !recentSelectionWorktrees)
        return undefined;
    return {
        favoriteWorktrees,
        recentSelectionWorktrees,
        updatedAt: typeof listState.updatedAt === "number" ? listState.updatedAt : undefined,
    };
}
function applyListState(projects, listState) {
    if (!listState)
        return projects;
    const favorites = new Set(listState.favoriteWorktrees);
    const sourceOrder = new Map(projects.map((project, index) => [project.worktree, index]));
    const favoriteOrder = new Map(listState.favoriteWorktrees.map((worktree, index) => [worktree, index]));
    const recentOrder = new Map(listState.recentSelectionWorktrees.map((worktree, index) => [worktree, index]));
    return projects
        .map((project) => ({ ...project, isFavorite: favorites.has(project.worktree) }))
        .sort((left, right) => {
        if (left.isFavorite !== right.isFavorite)
            return left.isFavorite ? -1 : 1;
        const order = left.isFavorite ? favoriteOrder : recentOrder;
        const leftOrder = order.get(left.worktree);
        const rightOrder = order.get(right.worktree);
        if (leftOrder !== undefined || rightOrder !== undefined) {
            return (leftOrder ?? Number.POSITIVE_INFINITY) - (rightOrder ?? Number.POSITIVE_INFINITY);
        }
        return (sourceOrder.get(left.worktree) ?? 0) - (sourceOrder.get(right.worktree) ?? 0);
    });
}
function readRaggleProjectListSnapshot(options = {}) {
    const snapshotPath = raggleProjectSnapshotPath(options);
    const snapshot = JSON.parse((0, node_fs_1.readFileSync)(snapshotPath, "utf8"));
    if (!Array.isArray(snapshot.items)) {
        throw new Error(`Invalid Raggle project snapshot: ${snapshotPath}`);
    }
    const projects = snapshot.items.filter(isRaycastProject);
    if (projects.length !== snapshot.items.length) {
        throw new Error(`Invalid project entry in Raggle project snapshot: ${snapshotPath}`);
    }
    const listState = parseListState(snapshot.listState);
    return {
        schemaVersion: typeof snapshot.schemaVersion === "number" ? snapshot.schemaVersion : 1,
        generatedAt: typeof snapshot.generatedAt === "number" ? snapshot.generatedAt : undefined,
        projects: applyListState(projects, listState),
        listState,
    };
}
function readRaggleProjectSnapshot(options = {}) {
    return readRaggleProjectListSnapshot(options).projects;
}
