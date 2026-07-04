import os from "node:os";
import path from "node:path";

export type ProjectKeywordInput = {
  worktree: string;
  remoteUrl?: string;
  name?: string;
  description?: string;
  parentProjectName?: string;
  relativePath?: string;
  tags?: string[];
  latestSessionTitle?: string;
};

// Remote URLs repeat across every subpath item of a repository, so keyword
// extraction (URL parsing included) is memoized per URL.
const repositoryKeywordsCache = new Map<string, string[]>();

function extractRepositoryKeywords(remoteUrl?: string): string[] {
  if (!remoteUrl) return [];

  const cached = repositoryKeywordsCache.get(remoteUrl);
  if (cached) return cached;

  const keywords = computeRepositoryKeywords(remoteUrl);
  repositoryKeywordsCache.set(remoteUrl, keywords);
  return keywords;
}

function computeRepositoryKeywords(remoteUrl: string): string[] {
  const keywords: string[] = [];
  const normalized = remoteUrl.replace(/\.git$/, "");

  try {
    const parsedUrl = new URL(normalized);
    const pathname = parsedUrl.pathname;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length >= 2) {
      const owner = segments[segments.length - 2];
      const repo = segments[segments.length - 1];

      keywords.push(owner);
      keywords.push(repo);

      const ownerParts = owner.split(/[-_.]+/);
      for (const part of ownerParts) {
        if (part && part !== owner) keywords.push(part);
      }

      const repoParts = repo.split(/[-_.]+/);
      for (const part of repoParts) {
        if (part && part !== repo) keywords.push(part);
      }
    }
  } catch {
    const sshMatch = normalized.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
    if (sshMatch) {
      const owner = sshMatch[1];
      const repo = sshMatch[2];

      keywords.push(owner);
      keywords.push(repo);

      const ownerParts = owner.split(/[-_.]+/);
      for (const part of ownerParts) {
        if (part && part !== owner) keywords.push(part);
      }

      const repoParts = repo.split(/[-_.]+/);
      for (const part of repoParts) {
        if (part && part !== repo) keywords.push(part);
      }
    }
  }

  return keywords;
}

function addPathKeywords(values: Set<string>, input?: string) {
  if (!input) return;

  values.add(input);
  for (const segment of input.split(/[\\/]/)) {
    if (segment) values.add(segment);
  }
}

export function projectKeywords(item: ProjectKeywordInput) {
  const values = new Set<string>();
  if (!item.remoteUrl) addPathKeywords(values, item.worktree);
  if (item.name) values.add(item.name);
  if (item.description) values.add(item.description);
  if (item.parentProjectName) values.add(item.parentProjectName);
  addPathKeywords(values, item.relativePath);
  for (const tag of item.tags ?? []) values.add(tag);
  if (item.latestSessionTitle) values.add(item.latestSessionTitle);

  for (const keyword of extractRepositoryKeywords(item.remoteUrl)) {
    values.add(keyword);
  }

  return [...values].filter(Boolean);
}

export function standardProjectWithKeywords<T extends ProjectKeywordInput>(item: T): T & { keywords: string[] } {
  return { ...item, keywords: projectKeywords(item) };
}

export function projectTitle(item: { name?: string; worktree: string }) {
  return (item.name ?? path.basename(item.worktree)) || item.worktree;
}

export function projectSubtitle(item: { latestSessionTitle?: string; tags?: string[]; worktree: string }) {
  if (item.latestSessionTitle) return item.latestSessionTitle;
  if (item.tags?.length) return item.tags.join(" ");
  return item.worktree;
}

export function projectAccessoryPath(item: { worktree: string }) {
  const home = os.homedir();
  if (item.worktree === home) return "~";
  if (item.worktree.startsWith(`${home}${path.sep}`)) return `~/${item.worktree.slice(home.length + 1)}`;
  return item.worktree;
}
