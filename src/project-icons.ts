import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { remoteToBrowserUrl } from "./project-remote";

export const projectIconExtensions = ["png", "jpg", "jpeg", "svg", "gif", "webp", "ico"];

export function discoverProjectIcon(worktree: string) {
  const repoCandidates = ["icon", ".icon", "favicon"];
  const settingsDir = path.join(worktree, ".opencode");

  for (const name of repoCandidates) {
    const candidate = path.join(worktree, name);
    if (existsSync(candidate)) return candidate;
  }

  for (const ext of projectIconExtensions) {
    for (const name of repoCandidates) {
      const candidate = path.join(worktree, `${name}.${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }

  try {
    const pattern = new RegExp(`^(?:icon|\\.icon|favicon)(?:\\.(${projectIconExtensions.join("|")}))?$`, "i");
    const file = readdirSync(worktree).find((name) => pattern.test(name));
    if (file) return path.join(worktree, file);
  } catch {
    // Ignore unreadable or missing worktree directory.
  }

  for (const ext of projectIconExtensions) {
    const candidate = path.join(settingsDir, `icon.${ext}`);
    if (existsSync(candidate)) return candidate;
  }

  try {
    const pattern = new RegExp(`^icon\\.(${projectIconExtensions.join("|")})$`, "i");
    const file = readdirSync(settingsDir).find((name) => pattern.test(name));
    if (file) return path.join(settingsDir, file);
  } catch {
    // Ignore unreadable or missing .opencode directory.
  }

  return undefined;
}

export function githubOwnerFromRemoteUrl(remoteUrl: string | undefined) {
  if (!remoteUrl) return undefined;

  const browserUrl = remoteToBrowserUrl(remoteUrl) ?? remoteUrl;

  try {
    const parsedUrl = new URL(browserUrl);
    if (parsedUrl.hostname !== "github.com") return undefined;

    return parsedUrl.pathname.split("/").filter(Boolean)[0];
  } catch {
    const match = remoteUrl.match(/github\.com[:/]([^/\s]+)\/[^/\s]+/i);
    return match?.[1];
  }
}

function iconExtensionFromContentType(contentType: string | null) {
  if (!contentType) return "png";
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("x-icon") || contentType.includes("vnd.microsoft.icon")) return "ico";
  return "png";
}

export async function fetchGithubOwnerIcon(remoteUrl: string | undefined) {
  const owner = githubOwnerFromRemoteUrl(remoteUrl);
  if (!owner) return undefined;

  const avatarUrl = `https://github.com/${encodeURIComponent(owner)}.png`;
  const avatarResponse = await fetch(avatarUrl);
  if (!avatarResponse.ok) return undefined;

  const data = Buffer.from(await avatarResponse.arrayBuffer());
  if (!data.length) return undefined;

  return {
    owner,
    data,
    ext: iconExtensionFromContentType(avatarResponse.headers.get("content-type")),
    sourceUrl: avatarUrl,
  };
}
