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
export type RaggleProjectListSnapshot = {
    schemaVersion: number;
    generatedAt?: number;
    projects: RaycastProject[];
    listState?: RaggleProjectListState;
};
export declare function raggleProjectSnapshotPath(options?: RaggleProjectSnapshotOptions): string;
export declare function readRaggleProjectListSnapshot(options?: RaggleProjectSnapshotOptions): RaggleProjectListSnapshot;
export declare function readRaggleProjectSnapshot(options?: RaggleProjectSnapshotOptions): RaycastProject[];
