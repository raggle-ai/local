"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTags = exports.normalizeFolders = exports.normalizeSubpathPaths = exports.normalizeSubpaths = void 0;
exports.normalizeClonePathTemplate = normalizeClonePathTemplate;
exports.normalizePlugins = normalizePlugins;
exports.readImportedRepositoryRows = readImportedRepositoryRows;
exports.readImportedRepositoryPlugins = readImportedRepositoryPlugins;
exports.writeImportedRepositoryRows = writeImportedRepositoryRows;
exports.loadImportedRepositories = loadImportedRepositories;
exports.loadImportedRepositoriesFromRows = loadImportedRepositoriesFromRows;
exports.loadRepositorySubpaths = loadRepositorySubpaths;
const node_fs_1 = require("node:fs");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const git_repository_1 = require("./git-repository");
const project_config_fields_1 = require("../core/project-config-fields");
const project_subpaths_1 = require("../core/project-subpaths");
var project_subpaths_2 = require("../core/project-subpaths");
Object.defineProperty(exports, "normalizeSubpaths", { enumerable: true, get: function () { return project_subpaths_2.normalizeSubpaths; } });
Object.defineProperty(exports, "normalizeSubpathPaths", { enumerable: true, get: function () { return project_subpaths_2.normalizeSubpathPaths; } });
var project_config_fields_2 = require("../core/project-config-fields");
Object.defineProperty(exports, "normalizeFolders", { enumerable: true, get: function () { return project_config_fields_2.normalizeFolders; } });
Object.defineProperty(exports, "normalizeTags", { enumerable: true, get: function () { return project_config_fields_2.normalizeTags; } });
function normalizeClonePathTemplate(input) {
    if (typeof input !== "string")
        return undefined;
    const value = input.trim();
    if (!value)
        return undefined;
    if (node_path_1.default.isAbsolute(value))
        return value;
    const normalized = value
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .filter(Boolean)
        .join("/");
    return normalized || undefined;
}
function normalizePlugins(input, baseDirectory) {
    const plugins = new Set();
    if (!Array.isArray(input))
        return [];
    for (const item of input) {
        if (typeof item !== "string")
            continue;
        const plugin = item.trim();
        if (!plugin)
            continue;
        if (plugin === "~" || plugin.startsWith(`~${node_path_1.default.sep}`)) {
            plugins.add(expandHomePath(plugin));
            continue;
        }
        if (plugin.startsWith(".") || node_path_1.default.isAbsolute(plugin)) {
            plugins.add(node_path_1.default.resolve(baseDirectory, plugin));
            continue;
        }
        plugins.add(plugin);
    }
    return [...plugins];
}
function expandHomePath(input) {
    if (input === "~")
        return node_os_1.default.homedir();
    if (input.startsWith(`~${node_path_1.default.sep}`))
        return node_path_1.default.join(node_os_1.default.homedir(), input.slice(2));
    return input;
}
function stripJsonComments(input) {
    let result = "";
    let inString = false;
    let escaped = false;
    for (let index = 0; index < input.length; index += 1) {
        const current = input[index];
        const next = input[index + 1];
        if (inString) {
            result += current;
            if (escaped)
                escaped = false;
            else if (current === "\\")
                escaped = true;
            else if (current === '"')
                inString = false;
            continue;
        }
        if (current === '"') {
            inString = true;
            result += current;
            continue;
        }
        if (current === "/" && next === "/") {
            while (index < input.length && input[index] !== "\n")
                index += 1;
            if (index < input.length)
                result += input[index];
            continue;
        }
        if (current === "/" && next === "*") {
            index += 2;
            while (index < input.length && !(input[index] === "*" && input[index + 1] === "/")) {
                if (input[index] === "\n")
                    result += "\n";
                index += 1;
            }
            index += 1;
            continue;
        }
        result += current;
    }
    return result;
}
function stripTrailingCommas(input) {
    let result = "";
    let inString = false;
    let escaped = false;
    for (let index = 0; index < input.length; index += 1) {
        const current = input[index];
        if (inString) {
            result += current;
            if (escaped)
                escaped = false;
            else if (current === "\\")
                escaped = true;
            else if (current === '"')
                inString = false;
            continue;
        }
        if (current === '"') {
            inString = true;
            result += current;
            continue;
        }
        if (current === ",") {
            let lookahead = index + 1;
            while (lookahead < input.length && /\s/.test(input[lookahead]))
                lookahead += 1;
            if (input[lookahead] === "]" || input[lookahead] === "}")
                continue;
        }
        result += current;
    }
    return result;
}
function parseJsonc(input) {
    return JSON.parse(stripTrailingCommas(stripJsonComments(input)));
}
function importedRepositoryRowsFromParsed(parsed) {
    if (Array.isArray(parsed))
        return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.projects)) {
        return parsed.projects;
    }
    throw new Error("Repository import file must contain a JSON array or an object with a projects array");
}
function importedRepositoryPluginsFromParsed(parsed, baseDirectory) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return [];
    return normalizePlugins(parsed.plugins, baseDirectory);
}
function readImportedRepositoryFile(filePath) {
    const content = (0, node_fs_1.readFileSync)(filePath, "utf8");
    const parsed = parseJsonc(content);
    return {
        rows: importedRepositoryRowsFromParsed(parsed),
        plugins: importedRepositoryPluginsFromParsed(parsed, node_path_1.default.dirname(filePath)),
    };
}
function readImportedRepositoryRows(filePath) {
    const { rows } = readImportedRepositoryFile(filePath);
    return rows.map((item, index) => {
        const row = item;
        if (!row?.url || typeof row.url !== "string") {
            throw new Error(`Repository entry ${index + 1} is missing a valid url`);
        }
        return row;
    });
}
function readImportedRepositoryPlugins(filePath) {
    return readImportedRepositoryFile(filePath).plugins;
}
function writeImportedRepositoryRows(filePath, rows) {
    const content = (0, node_fs_1.readFileSync)(filePath, "utf8");
    const parsed = parseJsonc(content);
    if (Array.isArray(parsed)) {
        (0, node_fs_1.writeFileSync)(filePath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
        return;
    }
    if (parsed && typeof parsed === "object" && "projects" in parsed) {
        (0, node_fs_1.writeFileSync)(filePath, `${JSON.stringify({ ...parsed, projects: rows }, null, 2)}\n`, "utf8");
        return;
    }
    throw new Error("Repository import file must contain a JSON array or an object with a projects array");
}
function loadImportedRepositories(filePath) {
    const repositoryFile = readImportedRepositoryFile(filePath);
    return loadImportedRepositoriesFromRows(repositoryFile.rows, repositoryFile.plugins);
}
function loadImportedRepositoriesFromRows(rows, plugins = []) {
    return rows.map((item, index) => {
        const row = item;
        if (!row?.url || typeof row.url !== "string") {
            throw new Error(`Repository entry ${index + 1} is missing a valid url`);
        }
        const remoteUrl = (0, git_repository_1.normalizeRepositoryUrl)(row.url);
        const repository = (0, git_repository_1.repositoryName)(remoteUrl);
        const name = typeof row.name === "string" ? row.name.trim() : "";
        const description = typeof row.description === "string" ? row.description.trim() : "";
        return {
            remoteUrl,
            repository,
            name: name || undefined,
            description: description || undefined,
            hasCustomName: Boolean(name),
            tags: (0, project_config_fields_1.normalizeTags)(row.tags),
            subpaths: (0, project_subpaths_1.normalizeSubpaths)(row.subpaths),
            allSubpath: row.allSubpath === true,
            collapseSubpaths: row.collapseSubpaths === true,
            allTopLevelFolders: row.allTopLevelFolders === true,
            folders: (0, project_config_fields_1.normalizeFolders)(row.folders),
            clonePathTemplate: normalizeClonePathTemplate(row.clonePathTemplate),
            plugins,
            removePathFromName: row.removePathFromName === true,
        };
    });
}
function loadRepositorySubpaths(worktree, subpaths) {
    const items = new Set();
    for (const subpath of subpaths) {
        const parentDirectory = subpath.path === "." ? worktree : node_path_1.default.join(worktree, ...subpath.path.split("/"));
        for (const item of (0, project_subpaths_1.readSubpathChildDirectories)(parentDirectory))
            items.add(item);
    }
    return [...items];
}
