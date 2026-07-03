import { type ImportedRepository } from "./import";
import { type ImportedRepositorySubpath } from "../core/project-subpaths";
import type { ProjectActionConfig } from "../core/project-actions";
export declare const DEFAULT_GLOBAL_IGNORED_SUBPATHS: string[];
export type RaggleProjectConfig = {
    name?: string;
    tags?: string[];
    folders?: string[];
    subpaths?: ImportedRepositorySubpath[];
    allSubpath?: boolean;
    removePathFromName?: boolean;
    ignoredSubpaths?: string[];
};
export declare function normalizeIgnoredSubpaths(input: unknown, fallback?: string[]): string[];
export declare function mergeIgnoredSubpaths(...inputs: Array<string[] | undefined>): string[];
export declare function mergeRaggleProjectConfig(repository: ImportedRepository, config: RaggleProjectConfig): ImportedRepository;
export declare function readRaggleProjectConfig(directory: string): RaggleProjectConfig;
export declare function ignoredSubpathsForProjectDirectory(directory: string, baseIgnoredSubpaths?: string[]): string[];
export declare function ignoredSubpathsFromProjectActionConfigs(configs: ProjectActionConfig[]): string[];
