"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROJECT_CONFIG_FILES = exports.RaggleProjectConfigParseError = exports.DEFAULT_GLOBAL_IGNORED_SUBPATHS = void 0;
exports.normalizeIgnoredSubpaths = normalizeIgnoredSubpaths;
exports.mergeIgnoredSubpaths = mergeIgnoredSubpaths;
exports.mergeRaggleProjectConfig = mergeRaggleProjectConfig;
exports.requiresRaggleConfigMarker = requiresRaggleConfigMarker;
exports.resolveProjectConfigFileNames = resolveProjectConfigFileNames;
exports.readRaggleProjectConfig = readRaggleProjectConfig;
exports.readProjectConfigFileAsync = readProjectConfigFileAsync;
exports.readRaggleProjectConfigAsync = readRaggleProjectConfigAsync;
exports.ignoredSubpathsForProjectDirectory = ignoredSubpathsForProjectDirectory;
exports.ignoredSubpathsFromProjectActionConfigs = ignoredSubpathsFromProjectActionConfigs;
exports.raggleProjectConfigFromProjectActionConfigs = raggleProjectConfigFromProjectActionConfigs;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const project_config_fields_1 = require("../core/project-config-fields");
const project_subpaths_1 = require("../core/project-subpaths");
exports.DEFAULT_GLOBAL_IGNORED_SUBPATHS = [".raggle"];
class RaggleProjectConfigParseError extends SyntaxError {
    constructor(configPath, message) {
        super(message);
        this.configPath = configPath;
        this.name = "RaggleProjectConfigParseError";
    }
}
exports.RaggleProjectConfigParseError = RaggleProjectConfigParseError;
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
    return {
        ...repository,
        tags: [...new Set([...(config.tags ?? []), ...repository.tags])],
        folders: [...new Set([...(config.folders ?? []), ...repository.folders])],
        subpaths: mergeConfiguredPaths(config.subpaths, repository.subpaths),
        allSubpath: repository.allSubpath,
        collapseSubpaths: repository.collapseSubpaths || config.collapseSubpaths === true,
        allTopLevelFolders: repository.allTopLevelFolders ||
            repository.allSubpath ||
            config.allTopLevelFolders === true ||
            config.allSubpaths === true,
        removePathFromName: repository.removePathFromName || config.removePathFromName === true,
    };
}
/**
 * Generic file names that are only honored as project config when the
 * document self-identifies as one, since unrelated files often share the name.
 */
const GENERIC_PROJECT_CONFIG_FILES = new Set(["index.json"]);
function isRaggleConfigDocument(parsed) {
    if (!parsed || typeof parsed !== "object")
        return false;
    const document = parsed;
    if (typeof document.$schema === "string" && document.$schema.includes("raggle"))
        return true;
    return document.schemaVersion !== undefined;
}
function requiresRaggleConfigMarker(configFile) {
    return GENERIC_PROJECT_CONFIG_FILES.has(node_path_1.default.basename(configFile));
}
function normalizeRaggleProjectConfig(parsed) {
    const allSubpaths = typeof parsed.allSubpaths === "boolean" ? parsed.allSubpaths : undefined;
    const allTopLevelFolders = parsed.allTopLevelFolders === true || allSubpaths === true
        ? true
        : parsed.allTopLevelFolders === false || allSubpaths === false
            ? false
            : undefined;
    return {
        tags: (0, project_config_fields_1.normalizeTags)(parsed.tags),
        folders: (0, project_config_fields_1.normalizeFolders)(parsed.folders),
        subpaths: (0, project_subpaths_1.normalizeSubpaths)(parsed.subpaths),
        ...(allSubpaths !== undefined ? { allSubpaths } : {}),
        ...(typeof parsed.collapseSubpaths === "boolean" ? { collapseSubpaths: parsed.collapseSubpaths } : {}),
        ...(allTopLevelFolders !== undefined ? { allTopLevelFolders } : {}),
        ...(typeof parsed.removePathFromName === "boolean" ? { removePathFromName: parsed.removePathFromName } : {}),
        ignoredSubpaths: normalizeIgnoredSubpaths(parsed.ignoredSubpaths),
        excludeFolders: normalizeIgnoredSubpaths(parsed.excludeFolders),
    };
}
function jsonParseError(configPath, raw, error) {
    const originalMessage = error instanceof Error ? error.message : String(error);
    const positionMatch = originalMessage.match(/\bposition\s+(\d+)/i);
    let offset = positionMatch ? Number.parseInt(positionMatch[1], 10) : undefined;
    let reason = originalMessage
        .replace(/^JSON\.parse:\s*/i, "")
        .replace(/\s+at position\s+\d+(?:\s+\(line\s+\d+\s+column\s+\d+\))?\s*$/i, "");
    if (offset !== undefined) {
        let previous = offset - 1;
        while (previous >= 0 && /\s/.test(raw[previous]))
            previous -= 1;
        if ((raw[offset] === "}" || raw[offset] === "]") && raw[previous] === ",") {
            offset = previous;
            reason = "Trailing commas are not valid JSON";
        }
    }
    if (offset === undefined || !Number.isFinite(offset)) {
        return new RaggleProjectConfigParseError(configPath, `Invalid Raggle config: ${configPath}\n${reason}`);
    }
    const lineStart = raw.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
    const lineEnd = raw.indexOf("\n", offset);
    const sourceLine = raw.slice(lineStart, lineEnd === -1 ? raw.length : lineEnd);
    const line = raw.slice(0, offset).split("\n").length;
    const column = offset - lineStart + 1;
    const caret = `${" ".repeat(Math.max(0, column - 1))}^`;
    return new RaggleProjectConfigParseError(configPath, `Invalid Raggle config: ${configPath}\n${reason} at line ${line}, column ${column}\n${sourceLine}\n${caret}`);
}
/** Returns undefined when a generic file (like index.json) is not a raggle config. */
function parseRaggleProjectConfig(configPath, raw, requireMarker) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw jsonParseError(configPath, raw, error);
    }
    if (requireMarker && !isRaggleConfigDocument(parsed))
        return undefined;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new RaggleProjectConfigParseError(configPath, `Invalid Raggle config: ${configPath}\nThe root value must be a JSON object`);
    }
    return normalizeRaggleProjectConfig(parsed);
}
/** Config file names checked in order; the first file that exists wins. */
exports.DEFAULT_PROJECT_CONFIG_FILES = ["raggle.json", "index.json"];
/** Custom names take lookup priority, followed by the defaults. */
function resolveProjectConfigFileNames(customConfigFiles) {
    if (!customConfigFiles?.length)
        return exports.DEFAULT_PROJECT_CONFIG_FILES;
    return [...new Set([...customConfigFiles, ...exports.DEFAULT_PROJECT_CONFIG_FILES])];
}
function readRaggleProjectConfig(directory, configFiles) {
    for (const configFile of resolveProjectConfigFileNames(configFiles)) {
        const configPath = node_path_1.default.join(directory, configFile);
        let raw;
        try {
            raw = (0, node_fs_1.readFileSync)(configPath, "utf8");
        }
        catch {
            continue;
        }
        const config = parseRaggleProjectConfig(configPath, raw, requiresRaggleConfigMarker(configFile));
        if (config)
            return config;
    }
    return {};
}
/**
 * Reads and parses one specific config file. Returns undefined when the file
 * is missing or when a generic file name (like index.json) does not
 * self-identify as a raggle config via $schema or schemaVersion.
 */
async function readProjectConfigFileAsync(configPath) {
    let raw;
    try {
        raw = await (0, promises_1.readFile)(configPath, "utf8");
    }
    catch {
        return undefined;
    }
    return parseRaggleProjectConfig(configPath, raw, requiresRaggleConfigMarker(configPath));
}
async function readRaggleProjectConfigAsync(directory, configFiles) {
    for (const configFile of resolveProjectConfigFileNames(configFiles)) {
        const config = await readProjectConfigFileAsync(node_path_1.default.join(directory, configFile));
        if (config)
            return config;
    }
    return {};
}
function ignoredSubpathsForProjectDirectory(directory, baseIgnoredSubpaths = [], configFiles) {
    const config = readRaggleProjectConfig(directory, configFiles);
    return mergeIgnoredSubpaths(baseIgnoredSubpaths, config.ignoredSubpaths);
}
function ignoredSubpathsFromProjectActionConfigs(configs) {
    return mergeIgnoredSubpaths(...configs.map((config) => normalizeIgnoredSubpaths(config.ignoredSubpaths)));
}
function raggleProjectConfigFromProjectActionConfigs(configs) {
    const allSubpaths = configs.some((config) => config.allSubpath === true);
    return {
        tags: [...new Set(configs.flatMap((config) => (0, project_config_fields_1.normalizeTags)(config.tags)))],
        folders: [...new Set(configs.flatMap((config) => (0, project_config_fields_1.normalizeFolders)(config.folders)))],
        subpaths: mergeConfiguredPaths([], configs.flatMap((config) => (0, project_subpaths_1.normalizeSubpaths)(config.subpaths))),
        allSubpaths,
        collapseSubpaths: configs.some((config) => config.collapseSubpaths === true),
        allTopLevelFolders: allSubpaths || configs.some((config) => config.allTopLevelFolders === true),
        removePathFromName: configs.some((config) => config.removePathFromName === true),
    };
}
