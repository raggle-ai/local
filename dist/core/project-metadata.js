"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeLocalProjectMetadata = mergeLocalProjectMetadata;
const node_path_1 = __importDefault(require("node:path"));
const project_keywords_1 = require("./project-keywords");
function resolvedProjectName(project, metadata) {
    if (project.relativePath || project.hasCustomName)
        return project.name;
    return metadata?.name ?? project.name;
}
function nearestInheritedIconSource(project, projectsByWorktree, metadataByWorktree) {
    if (!project.relativePath)
        return undefined;
    let currentDirectory = node_path_1.default.dirname(project.worktree);
    while (currentDirectory && currentDirectory !== project.worktree) {
        if (projectsByWorktree.has(currentDirectory)) {
            const metadata = metadataByWorktree.get(currentDirectory);
            if (metadata?.icon)
                return metadata;
        }
        const nextDirectory = node_path_1.default.dirname(currentDirectory);
        if (nextDirectory === currentDirectory)
            break;
        currentDirectory = nextDirectory;
    }
    return metadataByWorktree.get(project.repositoryRoot);
}
/** Merges consumer metadata into discovered projects and inherits repository icons for subpaths. */
function mergeLocalProjectMetadata(projects, metadataItems) {
    const projectsByWorktree = new Map(projects.map((project) => [project.worktree, project]));
    const metadataByWorktree = new Map(metadataItems.map((metadata) => [metadata.worktree, metadata]));
    return projects.map((project) => {
        const metadata = metadataByWorktree.get(project.worktree);
        const inheritedIcon = nearestInheritedIconSource(project, projectsByWorktree, metadataByWorktree);
        if (!metadata) {
            if (!inheritedIcon?.icon)
                return project;
            return (0, project_keywords_1.projectWithKeywords)({
                ...project,
                icon: project.icon ?? inheritedIcon.icon,
                iconColor: project.iconColor ?? inheritedIcon.iconColor,
                hasIcon: project.hasIcon || Boolean(inheritedIcon.icon),
            });
        }
        return (0, project_keywords_1.projectWithKeywords)({
            ...project,
            name: resolvedProjectName(project, metadata),
            worktreeName: metadata.worktreeName ?? project.worktreeName,
            tags: metadata.tags ?? project.tags,
            latestSessionTitle: metadata.latestSessionTitle ?? project.latestSessionTitle,
            icon: metadata.icon ?? inheritedIcon?.icon ?? project.icon,
            iconColor: metadata.iconColor ?? inheritedIcon?.iconColor ?? project.iconColor,
            startupCommand: metadata.startupCommand ?? project.startupCommand,
            sandboxCount: metadata.sandboxCount ?? project.sandboxCount,
            updatedAt: metadata.updatedAt ?? project.updatedAt,
            hasIcon: Boolean(metadata.hasIcon) || Boolean(inheritedIcon?.icon) || project.hasIcon,
            isSessionOnly: metadata.isSessionOnly ?? project.isSessionOnly,
            isFavorite: metadata.isFavorite ?? project.isFavorite,
            relatedIds: metadata.relatedIds ?? project.relatedIds,
        });
    });
}
