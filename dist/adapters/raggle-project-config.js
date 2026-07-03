"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_GLOBAL_IGNORED_SUBPATHS = void 0;
exports.normalizeIgnoredSubpaths = normalizeIgnoredSubpaths;
exports.mergeIgnoredSubpaths = mergeIgnoredSubpaths;
exports.mergeRaggleProjectConfig = mergeRaggleProjectConfig;
exports.readRaggleProjectConfig = readRaggleProjectConfig;
exports.ignoredSubpathsForProjectDirectory = ignoredSubpathsForProjectDirectory;
exports.ignoredSubpathsFromProjectActionConfigs = ignoredSubpathsFromProjectActionConfigs;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const project_config_fields_1 = require("../core/project-config-fields");
const project_subpaths_1 = require("../core/project-subpaths");
exports.DEFAULT_GLOBAL_IGNORED_SUBPATHS = [".raggle"];
function normalizeIgnoredSubpaths(input, fallback = []) {
    if (input === undefined)
        return fallback;
    const values = new Set();
    const items = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[\n,]/) : [];
    for (const item of items) {
        if (typeof item !== "string")
            continue;
        const normalized = item
            .trim()
            .replace(/^\/+|\/+$/g, "")
            .split("/")
            .filter(Boolean)
            .join("/");
        if (normalized)
            values.add(normalized);
    }
    return [...values];
}
function mergeIgnoredSubpaths(...inputs) {
    return normalizeIgnoredSubpaths(inputs.flatMap((input) => input ?? []));
}
function mergeConfiguredPaths(localItems, importedItems) {
    const itemsByPath = new Map();
    for (const item of localItems ?? [])
        itemsByPath.set(item.path, item);
    for (const item of importedItems)
        itemsByPath.set(item.path, item);
    return [...itemsByPath.values()];
}
function mergeRaggleProjectConfig(repository, config) {
    const hasLocalName = Boolean(config.name);
    const name = repository.name ?? config.name;
    return {
        ...repository,
        ...(name ? { name } : {}),
        hasCustomName: repository.hasCustomName || hasLocalName,
        tags: [...new Set([...(config.tags ?? []), ...repository.tags])],
        folders: [...new Set([...(config.folders ?? []), ...repository.folders])],
        subpaths: mergeConfiguredPaths(config.subpaths, repository.subpaths),
        allSubpath: repository.allSubpath || config.allSubpath === true,
        removePathFromName: repository.removePathFromName || config.removePathFromName === true,
    };
}
function readRaggleProjectConfig(directory) {
    const configPath = node_path_1.default.join(directory, "raggle.json");
    if (!(0, node_fs_1.existsSync)(configPath))
        return {};
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(configPath, "utf8"));
        const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
        return {
            ...(name ? { name } : {}),
            tags: (0, project_config_fields_1.normalizeTags)(parsed.tags),
            folders: (0, project_config_fields_1.normalizeFolders)(parsed.folders),
            subpaths: (0, project_subpaths_1.normalizeSubpaths)(parsed.subpaths),
            ...(typeof parsed.allSubpath === "boolean" ? { allSubpath: parsed.allSubpath } : {}),
            ...(typeof parsed.removePathFromName === "boolean" ? { removePathFromName: parsed.removePathFromName } : {}),
            ignoredSubpaths: normalizeIgnoredSubpaths(parsed.ignoredSubpaths),
        };
    }
    catch (error) {
        console.warn(`Failed to read ${configPath}:`, error);
        return {};
    }
}
function ignoredSubpathsForProjectDirectory(directory, baseIgnoredSubpaths = []) {
    const config = readRaggleProjectConfig(directory);
    return mergeIgnoredSubpaths(baseIgnoredSubpaths, config.ignoredSubpaths);
}
function ignoredSubpathsFromProjectActionConfigs(configs) {
    return mergeIgnoredSubpaths(...configs.map((config) => normalizeIgnoredSubpaths(config.ignoredSubpaths)));
}
