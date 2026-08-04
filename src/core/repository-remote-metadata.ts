import { normalizeRepositoryUrl } from "../adapters/git-repository";
import { remoteToBrowserUrl } from "./project-remote";

export type RepositoryRemoteMetadata = {
  provider: string;
  host: string;
  owner?: string;
  repository?: string;
};

export function repositoryRemoteMetadata(remoteUrl: string | undefined): RepositoryRemoteMetadata | undefined {
  if (!remoteUrl) return undefined;

  const normalized = normalizeRepositoryUrl(remoteUrl);
  const browserUrl = remoteToBrowserUrl(normalized) ?? normalized;

  try {
    const parsedUrl = new URL(browserUrl);
    const host = parsedUrl.hostname.replace(/^www\./, "");
    const [owner, repository] = parsedUrl.pathname.split("/").filter(Boolean);

    return {
      provider: host === "github.com" ? "github" : host.includes("gitlab") ? "gitlab" : "git",
      host,
      ...(owner ? { owner } : {}),
      ...(repository ? { repository: repository.replace(/\.git$/, "") } : {}),
    };
  } catch {
    const match = normalized.match(/(?:ssh:\/\/)?git@([^:/]+)(?::\d+)?[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
    if (!match) return undefined;

    const host = match[1].replace(/^www\./, "");
    return {
      provider: host === "github.com" ? "github" : host.includes("gitlab") ? "gitlab" : "git",
      host,
      owner: match[2],
      repository: match[3],
    };
  }
}

export function repositoryRemoteProvider(remoteUrl: string | undefined) {
  return repositoryRemoteMetadata(remoteUrl)?.provider;
}
