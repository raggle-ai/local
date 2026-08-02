import { type Color } from "@raycast/api";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extensionPaths } from "./config";

const paths = extensionPaths();

export type StandardProjectSnapshotItem = {
  id: string;
  worktree: string;
  name?: string;
  description?: string;
  worktreeName?: string;
  keywords?: string[];
  tags?: string[];
  plugins?: string[];
  latestSessionTitle?: string;
  icon?: string;
  iconColor?: string;
  tint?: Color;
  startupCommand?: string;
  sandboxCount: number;
  updatedAt?: number;
  hasIcon: boolean;
  isSessionOnly: boolean;
  isFavorite: boolean;
  relatedIds: string[];
  remoteUrl: string;
  browserUrl?: string;
  isCloned: boolean;
  repositoryRoot: string;
  parentProjectName?: string;
  relativePath?: string;
  isSubpathRoot?: boolean;
  allSubpath?: boolean;
  subpathAllSubpath?: boolean;
  removePathFromName?: boolean;
  hasCustomName?: boolean;
  remoteMismatch?: {
    worktree: string;
    actualRemoteUrl: string;
  };
};

type StandardProjectsSnapshot = {
  sourceFile: string;
  sourceMtimeMs?: number;
  generatedAt: number;
  items: StandardProjectSnapshotItem[];
};

let standardProjectsMemoryCache: StandardProjectsSnapshot | undefined;

function supportDir() {
  mkdirSync(paths.supportPath, { recursive: true });
  return paths.supportPath;
}

function readJsonFile<T>(filePath: string, fallback: T) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown) {
  supportDir();
  writeFileSync(filePath, JSON.stringify(value), "utf8");
}

function sourceMtimeMs(filePath: string) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return undefined;
  }
}

function isValidSnapshot(snapshot: StandardProjectsSnapshot | undefined, filePath: string) {
  if (!snapshot || snapshot.sourceFile !== filePath || !Array.isArray(snapshot.items)) return false;
  if (snapshot.sourceMtimeMs === undefined) return true;

  const currentMtimeMs = sourceMtimeMs(filePath);
  return currentMtimeMs !== undefined && snapshot.sourceMtimeMs === currentMtimeMs;
}

function readStoredStandardProjectsSnapshot() {
  return readJsonFile<StandardProjectsSnapshot | undefined>(paths.standardProjectsSnapshotPath, undefined);
}

export function readStandardProjectsSnapshot(filePath: string) {
  if (isValidSnapshot(standardProjectsMemoryCache, filePath)) {
    return standardProjectsMemoryCache;
  }

  const snapshot = readStoredStandardProjectsSnapshot();
  if (!isValidSnapshot(snapshot, filePath)) return undefined;

  standardProjectsMemoryCache = snapshot;
  return snapshot;
}

export function readLastStandardProjectsSnapshot(filePath: string) {
  if (standardProjectsMemoryCache?.sourceFile === filePath && Array.isArray(standardProjectsMemoryCache.items)) {
    return standardProjectsMemoryCache;
  }

  const snapshot = readStoredStandardProjectsSnapshot();
  if (!snapshot || snapshot.sourceFile !== filePath || !Array.isArray(snapshot.items)) return undefined;

  standardProjectsMemoryCache = snapshot;
  return snapshot;
}

export function writeStandardProjectsSnapshot(filePath: string, items: StandardProjectSnapshotItem[]) {
  const mtimeMs = sourceMtimeMs(filePath);

  const snapshot: StandardProjectsSnapshot = {
    sourceFile: filePath,
    sourceMtimeMs: mtimeMs,
    generatedAt: Date.now(),
    items,
  };

  writeJsonFile(paths.standardProjectsSnapshotPath, snapshot);
  standardProjectsMemoryCache = snapshot;
  return snapshot;
}
