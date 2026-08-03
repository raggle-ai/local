import type { ImportedRepository } from "./import";
export declare function resolveProjectActionPluginDirectories(projectActionDirectories: readonly string[]): string[];
export declare function applyProjectActionPlugins(repositories: ImportedRepository[], projectActionDirectories: readonly string[]): ImportedRepository[];
