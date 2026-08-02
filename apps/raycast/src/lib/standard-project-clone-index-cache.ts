import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extensionPaths } from "./config";

const paths = extensionPaths();

export type StandardProjectsCloneIndexEntry = {
  worktree: string;
  remoteUrl: string;
  currentBranch?: string;
};

type StandardProjectsCloneIndexSnapshot = {
  cloneDirectory: string;
  cloneDirectoryMtimeMs?: number;
  generatedAt: number;
  entries: StandardProjectsCloneIndexEntry[];
};

let cloneIndexMemoryCache: StandardProjectsCloneIndexSnapshot | undefined;

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

function cloneDirectoryMtimeMs(cloneDirectory: string) {
  try {
    return statSync(cloneDirectory).mtimeMs;
  } catch {
    return undefined;
  }
}

function isValidSnapshot(snapshot: StandardProjectsCloneIndexSnapshot | undefined, cloneDirectory: string) {
  if (!snapshot || snapshot.cloneDirectory !== cloneDirectory || !Array.isArray(snapshot.entries)) return false;
  return snapshot.cloneDirectoryMtimeMs === cloneDirectoryMtimeMs(cloneDirectory);
}

function readStoredCloneIndexSnapshot() {
  return readJsonFile<StandardProjectsCloneIndexSnapshot | undefined>(paths.standardProjectsCloneIndexPath, undefined);
}

export function readStandardProjectsCloneIndexSnapshot(cloneDirectory: string) {
  if (isValidSnapshot(cloneIndexMemoryCache, cloneDirectory)) {
    return cloneIndexMemoryCache;
  }

  const snapshot = readStoredCloneIndexSnapshot();
  if (!isValidSnapshot(snapshot, cloneDirectory)) return undefined;

  cloneIndexMemoryCache = snapshot;
  return snapshot;
}

export function writeStandardProjectsCloneIndexSnapshot(
  cloneDirectory: string,
  entries: StandardProjectsCloneIndexEntry[],
) {
  const snapshot: StandardProjectsCloneIndexSnapshot = {
    cloneDirectory,
    cloneDirectoryMtimeMs: cloneDirectoryMtimeMs(cloneDirectory),
    generatedAt: Date.now(),
    entries,
  };

  writeJsonFile(paths.standardProjectsCloneIndexPath, snapshot);
  cloneIndexMemoryCache = snapshot;
  return snapshot;
}
