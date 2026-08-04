"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverRepository = discoverRepository;
exports.scanCloneDirectoryRepositories = scanCloneDirectoryRepositories;
const node_module_1 = require("node:module");
const node_path_1 = __importDefault(require("node:path"));
const git_repository_1 = require("../adapters/git-repository");
const nativeRequire = (0, node_module_1.createRequire)(__filename);
let nativeScanner;
function loadNativeScanner() {
    nativeScanner ??= nativeRequire(process.env.NAPI_RS_NATIVE_LIBRARY_PATH ?? "../native");
    return nativeScanner;
}
function boundedInteger(value, fallback, minimum, maximum) {
    if (value === undefined || !Number.isFinite(value))
        return fallback;
    return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}
function normalizedLimits(options) {
    return {
        maxDepth: boundedInteger(options?.maxDepth, 3, 1, 8),
        maxRepos: boundedInteger(options?.maxRepos, 100, 1, 100_000),
        timeoutMs: boundedInteger(options?.timeoutMs, 10_000, 1, 30_000),
    };
}
function normalizeRepository(repository) {
    return {
        ...repository,
        worktree: node_path_1.default.resolve(repository.worktree),
        remoteUrl: (0, git_repository_1.normalizeRepositoryUrl)(repository.remoteUrl),
    };
}
/** Identifies a Git repository rooted at exactly the supplied directory. */
function discoverRepository(directory) {
    const repository = loadNativeScanner().discoverRepository(node_path_1.default.resolve(directory));
    return repository ? normalizeRepository(repository) : undefined;
}
/**
 * Discovers repositories without blocking the JavaScript event loop. Traversal
 * runs in napi-rs' async worker pool and is bounded by depth, count, and time.
 */
async function scanCloneDirectoryRepositories(cloneDirectory, options) {
    const limits = normalizedLimits(options);
    if (options?.signal?.aborted) {
        return {
            repositories: [],
            warnings: [],
            truncated: false,
            timedOut: false,
            stopped: true,
            durationMs: 0,
            ...limits,
        };
    }
    let progressCount = 0;
    const result = await loadNativeScanner().scanCloneDirectoryRepositories(node_path_1.default.resolve(cloneDirectory), limits, options?.signal, options?.onProgress
        ? ([repository]) => {
            progressCount += 1;
            options.onProgress?.(normalizeRepository(repository), progressCount);
            return options.signal?.aborted ?? false;
        }
        : undefined);
    const normalized = {
        ...result,
        repositories: result.repositories.map(normalizeRepository),
    };
    return normalized;
}
