import { type ImportedRepository } from "./import";
import { type ImportedRepositorySubpath } from "../core/project-subpaths";
import type { ProjectActionConfig } from "../core/project-actions";
export declare const DEFAULT_GLOBAL_IGNORED_SUBPATHS: string[];
export type RaggleProjectConfig = {
    /** @deprecated Repository-local names are ignored; provide the name in RemoteProject instead. */
    name?: string;
    tags?: string[];
    folders?: string[];
    subpaths?: ImportedRepositorySubpath[];
    /** Shorthand for allTopLevelFolders. */
    allSubpaths?: boolean;
    /** Recursively includes every eligible descendant folder. */
    collapseSubpaths?: boolean;
    /** Includes every eligible folder directly below the configured directory. */
    allTopLevelFolders?: boolean;
    removePathFromName?: boolean;
    ignoredSubpaths?: string[];
    /** Repository-root folders whose complete subtrees are excluded from discovery. */
    excludeFolders?: string[];
};
export declare class RaggleProjectConfigParseError extends SyntaxError {
    readonly configPath: string;
    constructor(configPath: string, message: string);
}
export declare function normalizeIgnoredSubpaths(input: unknown, fallback?: string[]): string[];
export declare function mergeIgnoredSubpaths(...inputs: Array<string[] | undefined>): string[];
export declare function mergeRaggleProjectConfig(repository: ImportedRepository, config: RaggleProjectConfig): ImportedRepository;
export declare function requiresRaggleConfigMarker(configFile: string): boolean;
/** Config file names checked in order; the first file that exists wins. */
export declare const DEFAULT_PROJECT_CONFIG_FILES: string[];
/** Custom names take lookup priority, followed by the defaults. */
export declare function resolveProjectConfigFileNames(customConfigFiles?: string[]): string[];
export declare function readRaggleProjectConfig(directory: string, configFiles?: string[]): RaggleProjectConfig;
/**
 * Reads and parses one specific config file. Returns undefined when the file
 * is missing or when a generic file name (like index.json) does not
 * self-identify as a raggle config via $schema or schemaVersion.
 */
export declare function readProjectConfigFileAsync(configPath: string): Promise<RaggleProjectConfig | undefined>;
export declare function readRaggleProjectConfigAsync(directory: string, configFiles?: string[]): Promise<RaggleProjectConfig>;
export declare function ignoredSubpathsForProjectDirectory(directory: string, baseIgnoredSubpaths?: string[], configFiles?: string[]): string[];
export declare function ignoredSubpathsFromProjectActionConfigs(configs: ProjectActionConfig[]): string[];
export declare function raggleProjectConfigFromProjectActionConfigs(configs: ProjectActionConfig[]): RaggleProjectConfig;
