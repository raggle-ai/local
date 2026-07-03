type ProjectRow = {
    id: string;
    worktree: string;
    name?: string | null;
    worktree_name?: string | null;
    latest_session_title?: string | null;
    icon_color?: string | null;
    startup_command?: string | null;
    time_updated?: number | null;
    sandbox_count?: number | null;
    has_icon?: number | null;
};
export type VisibleProjectRow = ProjectRow & {
    kind: "project" | "session_only";
};
export type LatestSessionRow = {
    id: string;
    directory: string;
    time_updated?: number | null;
};
export declare function listVisibleProjects(): Promise<VisibleProjectRow[]>;
export declare function latestSessionForWorktree(worktree: string): Promise<LatestSessionRow | undefined>;
export declare function saveProjectIcon(worktree: string, icon: string): Promise<void>;
export {};
