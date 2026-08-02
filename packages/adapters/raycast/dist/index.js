"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readRaggleProjectSnapshot = exports.raggleProjectSnapshotPath = exports.ProjectPicker = void 0;
exports.raycastTintFromIconColor = raycastTintFromIconColor;
exports.iconColorFromRaycastTint = iconColorFromRaycastTint;
exports.cachedRaycastProjectToLocalProject = cachedRaycastProjectToLocalProject;
exports.localProjectToRaycastProject = localProjectToRaycastProject;
const api_1 = require("@raycast/api");
function raycastTintFromIconColor(iconColor) {
    if (!iconColor)
        return undefined;
    const key = iconColor.toLowerCase();
    if (key.includes("red"))
        return api_1.Color.Red;
    if (key.includes("orange"))
        return api_1.Color.Orange;
    if (key.includes("yellow"))
        return api_1.Color.Yellow;
    if (key.includes("green"))
        return api_1.Color.Green;
    if (key.includes("blue"))
        return api_1.Color.Blue;
    if (key.includes("magenta") || key.includes("pink") || key.includes("purple"))
        return api_1.Color.Magenta;
    if (key.includes("secondary") || key.includes("gray") || key.includes("grey"))
        return api_1.Color.SecondaryText;
    return undefined;
}
function iconColorFromRaycastTint(tint) {
    switch (tint) {
        case api_1.Color.Red:
            return "red";
        case api_1.Color.Orange:
            return "orange";
        case api_1.Color.Yellow:
            return "yellow";
        case api_1.Color.Green:
            return "green";
        case api_1.Color.Blue:
            return "blue";
        case api_1.Color.Magenta:
            return "magenta";
        case api_1.Color.SecondaryText:
            return "secondary";
        default:
            return undefined;
    }
}
function cachedRaycastProjectToLocalProject(project) {
    return {
        id: project.id,
        worktree: project.worktree,
        name: project.name,
        description: project.description,
        worktreeName: project.worktreeName,
        keywords: project.keywords,
        tags: project.tags,
        latestSessionTitle: project.latestSessionTitle,
        icon: project.icon,
        iconColor: project.iconColor,
        startupCommand: project.startupCommand,
        sandboxCount: project.sandboxCount,
        updatedAt: project.updatedAt,
        hasIcon: project.hasIcon,
        isSessionOnly: Boolean(project.isSessionOnly),
        isFavorite: Boolean(project.isFavorite),
        relatedIds: project.relatedIds ?? [],
        remoteUrl: project.worktree,
        isCloned: true,
        repositoryRoot: project.worktree,
    };
}
function localProjectToRaycastProject(project) {
    return {
        ...project,
        tint: raycastTintFromIconColor(project.iconColor),
        keywords: project.keywords ?? [],
    };
}
var project_picker_1 = require("./project-picker");
Object.defineProperty(exports, "ProjectPicker", { enumerable: true, get: function () { return project_picker_1.ProjectPicker; } });
var project_snapshot_1 = require("./project-snapshot");
Object.defineProperty(exports, "raggleProjectSnapshotPath", { enumerable: true, get: function () { return project_snapshot_1.raggleProjectSnapshotPath; } });
Object.defineProperty(exports, "readRaggleProjectSnapshot", { enumerable: true, get: function () { return project_snapshot_1.readRaggleProjectSnapshot; } });
__exportStar(require("./project-search"), exports);
