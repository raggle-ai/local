import { existsSync } from "node:fs";
import path from "node:path";
import {
  githubAuthenticatedAccounts,
  githubCliPath,
  githubRepositoryPath,
  gitRemoteUrl,
  normalizeRepositoryUrl,
  repositoryLookupKey,
} from "@raggle-ai/local";
import { type OpenInTarget, runCommandInTerminal } from "./open-in";
import { shellQuote } from "./ai-chat-clients/app";
import { errorMessage } from "./utils/error";

type CloneRepositoryOptions = {
  gitCloneAccount?: string;
  terminalTarget?: OpenInTarget;
};

type CloneRepositoryResult = "already-cloned" | "started";

function isCloneableGitRemote(remoteUrl: string) {
  if (githubRepositoryPath(remoteUrl)) return true;
  if (/^(?:git@|ssh:\/\/)/i.test(remoteUrl)) return true;

  try {
    const parsedUrl = new URL(remoteUrl);
    return ["http:", "https:", "git:", "file:"].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

function isGithubHttpRepository(remoteUrl: string) {
  const normalized = normalizeRepositoryUrl(remoteUrl);

  try {
    const parsedUrl = new URL(normalized);
    return (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") && parsedUrl.hostname === "github.com";
  } catch {
    return false;
  }
}

async function githubRepositoryIsUnavailable(remoteUrl: string) {
  const repository = githubRepositoryPath(remoteUrl);
  if (!repository) return false;

  try {
    const response = await fetch(`https://api.github.com/repos/${repository.owner}/${repository.repo}`);
    return response.status === 404;
  } catch {
    return false;
  }
}

async function activeGithubAccount() {
  try {
    return (await githubAuthenticatedAccounts()).find((account) => account.active)?.username;
  } catch {
    return undefined;
  }
}

async function gitCloneAccountForRepository(owner: string, configuredAccount?: string) {
  if (configuredAccount) return configuredAccount;

  try {
    const accounts = await githubAuthenticatedAccounts();
    return accounts.some((account) => account.username.toLowerCase() === owner.toLowerCase()) ? owner : undefined;
  } catch {
    return undefined;
  }
}

async function cloneRepositoryCommand(remoteUrl: string, targetDirectory: string, options: CloneRepositoryOptions) {
  const repository = githubRepositoryPath(remoteUrl);
  const commands = [`mkdir -p ${shellQuote(path.dirname(targetDirectory))}`];

  if (repository) {
    const gitCloneAccount = await gitCloneAccountForRepository(repository.owner, options.gitCloneAccount);
    if (gitCloneAccount) {
      commands.push(
        `${shellQuote(githubCliPath())} auth switch --hostname github.com --user ${shellQuote(gitCloneAccount)}`,
      );
    }

    commands.push(
      `${shellQuote(githubCliPath())} repo clone ${shellQuote(`${repository.owner}/${repository.repo}`)} ${shellQuote(
        targetDirectory,
      )}`,
    );
  } else {
    commands.push(`git clone ${shellQuote(remoteUrl)} ${shellQuote(targetDirectory)}`);
  }

  return commands.join(" && ");
}

export async function cloneErrorMessage(remoteUrl: string, error: unknown) {
  const message = errorMessage(error);

  if (
    isGithubHttpRepository(remoteUrl) &&
    /could not read username|authentication failed|repository not found/i.test(message)
  ) {
    if (await githubRepositoryIsUnavailable(remoteUrl)) {
      const activeAccount = await activeGithubAccount();
      const accountSuffix = activeAccount ? ` Active GitHub account: @${activeAccount}.` : "";
      return `This GitHub repository does not exist or is not accessible with your current account.${accountSuffix} Check the owner/name, or switch to a repo URL you can access.`;
    }

    return "GitHub HTTPS authentication is not configured. Use an SSH remote like git@github.com:owner/repo.git or sign in with GitHub CLI and a Git credential helper.";
  }

  return message;
}

export async function cloneRepository(
  remoteUrl: string,
  targetDirectory: string,
  options: CloneRepositoryOptions = {},
): Promise<CloneRepositoryResult> {
  const normalizedRemoteUrl = normalizeRepositoryUrl(remoteUrl);

  if (!isCloneableGitRemote(normalizedRemoteUrl)) {
    throw new Error(
      `Cannot clone "${remoteUrl}" because it is not a Git remote URL. Use a GitHub URL, owner/repo, SSH URL, or HTTPS clone URL.`,
    );
  }

  if (existsSync(targetDirectory)) {
    if (existsSync(path.join(targetDirectory, ".git"))) {
      try {
        const actualRemote = await gitRemoteUrl(targetDirectory);
        if (repositoryLookupKey(actualRemote) === repositoryLookupKey(normalizedRemoteUrl)) {
          return "already-cloned";
        }
        throw new Error(
          `Directory exists with different remote URL. Expected: ${normalizedRemoteUrl}, Found: ${actualRemote}`,
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes("different remote URL")) {
          throw error;
        }
        throw new Error(`Directory exists but is not a valid git repository: ${targetDirectory}`);
      }
    }
    throw new Error(`Directory already exists and is not a git repository: ${targetDirectory}`);
  }

  await runCommandInTerminal(
    await cloneRepositoryCommand(normalizedRemoteUrl, targetDirectory, options),
    options.terminalTarget,
  );
  return "started";
}
