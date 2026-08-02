import { Toast, showToast } from "@raycast/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type GitCommandError = Error & {
  stderr?: string;
};

export type GitSyncResult = {
  branch: string;
  target: string;
};

async function runGit(repositoryRoot: string, args: string[]) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repositoryRoot, ...args]);
    return stdout.trim();
  } catch (error) {
    const gitError = error as GitCommandError;
    throw new Error(gitError.stderr?.trim() || gitError.message);
  }
}

export async function syncGitRemote(repositoryRoot: string): Promise<GitSyncResult> {
  const remotes = (await runGit(repositoryRoot, ["remote"]))
    .split("\n")
    .map((remote) => remote.trim())
    .filter(Boolean);

  if (!remotes.length) {
    throw new Error("This repository does not have a Git remote.");
  }

  let branch: string;
  try {
    branch = await runGit(repositoryRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    throw new Error("Cannot sync a repository with a detached HEAD. Check out a branch first.");
  }

  let upstream: string | undefined;
  try {
    upstream = await runGit(repositoryRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  } catch {
    upstream = undefined;
  }

  if (upstream) {
    await runGit(repositoryRoot, ["pull", "--ff-only"]);
    return { branch, target: upstream };
  }

  const remote = remotes.includes("origin") ? "origin" : remotes[0];
  await runGit(repositoryRoot, ["pull", "--ff-only", remote, branch]);
  return { branch, target: `${remote}/${branch}` };
}

export async function syncGitRemoteWithToast(repositoryRoot: string) {
  await showToast({ style: Toast.Style.Animated, title: "Syncing Remote" });

  try {
    const result = await syncGitRemote(repositoryRoot);
    await showToast({
      style: Toast.Style.Success,
      title: "Remote Synced",
      message: result.target,
    });
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could Not Sync Remote",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
