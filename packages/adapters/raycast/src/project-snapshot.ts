import { environment } from "@raycast/api";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { RaycastProject } from "./index";

const defaultRaggleExtensionName = "raggle";
const snapshotFilename = "standard-projects-snapshot.json";

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

type StoredRaggleProjectSnapshot = {
  schemaVersion?: unknown;
  generatedAt?: unknown;
  items?: unknown;
  listState?: unknown;
};

export type RaggleProjectListSnapshot = {
  schemaVersion: number;
  generatedAt?: number;
  projects: RaycastProject[];
  listState?: RaggleProjectListState;
};

function isRaycastProject(value: unknown): value is RaycastProject {
  if (!value || typeof value !== "object") return false;

  const project = value as Partial<RaycastProject>;
  return (
    typeof project.id === "string" &&
    typeof project.worktree === "string" &&
    typeof project.remoteUrl === "string" &&
    typeof project.repositoryRoot === "string"
  );
}

export function raggleProjectSnapshotPath(options: RaggleProjectSnapshotOptions = {}) {
  if (options.snapshotPath) return options.snapshotPath;

  const currentSupportPath = options.currentSupportPath ?? environment.supportPath;
  const raggleExtensionName = options.raggleExtensionName ?? defaultRaggleExtensionName;
  const extensionsPath = path.dirname(currentSupportPath);
  const raggleSupportPath =
    path.basename(currentSupportPath) === raggleExtensionName
      ? currentSupportPath
      : path.join(extensionsPath, raggleExtensionName);

  return path.join(raggleSupportPath, snapshotFilename);
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function parseListState(value: unknown): RaggleProjectListState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const listState = value as Partial<RaggleProjectListState>;
  const favoriteWorktrees = stringArray(listState.favoriteWorktrees);
  const recentSelectionWorktrees = stringArray(listState.recentSelectionWorktrees);
  if (!favoriteWorktrees || !recentSelectionWorktrees) return undefined;

  return {
    favoriteWorktrees,
    recentSelectionWorktrees,
    updatedAt: typeof listState.updatedAt === "number" ? listState.updatedAt : undefined,
  };
}

function applyListState(projects: RaycastProject[], listState: RaggleProjectListState | undefined) {
  if (!listState) return projects;

  const favorites = new Set(listState.favoriteWorktrees);
  const sourceOrder = new Map(projects.map((project, index) => [project.worktree, index]));
  const favoriteOrder = new Map(listState.favoriteWorktrees.map((worktree, index) => [worktree, index]));
  const recentOrder = new Map(listState.recentSelectionWorktrees.map((worktree, index) => [worktree, index]));

  return projects
    .map((project) => ({ ...project, isFavorite: favorites.has(project.worktree) }))
    .sort((left, right) => {
      if (left.isFavorite !== right.isFavorite) return left.isFavorite ? -1 : 1;
      const order = left.isFavorite ? favoriteOrder : recentOrder;
      const leftOrder = order.get(left.worktree);
      const rightOrder = order.get(right.worktree);
      if (leftOrder !== undefined || rightOrder !== undefined) {
        return (leftOrder ?? Number.POSITIVE_INFINITY) - (rightOrder ?? Number.POSITIVE_INFINITY);
      }
      return (sourceOrder.get(left.worktree) ?? 0) - (sourceOrder.get(right.worktree) ?? 0);
    });
}

export function readRaggleProjectListSnapshot(options: RaggleProjectSnapshotOptions = {}): RaggleProjectListSnapshot {
  const snapshotPath = raggleProjectSnapshotPath(options);
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as StoredRaggleProjectSnapshot;

  if (!Array.isArray(snapshot.items)) {
    throw new Error(`Invalid Raggle project snapshot: ${snapshotPath}`);
  }

  const projects = snapshot.items.filter(isRaycastProject);
  if (projects.length !== snapshot.items.length) {
    throw new Error(`Invalid project entry in Raggle project snapshot: ${snapshotPath}`);
  }

  const listState = parseListState(snapshot.listState);
  return {
    schemaVersion: typeof snapshot.schemaVersion === "number" ? snapshot.schemaVersion : 1,
    generatedAt: typeof snapshot.generatedAt === "number" ? snapshot.generatedAt : undefined,
    projects: applyListState(projects, listState),
    listState,
  };
}

export function readRaggleProjectSnapshot(options: RaggleProjectSnapshotOptions = {}) {
  return readRaggleProjectListSnapshot(options).projects;
}
