import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { normalizeRepositoryUrl } from "../adapters/git-repository";

export type DiscoveredRepository = {
  worktree: string;
  remoteUrl: string;
  currentBranch?: string;
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
  if (!existsSync(dotGitPath)) return undefined;

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

export function scanCloneDirectoryRepositories(cloneDirectory: string): DiscoveredRepository[] {
  const repositories: DiscoveredRepository[] = [];

  try {
    for (const entry of readdirSync(cloneDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const worktree = path.join(cloneDirectory, entry.name);
      const gitDirectoryPath = gitDirectory(worktree);
      if (!gitDirectoryPath) continue;

      const gitConfig = readTextFile(path.join(gitDirectoryPath, "config"));
      if (!gitConfig) continue;

      const remoteUrl = readOriginRemoteUrl(gitConfig);
      if (!remoteUrl) continue;

      const currentBranch = readCurrentBranch(gitDirectoryPath);
      repositories.push({
        worktree,
        remoteUrl: normalizeRepositoryUrl(remoteUrl),
        ...(currentBranch ? { currentBranch } : {}),
      });
    }
  } catch {
    return [];
  }

  return repositories;
}
