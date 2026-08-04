import { environment } from "@raycast/api";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

export type RaycastProjectSnapshot = {
  schemaVersion: number;
  sourceFile: string;
  sourceMtimeMs?: number;
  generatedAt: number;
  items: RaycastProject[];
  listState?: RaggleProjectListState;
};

type StoredRaggleProjectSnapshot = {
  schemaVersion?: unknown;
  sourceFile?: unknown;
  sourceMtimeMs?: unknown;
  generatedAt?: unknown;
  items?: unknown;
  listState?: unknown;
};

const projectSnapshotMemoryCache = new Map<string, RaycastProjectSnapshot>();

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

function sourceMtimeMs(sourceFile: string) {
  try {
    return statSync(sourceFile).mtimeMs;
  } catch {
    return undefined;
  }
}

function parseStoredSnapshot(snapshotPath: string): RaycastProjectSnapshot | undefined {
  let snapshot: StoredRaggleProjectSnapshot;
  try {
    snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as StoredRaggleProjectSnapshot;
  } catch {
    return undefined;
  }

  if (!Array.isArray(snapshot.items) || snapshot.items.some((item) => !isRaycastProject(item))) return undefined;
  if (typeof snapshot.sourceFile !== "string") return undefined;

  return {
    schemaVersion: typeof snapshot.schemaVersion === "number" ? snapshot.schemaVersion : 1,
    sourceFile: snapshot.sourceFile,
    sourceMtimeMs: typeof snapshot.sourceMtimeMs === "number" ? snapshot.sourceMtimeMs : undefined,
    generatedAt: typeof snapshot.generatedAt === "number" ? snapshot.generatedAt : 0,
    items: snapshot.items,
    listState: parseListState(snapshot.listState),
  };
}

function isValidSnapshot(snapshot: RaycastProjectSnapshot | undefined, sourceFile: string) {
  if (!snapshot || snapshot.sourceFile !== sourceFile) return false;
  if (snapshot.sourceMtimeMs === undefined) return true;
  return sourceMtimeMs(sourceFile) === snapshot.sourceMtimeMs;
}

export function readRaycastProjectsSnapshot(sourceFile: string, options: RaggleProjectSnapshotOptions = {}) {
  const snapshotPath = raggleProjectSnapshotPath(options);
  const cachedSnapshot = projectSnapshotMemoryCache.get(snapshotPath);
  if (cachedSnapshot && isValidSnapshot(cachedSnapshot, sourceFile)) return cachedSnapshot;

  const snapshot = parseStoredSnapshot(snapshotPath);
  if (!snapshot || !isValidSnapshot(snapshot, sourceFile)) return undefined;
  projectSnapshotMemoryCache.set(snapshotPath, snapshot);
  return snapshot;
}

export function readLastRaycastProjectsSnapshot(sourceFile: string, options: RaggleProjectSnapshotOptions = {}) {
  const snapshotPath = raggleProjectSnapshotPath(options);
  const cachedSnapshot = projectSnapshotMemoryCache.get(snapshotPath);
  if (cachedSnapshot?.sourceFile === sourceFile) return cachedSnapshot;

  const snapshot = parseStoredSnapshot(snapshotPath);
  if (!snapshot || snapshot.sourceFile !== sourceFile) return undefined;
  projectSnapshotMemoryCache.set(snapshotPath, snapshot);
  return snapshot;
}

export function writeRaycastProjectsSnapshot(
  sourceFile: string,
  items: RaycastProject[],
  options: RaggleProjectSnapshotOptions = {},
) {
  const snapshotPath = raggleProjectSnapshotPath(options);
  const storedSnapshot = parseStoredSnapshot(snapshotPath);
  const snapshot: RaycastProjectSnapshot = {
    schemaVersion: 2,
    sourceFile,
    sourceMtimeMs: sourceMtimeMs(sourceFile),
    generatedAt: Date.now(),
    items,
    listState: storedSnapshot?.listState,
  };

  mkdirSync(path.dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify(snapshot), "utf8");
  projectSnapshotMemoryCache.set(snapshotPath, snapshot);
  return snapshot;
}

export function writeRaycastProjectListState(
  listState: Omit<RaggleProjectListState, "updatedAt">,
  options: RaggleProjectSnapshotOptions = {},
) {
  const snapshotPath = raggleProjectSnapshotPath(options);
  const snapshot = parseStoredSnapshot(snapshotPath);
  if (!snapshot) return undefined;

  const nextSnapshot: RaycastProjectSnapshot = {
    ...snapshot,
    schemaVersion: 2,
    listState: { ...listState, updatedAt: Date.now() },
  };
  mkdirSync(path.dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify(nextSnapshot), "utf8");
  projectSnapshotMemoryCache.set(snapshotPath, nextSnapshot);
  return nextSnapshot;
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
