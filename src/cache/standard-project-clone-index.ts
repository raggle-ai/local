import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gitCurrentBranch, gitRemoteUrl, repositoryLookupKey } from "../adapters/git-repository";
import { sortLocalRepositoryCandidates, type LocalRepositoryCandidate } from "../core/local-repository-candidate";
import { scanCloneDirectoryRepositories } from "../discovery/scanner";

export type LocalRepositoryMatch =
  | {
      worktree: string;
      isMatch: true;
    }
  | {
      worktree: string;
      actualRemoteUrl: string;
      isMatch: false;
    };

export type CloneDirectoryRepositoryIndex = {
  worktreeByRepositoryKey: Map<string, string>;
  remoteUrlByWorktree: Map<string, string>;
};

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

function nowMs() {
  return Date.now();
}

function logProjectLoadTiming(label: string, startedAt: number, details?: Record<string, number | string>) {
  const durationMs = nowMs() - startedAt;
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.info(`[projects] ${label} ${durationMs}ms${suffix}`);
}

function readJsonFile<T>(filePath: string, fallback: T) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
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

function readStoredCloneIndexSnapshot(cachePath: string) {
  return readJsonFile<StandardProjectsCloneIndexSnapshot | undefined>(cachePath, undefined);
}

function readStandardProjectsCloneIndexSnapshot(cloneDirectory: string, cachePath: string) {
  if (isValidSnapshot(cloneIndexMemoryCache, cloneDirectory)) {
    return cloneIndexMemoryCache;
  }

  const snapshot = readStoredCloneIndexSnapshot(cachePath);
  if (!isValidSnapshot(snapshot, cloneDirectory)) return undefined;

  cloneIndexMemoryCache = snapshot;
  return snapshot;
}

function writeStandardProjectsCloneIndexSnapshot(
  cachePath: string,
  cloneDirectory: string,
  entries: StandardProjectsCloneIndexEntry[],
) {
  const snapshot: StandardProjectsCloneIndexSnapshot = {
    cloneDirectory,
    cloneDirectoryMtimeMs: cloneDirectoryMtimeMs(cloneDirectory),
    generatedAt: Date.now(),
    entries,
  };

  writeJsonFile(cachePath, snapshot);
  cloneIndexMemoryCache = snapshot;
  return snapshot;
}

export async function findLocalRepository(
  remoteUrl: string,
  preferredWorktree: string,
  repositoryIndex: CloneDirectoryRepositoryIndex,
): Promise<LocalRepositoryMatch | undefined> {
  const repositoryKey = repositoryLookupKey(remoteUrl);
  const preferredWorktreeRemoteUrl = repositoryIndex.remoteUrlByWorktree.get(preferredWorktree);
  const hasPreferredWorktreeRepository = existsSync(path.join(preferredWorktree, ".git"));

  if (preferredWorktreeRemoteUrl && repositoryLookupKey(preferredWorktreeRemoteUrl) === repositoryKey) {
    return { worktree: preferredWorktree, isMatch: true };
  }

  const matchedWorktree = repositoryIndex.worktreeByRepositoryKey.get(repositoryKey);
  if (matchedWorktree) return { worktree: matchedWorktree, isMatch: true };

  if (!preferredWorktreeRemoteUrl) {
    return hasPreferredWorktreeRepository ? { worktree: preferredWorktree, isMatch: true } : undefined;
  }

  return {
    worktree: preferredWorktree,
    actualRemoteUrl: preferredWorktreeRemoteUrl,
    isMatch: false,
  };
}

async function indexCloneDirectoryRepositories(
  cloneDirectory: string,
  cachePath?: string,
): Promise<CloneDirectoryRepositoryIndex> {
  const startedAt = nowMs();
  const worktreeByRepositoryKey = new Map<string, string>();
  const remoteUrlByWorktree = new Map<string, string>();
  const discoveredRepositories = scanCloneDirectoryRepositories(cloneDirectory);
  const candidates: string[] = [];

  if (discoveredRepositories.length) {
    const entries = sortLocalRepositoryCandidates(discoveredRepositories);
    for (const entry of entries) {
      remoteUrlByWorktree.set(entry.worktree, entry.remoteUrl);

      const repositoryKey = repositoryLookupKey(entry.remoteUrl);
      if (!worktreeByRepositoryKey.has(repositoryKey)) {
        worktreeByRepositoryKey.set(repositoryKey, entry.worktree);
      }
    }

    if (cachePath) {
      writeStandardProjectsCloneIndexSnapshot(cachePath, cloneDirectory, entries);
    }

    logProjectLoadTiming("indexCloneDirectoryRepositories", startedAt, {
      candidates: discoveredRepositories.length,
      indexed: remoteUrlByWorktree.size,
      scanner: "filesystem",
    });

    return { worktreeByRepositoryKey, remoteUrlByWorktree };
  }

  try {
    for (const entry of readdirSync(cloneDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const candidate = path.join(cloneDirectory, entry.name);
      if (!existsSync(path.join(candidate, ".git"))) continue;
      candidates.push(candidate);
    }
  } catch {
    return { worktreeByRepositoryKey, remoteUrlByWorktree };
  }

  const entries = sortLocalRepositoryCandidates(
    (
      await Promise.all(
        candidates.map(async (candidate) => {
          try {
            const actualRemoteUrl = await gitRemoteUrl(candidate);
            let currentBranch: string | undefined;

            try {
              currentBranch = await gitCurrentBranch(candidate);
            } catch {
              // Branch lookup is only used to rank duplicate local checkouts.
            }

            return {
              worktree: candidate,
              remoteUrl: actualRemoteUrl,
              ...(currentBranch ? { currentBranch } : {}),
            } satisfies LocalRepositoryCandidate;
          } catch {
            // Skip repositories whose remotes cannot be read.
            return undefined;
          }
        }),
      )
    ).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  );

  for (const entry of entries) {
    remoteUrlByWorktree.set(entry.worktree, entry.remoteUrl);

    const repositoryKey = repositoryLookupKey(entry.remoteUrl);
    if (!worktreeByRepositoryKey.has(repositoryKey)) {
      worktreeByRepositoryKey.set(repositoryKey, entry.worktree);
    }
  }

  if (cachePath) {
    writeStandardProjectsCloneIndexSnapshot(cachePath, cloneDirectory, entries);
  }

  logProjectLoadTiming("indexCloneDirectoryRepositories", startedAt, {
    candidates: candidates.length,
    indexed: remoteUrlByWorktree.size,
  });

  return { worktreeByRepositoryKey, remoteUrlByWorktree };
}

function cloneDirectoryRepositoryIndexFromEntries(
  entries: StandardProjectsCloneIndexEntry[],
): CloneDirectoryRepositoryIndex {
  const worktreeByRepositoryKey = new Map<string, string>();
  const remoteUrlByWorktree = new Map<string, string>();

  for (const entry of sortLocalRepositoryCandidates(entries)) {
    remoteUrlByWorktree.set(entry.worktree, entry.remoteUrl);
    const repositoryKey = repositoryLookupKey(entry.remoteUrl);
    if (!worktreeByRepositoryKey.has(repositoryKey)) {
      worktreeByRepositoryKey.set(repositoryKey, entry.worktree);
    }
  }

  return { worktreeByRepositoryKey, remoteUrlByWorktree };
}

export async function prepareCloneDirectoryIndex(
  cloneDirectory: string,
  options?: { force?: boolean; cachePath?: string },
): Promise<CloneDirectoryRepositoryIndex> {
  if (!options?.force && options?.cachePath) {
    const snapshot = readStandardProjectsCloneIndexSnapshot(cloneDirectory, options.cachePath);
    if (snapshot) {
      return cloneDirectoryRepositoryIndexFromEntries(snapshot.entries);
    }
  }

  return indexCloneDirectoryRepositories(cloneDirectory, options?.cachePath);
}
