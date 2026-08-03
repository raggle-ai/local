import type { RaycastProject } from "./index";
export type RaggleProjectSnapshotOptions = {
    currentSupportPath?: string;
    raggleExtensionName?: string;
    snapshotPath?: string;
};
export type RaggleProjectListState = {
    favoriteWorktrees: string[];
    recentSelectionWorktrees: string[];
    updatedAt?: number;
};
export type RaycastProjectSnapshot = {
    schemaVersion: number;
    sourceFile: string;
    sourceMtimeMs?: number;
    generatedAt: number;
    items: RaycastProject[];
    listState?: RaggleProjectListState;
};
export type RaggleProjectListSnapshot = {
    schemaVersion: number;
    generatedAt?: number;
    projects: RaycastProject[];
    listState?: RaggleProjectListState;
};
export declare function raggleProjectSnapshotPath(options?: RaggleProjectSnapshotOptions): string;
export declare function readRaycastProjectsSnapshot(sourceFile: string, options?: RaggleProjectSnapshotOptions): RaycastProjectSnapshot | undefined;
export declare function readLastRaycastProjectsSnapshot(sourceFile: string, options?: RaggleProjectSnapshotOptions): RaycastProjectSnapshot | undefined;
export declare function writeRaycastProjectsSnapshot(sourceFile: string, items: RaycastProject[], options?: RaggleProjectSnapshotOptions): RaycastProjectSnapshot;
export declare function writeRaycastProjectListState(listState: Omit<RaggleProjectListState, "updatedAt">, options?: RaggleProjectSnapshotOptions): RaycastProjectSnapshot | undefined;
export declare function readRaggleProjectListSnapshot(options?: RaggleProjectSnapshotOptions): RaggleProjectListSnapshot;
export declare function readRaggleProjectSnapshot(options?: RaggleProjectSnapshotOptions): RaycastProject[];
