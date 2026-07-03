import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { remoteToBrowserUrl } from "../core/project-remote";

const execFileAsync = promisify(execFile);

export function normalizeRepositoryUrl(remoteUrl: string) {
  const trimmed = remoteUrl.trim().replace(/^['"]|['"]$/g, "");

  const sshProtocolMatch = trimmed.match(/^ssh:\/\/(?:git@)?([^/:]+)(:\d+)?\/([^/\s]+)\/([^/\s?#"]+?)(?:\.git)?$/i);
  if (sshProtocolMatch) {
    return `ssh://git@${sshProtocolMatch[1]}${sshProtocolMatch[2] ?? ""}/${sshProtocolMatch[3]}/${sshProtocolMatch[4]}`;
  }

  // Accept GitHub page URLs and common malformed variants like
  // "github.com/owner/repo", "ps://github.com/owner/repo", or URLs with extra path segments.
  if (!trimmed.startsWith("git@")) {
    const githubMatch = trimmed.match(/(?:[a-z]*:\/\/)?(?:www\.)?github\.com[/:]([^/\s]+)\/([^/\s?#"]+)/i);
    if (githubMatch) {
      return `https://github.com/${githubMatch[1]}/${githubMatch[2].replace(/\.git$/, "")}`;
    }
  }

  try {
    const parsedUrl = new URL(trimmed);

    if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
      const segments = parsedUrl.pathname.split("/").filter(Boolean);

      if (segments.length >= 2) {
        parsedUrl.pathname = `/${segments[0]}/${segments[1].replace(/\.git$/, "")}`;
        parsedUrl.search = "";
        parsedUrl.hash = "";

        return parsedUrl.toString().replace(/\/$/, "");
      }
    }
  } catch {
    // Keep non-URL Git remotes like git@github.com:user/repo.git unchanged.
  }

  return trimmed.replace(/\/$/, "");
}

export function repositoryName(remoteUrl: string) {
  const normalized = normalizeRepositoryUrl(remoteUrl);
  const match = normalized.match(/([^/:]+?)(?:\.git)?$/);
  const name = match?.[1];

  if (!name) {
    throw new Error(`Could not determine a project name from ${remoteUrl}`);
  }

  return name;
}

export function githubRepositoryPath(remoteUrl: string) {
  const normalized = normalizeRepositoryUrl(remoteUrl);
  const sshMatch = normalized.match(/^git@github\.com:([^/\s]+)\/([^/\s?#]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2],
    };
  }

  try {
    const parsedUrl = new URL(normalized);
    if (parsedUrl.hostname !== "github.com") return undefined;

    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return undefined;

    return {
      owner: segments[0],
      repo: segments[1].replace(/\.git$/, ""),
    };
  } catch {
    return undefined;
  }
}

export function repositoryDirectoryName(remoteUrl: string) {
  const repository = githubRepositoryPath(remoteUrl);
  if (repository) return `${repository.owner}-${repository.repo}`;

  return repositoryName(remoteUrl);
}

export function repositoryLookupKey(remoteUrl: string) {
  const normalized = normalizeRepositoryUrl(remoteUrl);
  return remoteToBrowserUrl(normalized) ?? normalized;
}

export async function gitRemoteUrl(worktree: string) {
  const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], {
    cwd: worktree,
    maxBuffer: 1024 * 1024 * 4,
  });
  return normalizeRepositoryUrl(stdout.trim());
}

export async function gitCurrentBranch(worktree: string) {
  const { stdout } = await execFileAsync("git", ["branch", "--show-current"], {
    cwd: worktree,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim() || undefined;
}
