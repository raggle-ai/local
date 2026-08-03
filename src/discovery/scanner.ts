import { createRequire } from "node:module";
import path from "node:path";
import { normalizeRepositoryUrl } from "../adapters/git-repository";

export type DiscoveredRepository = {
  worktree: string;
  remoteUrl: string;
  currentBranch?: string;
};

export type ScanCloneDirectoryOptions = {
  maxDepth?: number;
  maxRepos?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (repository: DiscoveredRepository, count: number) => void;
};

export type ScanCloneDirectoryResult = {
  repositories: DiscoveredRepository[];
  warnings: string[];
  truncated: boolean;
  timedOut: boolean;
  stopped: boolean;
  durationMs: number;
  maxDepth: number;
  maxRepos: number;
  timeoutMs: number;
};

type NativeRepository = {
  worktree: string;
  remoteUrl: string;
  currentBranch?: string;
};

type NativeScanResult = Omit<ScanCloneDirectoryResult, "repositories"> & {
  repositories: NativeRepository[];
};

type NativeScanner = {
  discoverRepository(directory: string): NativeRepository | null;
  scanCloneDirectoryRepositories(
    directory: string,
    options?: Pick<ScanCloneDirectoryOptions, "maxDepth" | "maxRepos" | "timeoutMs">,
    signal?: AbortSignal,
    progress?: (repositories: [NativeRepository]) => boolean,
  ): Promise<NativeScanResult>;
};

const nativeRequire = createRequire(__filename);
const nativeScanner = nativeRequire("../native") as NativeScanner;

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function normalizedLimits(options?: ScanCloneDirectoryOptions) {
  return {
    maxDepth: boundedInteger(options?.maxDepth, 3, 1, 8),
    maxRepos: boundedInteger(options?.maxRepos, 100, 1, 100_000),
    timeoutMs: boundedInteger(options?.timeoutMs, 10_000, 1, 30_000),
  };
}

function normalizeRepository(repository: NativeRepository): DiscoveredRepository {
  return {
    ...repository,
    worktree: path.resolve(repository.worktree),
    remoteUrl: normalizeRepositoryUrl(repository.remoteUrl),
  };
}

/** Identifies a Git repository rooted at exactly the supplied directory. */
export function discoverRepository(directory: string): DiscoveredRepository | undefined {
  const repository = nativeScanner.discoverRepository(path.resolve(directory));
  return repository ? normalizeRepository(repository) : undefined;
}

/**
 * Discovers repositories without blocking the JavaScript event loop. Traversal
 * runs in napi-rs' async worker pool and is bounded by depth, count, and time.
 */
export async function scanCloneDirectoryRepositories(
  cloneDirectory: string,
  options?: ScanCloneDirectoryOptions,
): Promise<ScanCloneDirectoryResult> {
  const limits = normalizedLimits(options);
  if (options?.signal?.aborted) {
    return {
      repositories: [],
      warnings: [],
      truncated: false,
      timedOut: false,
      stopped: true,
      durationMs: 0,
      ...limits,
    };
  }

  let progressCount = 0;
  const result = await nativeScanner.scanCloneDirectoryRepositories(
    path.resolve(cloneDirectory),
    limits,
    options?.signal,
    options?.onProgress
      ? ([repository]) => {
          progressCount += 1;
          options.onProgress?.(normalizeRepository(repository), progressCount);
          return options.signal?.aborted ?? false;
        }
      : undefined,
  );
  const normalized = {
    ...result,
    repositories: result.repositories.map(normalizeRepository),
  };
  return normalized;
}
