import type { RaycastProject } from "./index";
export type RaggleProjectSnapshotOptions = {
    currentSupportPath?: string;
    raggleExtensionName?: string;
    snapshotPath?: string;
};
export declare function raggleProjectSnapshotPath(options?: RaggleProjectSnapshotOptions): string;
export declare function readRaggleProjectSnapshot(options?: RaggleProjectSnapshotOptions): RaycastProject[];
