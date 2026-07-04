import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { normalizeRepositoryUrl } from "../adapters/git-repository";

export type DiscoveredRepository = {
  worktree: string;
  remoteUrl: string;
  currentBranch?: string;
};

export type ScanCloneDirectoryOptions = {
  maxRepos?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (result: ScanCloneDirectoryResult) => void;
};

export type ScanCloneDirectoryResult = {
  repositories: DiscoveredRepository[];
  truncated: boolean;
  timedOut: boolean;
  stopped: boolean;
  durationMs: number;
  maxRepos: number | undefined;
  timeoutMs: number | undefined;
};

function readTextFile(filePath: string) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function gitDirectory(worktree: string) {
  const dotGitPath = path.join(worktree, ".git");
  const stats = statSync(dotGitPath, { throwIfNoEntry: false });
  if (!stats) return undefined;
  // Regular clones have a .git directory; reading it would throw EISDIR.
  if (stats.isDirectory()) return dotGitPath;

  const dotGitContent = readTextFile(dotGitPath);
  if (!dotGitContent) return dotGitPath;

  const match = dotGitContent.match(/^gitdir:\s*(.+)$/im);
  const gitdir = match?.[1]?.trim();
  if (!gitdir) return undefined;

  return path.isAbsolute(gitdir) ? gitdir : path.resolve(worktree, gitdir);
}

function readOriginRemoteUrl(gitConfig: string) {
  const originSectionMatch = gitConfig.match(/\[remote\s+"origin"\]([\s\S]*?)(?=\n\[|$)/);
  if (!originSectionMatch) return undefined;

  const urlMatch = originSectionMatch[1].match(/^\s*url\s*=\s*(.+)$/m);
  return urlMatch?.[1]?.trim();
}

function readCurrentBranch(gitDirectoryPath: string) {
  const head = readTextFile(path.join(gitDirectoryPath, "HEAD"))?.trim();
  const match = head?.match(/^ref:\s+refs\/heads\/(.+)$/);
  return match?.[1];
}

function hasBareRepoMarkers(worktree: string) {
  return (
    (statSync(path.join(worktree, "HEAD"), { throwIfNoEntry: false })?.isFile() ?? false) &&
    (statSync(path.join(worktree, "objects"), { throwIfNoEntry: false })?.isDirectory() ?? false) &&
    (statSync(path.join(worktree, "refs"), { throwIfNoEntry: false })?.isDirectory() ?? false)
  );
}

function discoverRepositoryFromDirectory(worktree: string, configDirectory: string): DiscoveredRepository | undefined {
  const gitConfig = readTextFile(path.join(configDirectory, "config"));
  if (!gitConfig) return undefined;

  const remoteUrl = readOriginRemoteUrl(gitConfig);
  if (!remoteUrl) return undefined;

  const currentBranch = readCurrentBranch(configDirectory);
  return {
    worktree,
    remoteUrl: normalizeRepositoryUrl(remoteUrl),
    ...(currentBranch ? { currentBranch } : {}),
  };
}

export function scanCloneDirectoryRepositories(
  cloneDirectory: string,
  options?: ScanCloneDirectoryOptions,
): ScanCloneDirectoryResult {
  const startedAt = Date.now();
  const maxRepos = options?.maxRepos;
  const timeoutMs = options?.timeoutMs;
  const signal = options?.signal;
  const repositories: DiscoveredRepository[] = [];
  let truncated = false;
  let timedOut = false;
  let stopped = false;

  const buildResult = (): ScanCloneDirectoryResult => ({
    repositories: [...repositories],
    truncated,
    timedOut,
    stopped,
    durationMs: Date.now() - startedAt,
    maxRepos,
    timeoutMs,
  });

  const isAborted = () => {
    if (signal?.aborted) {
      stopped = true;
      return true;
    }
    return false;
  };

  const isTimedOut = () => {
    if (timeoutMs !== undefined && Date.now() - startedAt > timeoutMs) {
      timedOut = true;
      return true;
    }
    return false;
  };

  try {
    for (const entry of readdirSync(cloneDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;

      if (isAborted() || isTimedOut()) break;

      if (maxRepos !== undefined && repositories.length >= maxRepos) {
        truncated = true;
        break;
      }

      const worktree = path.join(cloneDirectory, entry.name);
      const gitDirectoryPath = gitDirectory(worktree);

      let repository: DiscoveredRepository | undefined;

      if (gitDirectoryPath) {
        repository = discoverRepositoryFromDirectory(worktree, gitDirectoryPath);
      } else if (hasBareRepoMarkers(worktree)) {
        repository = discoverRepositoryFromDirectory(worktree, worktree);
      }

      if (!repository) continue;

      repositories.push(repository);
      options?.onProgress?.(buildResult());
    }
  } catch {
    return buildResult();
  }

  return buildResult();
}
