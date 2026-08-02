import { normalizeRepositoryUrl, remoteToBrowserUrl } from "@raggle-ai/local";

export type ProjectRemoteMetadata = {
  provider: string;
  host: string;
  owner?: string;
  repo?: string;
};

export function projectRemoteMetadata(remoteUrl: string | undefined): ProjectRemoteMetadata | undefined {
  if (!remoteUrl) return undefined;

  const normalized = normalizeRepositoryUrl(remoteUrl);
  const browserUrl = remoteToBrowserUrl(normalized) ?? normalized;

  try {
    const parsedUrl = new URL(browserUrl);
    const host = parsedUrl.hostname.replace(/^www\./, "");
    const [owner, repo] = parsedUrl.pathname.split("/").filter(Boolean);

    return {
      provider: host === "github.com" ? "github" : host.includes("gitlab") ? "gitlab" : "git",
      host,
      ...(owner ? { owner } : {}),
      ...(repo ? { repo: repo.replace(/\.git$/, "") } : {}),
    };
  } catch {
    const match = normalized.match(/(?:ssh:\/\/)?git@([^:/]+)(?::\d+)?[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
    if (!match) return undefined;

    const host = match[1].replace(/^www\./, "");
    return {
      provider: host === "github.com" ? "github" : host.includes("gitlab") ? "gitlab" : "git",
      host,
      owner: match[2],
      repo: match[3],
    };
  }
}

export function projectRemoteProvider(remoteUrl: string | undefined) {
  return projectRemoteMetadata(remoteUrl)?.provider;
}
