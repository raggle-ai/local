"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.raggleProjectSnapshotPath = raggleProjectSnapshotPath;
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
function readRaggleProjectSnapshot(options = {}) {
    const snapshotPath = raggleProjectSnapshotPath(options);
    const snapshot = JSON.parse((0, node_fs_1.readFileSync)(snapshotPath, "utf8"));
    if (!Array.isArray(snapshot.items)) {
        throw new Error(`Invalid Raggle project snapshot: ${snapshotPath}`);
    }
    const projects = snapshot.items.filter(isRaycastProject);
    if (projects.length !== snapshot.items.length) {
        throw new Error(`Invalid project entry in Raggle project snapshot: ${snapshotPath}`);
    }
    return projects;
}
