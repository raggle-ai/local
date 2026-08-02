"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSubpathPath = normalizeSubpathPath;
exports.normalizeSubpaths = normalizeSubpaths;
exports.normalizeSubpathPaths = normalizeSubpathPaths;
exports.mergeExistingSubpathSettings = mergeExistingSubpathSettings;
exports.upsertSubpathSettings = upsertSubpathSettings;
exports.shouldIncludeSubpathDirectory = shouldIncludeSubpathDirectory;
exports.readSubpathChildDirectories = readSubpathChildDirectories;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const skippedSubpathDirectories = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    ".turbo",
    ".vercel",
    "target",
]);
function normalizeSubpathPath(input) {
    return input
        .trim()
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .filter(Boolean)
        .join("/");
}
function normalizeSubpaths(input) {
    if (input === true)
        return [{ path: "." }];
    const subpaths = new Map();
    if (Array.isArray(input)) {
        for (const item of input) {
            if (typeof item === "string") {
                const normalizedPath = normalizeSubpathPath(item);
                if (!normalizedPath)
                    continue;
                subpaths.set(normalizedPath, { path: normalizedPath });
                continue;
            }
            if (!item || typeof item !== "object")
                continue;
            const pathValue = item.path;
            if (typeof pathValue !== "string")
                continue;
            const normalizedPath = normalizeSubpathPath(pathValue);
            if (!normalizedPath)
                continue;
            const removePathFromName = item.removePathFromName;
            const allSubpath = item.allSubpath;
            subpaths.set(normalizedPath, {
                path: normalizedPath,
                ...(typeof allSubpath === "boolean" ? { allSubpath } : {}),
                ...(typeof removePathFromName === "boolean" ? { removePathFromName } : {}),
            });
        }
    }
    return [...subpaths.values()];
}
function normalizeSubpathPaths(input) {
    return normalizeSubpaths(input).map((subpath) => subpath.path);
}
function mergeExistingSubpathSettings(existingInput, nextInput) {
    const existingByPath = new Map(normalizeSubpaths(existingInput).map((subpath) => [subpath.path, subpath]));
    return normalizeSubpathPaths(nextInput).map((subpathPath) => {
        const existing = existingByPath.get(subpathPath);
        if (!existing || (!("allSubpath" in existing) && !existing.removePathFromName))
            return subpathPath;
        return existing;
    });
}
function upsertSubpathSettings(input, subpathPath, values) {
    const normalizedSubpath = normalizeSubpathPath(subpathPath);
    if (!normalizedSubpath)
        return [];
    const existingSubpaths = normalizeSubpaths(input);
    const existingIndex = existingSubpaths.findIndex((subpath) => subpath.path === normalizedSubpath);
    const nextSubpath = {
        ...(existingIndex >= 0 ? existingSubpaths[existingIndex] : { path: normalizedSubpath }),
        allSubpath: values.allSubpath,
        ...(values.removePathFromName ? { removePathFromName: true } : {}),
    };
    if (!values.removePathFromName)
        delete nextSubpath.removePathFromName;
    const nextSubpaths = [...existingSubpaths];
    if (existingIndex >= 0)
        nextSubpaths[existingIndex] = nextSubpath;
    else if (values.allSubpath || values.removePathFromName)
        nextSubpaths.push(nextSubpath);
    return nextSubpaths;
}
function shouldIncludeSubpathDirectory(name) {
    return !name.startsWith(".") && !name.startsWith("_") && !skippedSubpathDirectories.has(name);
}
function readSubpathChildDirectories(parentDirectory) {
    const items = new Set();
    try {
        for (const entry of (0, node_fs_1.readdirSync)(parentDirectory, { withFileTypes: true })) {
            if (!entry.isDirectory() || !shouldIncludeSubpathDirectory(entry.name))
                continue;
            items.add(node_path_1.default.join(parentDirectory, entry.name));
        }
    }
    catch {
        // Ignore missing or unreadable optional subpath directories.
    }
    return [...items];
}
