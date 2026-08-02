import os from "node:os";
import path from "node:path";
import { projectKeywords as packageProjectKeywords } from "@raggle-ai/local";
import { type Project } from "./project-store";

export function projectTitle(item: Project) {
  return (item.name ?? path.basename(item.worktree)) || item.worktree;
}

export function projectKeywords(
  item: Project & { remoteUrl?: string; parentProjectName?: string; relativePath?: string },
) {
  return packageProjectKeywords(item);
}

export function projectSubtitle(item: Project) {
  if (item.latestSessionTitle) return item.latestSessionTitle;
  if (item.tags?.length) return item.tags.join(" ");
  return item.worktree;
}

export function projectAccessoryPath(item: Project) {
  const home = os.homedir();
  if (item.worktree === home) return "~";
  if (item.worktree.startsWith(`${home}${path.sep}`)) return `~/${item.worktree.slice(home.length + 1)}`;
  return item.worktree;
}
