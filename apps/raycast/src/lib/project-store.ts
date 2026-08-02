import { Color } from "@raycast/api";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  discoverProjectIcon,
  fetchGithubOwnerIcon,
  githubOwnerFromRemoteUrl,
  projectIconExtensions,
} from "@raggle-ai/local";
import { extensionPaths } from "./config";
import { listVisibleProjects, saveProjectIcon as saveProjectIconToDb, type VisibleProjectRow } from "@raggle-ai/local";

export { discoverProjectIcon } from "@raggle-ai/local";

const paths = extensionPaths();
const iconHydrationBatchSize = 24;
const iconHydrationPriorityCount = 40;
type CachedProject = {
  id: string;
  worktree: string;
  name?: string;
  description?: string;
  worktreeName?: string;
  latestSessionTitle?: string;
  iconColor?: string;
  startupCommand?: string;
  sandboxCount: number;
  updatedAt?: number;
  hasIcon: boolean;
  isSessionOnly?: boolean;
  relatedIds?: string[];
};

export type Project = {
  id: string;
  worktree: string;
  name?: string;
  description?: string;
  worktreeName?: string;
  keywords?: string[];
  tags?: string[];
  latestSessionTitle?: string;
  icon?: string;
  iconColor?: string;
  tint?: Color;
  startupCommand?: string;
  sandboxCount: number;
  updatedAt?: number;
  hasIcon: boolean;
  isSessionOnly: boolean;
  isFavorite: boolean;
  relatedIds: string[];
};

export type ProjectLists = {
  items: Project[];
  excludedItems: Project[];
};

type HydrationUpdate = (_items: Project[]) => void;

let iconManifestCache: Record<string, string> | undefined;
let favoritesCache: Set<string> | undefined;
let excludedProjectsCache: Set<string> | undefined;

function supportDir() {
  mkdirSync(paths.supportPath, { recursive: true });
  return paths.supportPath;
}

function iconCacheDir() {
  mkdirSync(paths.projectIconsPath, { recursive: true });
  return paths.projectIconsPath;
}

function readJsonFile<T>(filePath: string, fallback: T) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown) {
  supportDir();
  writeFileSync(filePath, JSON.stringify(value), "utf8");
}

function getIconManifest() {
  iconManifestCache ??= readJsonFile<Record<string, string>>(paths.iconManifestPath, {});
  return iconManifestCache;
}

function writeIconManifest(manifest: Record<string, string>) {
  iconManifestCache = manifest;
  iconCacheDir();
  writeFileSync(paths.iconManifestPath, JSON.stringify(manifest), "utf8");
}

function getFavorites() {
  favoritesCache ??= new Set(readJsonFile<string[]>(paths.favoritesPath, []));
  return favoritesCache;
}

function writeFavorites(favorites: Set<string>) {
  favoritesCache = favorites;
  writeJsonFile(paths.favoritesPath, [...favorites]);
}

function getExcludedProjects() {
  excludedProjectsCache ??= new Set(readJsonFile<string[]>(paths.excludedProjectsPath, []));
  return excludedProjectsCache;
}

function writeExcludedProjects(excludedProjects: Set<string>) {
  excludedProjectsCache = excludedProjects;
  writeJsonFile(paths.excludedProjectsPath, [...excludedProjects]);
}

function readProjectIndex() {
  return readJsonFile<CachedProject[]>(paths.projectIndexPath, []);
}

function colorKey(input?: Color) {
  switch (input) {
    case Color.Red:
      return "red";
    case Color.Orange:
      return "orange";
    case Color.Yellow:
      return "yellow";
    case Color.Green:
      return "green";
    case Color.Blue:
      return "blue";
    case Color.Magenta:
      return "magenta";
    case Color.SecondaryText:
      return "secondary";
    default:
      return undefined;
  }
}

function writeProjectIndex(items: Project[]) {
  writeJsonFile(
    paths.projectIndexPath,
    items.map((item) => ({
      id: item.id,
      worktree: item.worktree,
      name: item.name,
      worktreeName: item.worktreeName,
      latestSessionTitle: item.latestSessionTitle,
      iconColor: item.iconColor ?? colorKey(item.tint),
      startupCommand: item.startupCommand,
      sandboxCount: item.sandboxCount,
      updatedAt: item.updatedAt,
      hasIcon: item.hasIcon,
      isSessionOnly: item.isSessionOnly,
      relatedIds: item.relatedIds,
    })),
  );
}

function favoriteKeys(project: Pick<Project, "id" | "worktree" | "relatedIds">) {
  return [project.worktree, project.id, ...project.relatedIds];
}

function isProjectFavorite(favorites: Set<string>, project: Pick<Project, "id" | "worktree" | "relatedIds">) {
  return favoriteKeys(project).some((key) => favorites.has(key));
}

function tint(input: string | null | undefined) {
  if (!input) return undefined;
  const key = input.toLowerCase();
  if (key.includes("red")) return Color.Red;
  if (key.includes("orange")) return Color.Orange;
  if (key.includes("yellow")) return Color.Yellow;
  if (key.includes("green")) return Color.Green;
  if (key.includes("blue")) return Color.Blue;
  if (key.includes("magenta") || key.includes("pink") || key.includes("purple")) return Color.Magenta;
  if (key.includes("secondary") || key.includes("gray") || key.includes("grey")) return Color.SecondaryText;
  return undefined;
}

function sortProjects(items: Project[]) {
  return items.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;

    const timeA = a.updatedAt ?? 0;
    const timeB = b.updatedAt ?? 0;
    if (timeA !== timeB) return timeB - timeA;

    const labelA = a.name ?? a.worktree;
    const labelB = b.name ?? b.worktree;
    return labelA.localeCompare(labelB);
  });
}

function dedupeProjects(items: Project[]) {
  const projects = new Map<string, Project>();

  for (const item of items) {
    const existing = projects.get(item.worktree);
    if (!existing) {
      projects.set(item.worktree, item);
      continue;
    }

    const mergedRelatedIds = [...new Set([...existing.relatedIds, ...item.relatedIds])];
    const keepCurrent =
      item.isFavorite !== existing.isFavorite
        ? item.isFavorite
        : (item.updatedAt ?? 0) !== (existing.updatedAt ?? 0)
          ? (item.updatedAt ?? 0) > (existing.updatedAt ?? 0)
          : item.hasIcon !== existing.hasIcon
            ? item.hasIcon
            : item.sandboxCount > existing.sandboxCount;

    projects.set(
      item.worktree,
      keepCurrent
        ? {
            ...item,
            relatedIds: mergedRelatedIds,
            isFavorite: item.isFavorite || existing.isFavorite,
          }
        : {
            ...existing,
            relatedIds: mergedRelatedIds,
            isFavorite: existing.isFavorite || item.isFavorite,
          },
    );
  }

  return [...projects.values()];
}

function isProjectExcluded(project: Pick<Project, "worktree">) {
  const excludedProjects = getExcludedProjects();
  return excludedProjects.has(project.worktree);
}

function splitExcludedProjects(items: Project[]): ProjectLists {
  const visibleItems: Project[] = [];
  const excludedItems: Project[] = [];

  for (const item of items) {
    if (isProjectExcluded(item)) excludedItems.push(item);
    else visibleItems.push(item);
  }

  return {
    items: sortProjects(visibleItems),
    excludedItems: sortProjects(excludedItems),
  };
}

function cachedIconPath(id: string) {
  const file = getIconManifest()[id];
  if (!file) return undefined;

  const fullPath = path.join(iconCacheDir(), file);
  if (existsSync(fullPath)) return fullPath;

  const manifest = { ...getIconManifest() };
  delete manifest[id];
  writeIconManifest(manifest);
  return undefined;
}

function clearCachedIcon(id: string) {
  const manifest = { ...getIconManifest() };
  if (!(id in manifest)) return;
  delete manifest[id];
  writeIconManifest(manifest);
}

function iconMimeType(ext: string) {
  if (ext === "svg") return "image/svg+xml";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "ico") return "image/x-icon";
  return undefined;
}

function cacheIconFile(id: string, ext: string, data: Buffer) {
  const file = `${createHash("sha1").update(id).digest("hex")}.${ext}`;
  const fullPath = path.join(iconCacheDir(), file);
  writeFileSync(fullPath, data);
  writeIconManifest({ ...getIconManifest(), [id]: file });
  return fullPath;
}

function cacheProjectIcon(id: string, iconPath: string) {
  const ext = path.extname(iconPath).slice(1).toLowerCase() || "img";
  if (ext === "img") return iconPath;
  return cacheIconFile(id, ext, readFileSync(iconPath));
}

function projectIconDataUrl(iconPath: string) {
  const ext = path.extname(iconPath).slice(1).toLowerCase();
  const mime = iconMimeType(ext);
  if (!mime) throw new Error(`Unsupported icon file type: .${ext || "unknown"}`);
  return `data:${mime};base64,${readFileSync(iconPath).toString("base64")}`;
}

function toProject(row: VisibleProjectRow, favorites: Set<string>): Project {
  const relatedIds = [row.id];
  return {
    id: row.id,
    worktree: row.worktree,
    name: row.name || undefined,
    worktreeName: row.worktree_name || undefined,
    latestSessionTitle: row.latest_session_title || undefined,
    icon: cachedIconPath(row.id),
    iconColor: row.icon_color || undefined,
    tint: tint(row.icon_color),
    startupCommand: row.startup_command || undefined,
    sandboxCount: row.sandbox_count ?? 0,
    updatedAt: row.time_updated ?? undefined,
    hasIcon: Boolean(row.has_icon),
    isSessionOnly: row.kind === "session_only",
    isFavorite: isProjectFavorite(favorites, {
      id: row.id,
      worktree: row.worktree,
      relatedIds,
    }),
    relatedIds,
  };
}

function cachedProjectToProject(record: CachedProject, favorites: Set<string>): Project {
  const relatedIds = record.relatedIds?.length ? record.relatedIds : [record.id];
  return {
    id: record.id,
    worktree: record.worktree,
    name: record.name,
    worktreeName: record.worktreeName,
    latestSessionTitle: record.latestSessionTitle,
    icon: cachedIconPath(record.id),
    iconColor: record.iconColor,
    tint: tint(record.iconColor),
    startupCommand: record.startupCommand,
    sandboxCount: record.sandboxCount,
    updatedAt: record.updatedAt,
    hasIcon: record.hasIcon,
    isSessionOnly: Boolean(record.isSessionOnly),
    isFavorite: isProjectFavorite(favorites, {
      id: record.id,
      worktree: record.worktree,
      relatedIds,
    }),
    relatedIds,
  };
}

function localFolderEntryToProject(worktree: string, favorites: Set<string>, cached?: CachedProject): Project {
  if (cached) return cachedProjectToProject(cached, favorites);

  const relatedIds = [worktree];
  return {
    id: worktree,
    worktree,
    name: path.basename(worktree),
    sandboxCount: 0,
    hasIcon: false,
    isSessionOnly: false,
    isFavorite: isProjectFavorite(favorites, { id: worktree, worktree, relatedIds }),
    relatedIds,
  };
}

export function readCachedProjects() {
  return readCachedProjectLists().items;
}

export function readLocalFolderProjects(folderPath: string) {
  const favorites = getFavorites();
  const cachedProjectsByWorktree = new Map(readProjectIndex().map((item) => [item.worktree, item]));
  const items: Project[] = [];

  try {
    for (const entry of readdirSync(folderPath, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const worktree = path.join(folderPath, entry.name);
      items.push(localFolderEntryToProject(worktree, favorites, cachedProjectsByWorktree.get(worktree)));
    }
  } catch {
    return [];
  }

  return sortProjects(items);
}

function readAllCachedProjects() {
  const favorites = getFavorites();
  return sortProjects(dedupeProjects(readProjectIndex().map((item) => cachedProjectToProject(item, favorites))));
}

function writeMergedProjectIndex(items: Project[]) {
  const byWorktree = new Map(readAllCachedProjects().map((item) => [item.worktree, item]));
  for (const item of items) byWorktree.set(item.worktree, item);
  writeProjectIndex(sortProjects([...byWorktree.values()]));
}

export function mergeProjectsIntoCache(items: Project[]) {
  if (!items.length) return;
  writeMergedProjectIndex(items);
}

export function readCachedProjectLists() {
  return splitExcludedProjects(readAllCachedProjects());
}

export async function loadProjects() {
  const favorites = getFavorites();
  const items = sortProjects(
    dedupeProjects([
      ...(await listVisibleProjects())
        .filter((item) => Boolean(item.id && item.worktree))
        .map((item) => toProject(item, favorites)),
    ]),
  );

  // Avoid command-startup crashes when resolving preview titles needs to load
  // large Opencode server state. The local database already provides usable
  // session titles for this list.
  writeProjectIndex(items);
  return splitExcludedProjects(items);
}

function prioritizeHydration(items: Project[]) {
  return [...items].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    const timeA = a.updatedAt ?? 0;
    const timeB = b.updatedAt ?? 0;
    return timeB - timeA;
  });
}

type ProjectRemoteMetadata = Project & {
  remoteMismatch?: {
    actualRemoteUrl?: string;
  };
  remoteUrl?: string;
};

function projectRemoteUrlForIcon(item: Project) {
  const project = item as ProjectRemoteMetadata;
  const candidate =
    project.remoteMismatch?.actualRemoteUrl ??
    project.remoteUrl ??
    item.relatedIds.find((id) => id.includes("github.com"));
  return candidate;
}

function shouldIgnoreCachedRemoteIcon(item: Project) {
  const project = item as ProjectRemoteMetadata;
  if (!project.remoteMismatch?.actualRemoteUrl || !project.remoteUrl) return false;

  return (
    Boolean(githubOwnerFromRemoteUrl(project.remoteUrl)) &&
    !githubOwnerFromRemoteUrl(project.remoteMismatch.actualRemoteUrl)
  );
}

async function hydrateIconBatch(items: Project[]) {
  for (const item of items) {
    const ignoreCachedRemoteIcon = shouldIgnoreCachedRemoteIcon(item);
    if (ignoreCachedRemoteIcon) {
      item.icon = undefined;
      item.hasIcon = false;
    } else if (item.icon) {
      continue;
    }

    // Prefer a live repo icon so renames/replacements win over stale cache.
    const projectIcon = discoverProjectIcon(item.worktree);
    if (projectIcon) {
      item.icon = cacheProjectIcon(item.id, projectIcon);
      item.hasIcon = true;
      continue;
    }

    const cached = ignoreCachedRemoteIcon ? undefined : cachedIconPath(item.id);
    if (cached) {
      item.icon = cached;
      continue;
    }

    const githubIcon = await fetchGithubOwnerIcon(projectRemoteUrlForIcon(item));
    if (githubIcon) {
      item.icon = cacheIconFile(item.id, githubIcon.ext, githubIcon.data);
      item.hasIcon = true;
      continue;
    }
  }
}

export async function hydrateProjectIcons(items: Project[], onUpdate?: HydrationUpdate, options?: { force?: boolean }) {
  const next = items.map((item) => ({ ...item }));

  // Clear cached icons if force refresh requested
  if (options?.force) {
    for (const item of next) {
      if (item.icon && !item.icon.startsWith("data:")) {
        item.icon = undefined;
      }
    }
  }

  const pending = prioritizeHydration(next.filter((item) => !item.icon));
  if (!pending.length) return next;

  const priority = pending.slice(0, iconHydrationPriorityCount);
  const remainder = pending.slice(iconHydrationPriorityCount);

  if (priority.length) {
    await hydrateIconBatch(priority);
    onUpdate?.([...next]);
  }

  // When the caller doesn't consume progressive updates, avoid eagerly loading
  // every remaining icon into the command worker before first render.
  if (!onUpdate) return next;

  for (let index = 0; index < remainder.length; index += iconHydrationBatchSize) {
    await hydrateIconBatch(remainder.slice(index, index + iconHydrationBatchSize));
    onUpdate?.([...next]);
  }

  return next;
}

export function renameProjectInCache(items: Project[], project: Pick<Project, "worktree">, name?: string) {
  const nextName = name?.trim() || undefined;
  const next = sortProjects(
    items.map((item) => (item.worktree === project.worktree ? { ...item, name: nextName } : item)),
  );
  writeMergedProjectIndex(next);
  return next;
}

export function updateProjectInCache(
  items: Project[],
  project: Pick<Project, "worktree">,
  updates: Partial<Pick<Project, "name" | "iconColor" | "startupCommand">>,
) {
  const next = sortProjects(
    items.map((item) =>
      item.worktree === project.worktree
        ? {
            ...item,
            name: updates.name?.trim() || undefined,
            iconColor: updates.iconColor?.trim() || undefined,
            tint: tint(updates.iconColor),
            startupCommand: updates.startupCommand?.trim() || undefined,
          }
        : item,
    ),
  );

  writeMergedProjectIndex(next);
  return next;
}

export function toggleFavoriteProject(items: Project[], project: Pick<Project, "id" | "worktree" | "relatedIds">) {
  const favorites = new Set(getFavorites());
  const key = project.worktree;
  const keysToClear = favoriteKeys(project);
  const alreadyFavorite = keysToClear.some((favoriteKey) => favorites.has(favoriteKey));

  for (const favoriteKey of keysToClear) favorites.delete(favoriteKey);
  if (!alreadyFavorite) favorites.add(key);

  writeFavorites(favorites);
  return sortProjects(
    items.map((item) =>
      item.worktree === project.worktree ? { ...item, isFavorite: isProjectFavorite(favorites, item) } : item,
    ),
  );
}

export function removeProjectFromCache(items: Project[], project: Pick<Project, "id" | "worktree">) {
  const favorites = new Set(getFavorites());
  const removed = favorites.delete(project.worktree) || favorites.delete(project.id);
  if (removed) writeFavorites(favorites);

  const excludedProjects = new Set(getExcludedProjects());
  excludedProjects.add(project.worktree);
  writeExcludedProjects(excludedProjects);

  const next = items.filter((item) => item.worktree !== project.worktree);
  writeMergedProjectIndex(next);
  return next;
}

export function restoreExcludedProject(project: Pick<Project, "worktree">) {
  const excludedProjects = new Set(getExcludedProjects());
  excludedProjects.delete(project.worktree);
  writeExcludedProjects(excludedProjects);
}

export async function saveProjectIcon(items: Project[], project: Pick<Project, "id" | "worktree">, iconPath: string) {
  const ext = path.extname(iconPath).slice(1).toLowerCase();
  if (!projectIconExtensions.includes(ext)) {
    throw new Error("Use PNG, JPG, JPEG, SVG, GIF, WEBP, or ICO");
  }

  await saveProjectIconToDb(project.worktree, projectIconDataUrl(iconPath));

  const cachedIcon = cacheProjectIcon(project.id, iconPath);
  const next = items.map((item) =>
    item.worktree === project.worktree ? { ...item, icon: cachedIcon, hasIcon: true } : item,
  );
  writeMergedProjectIndex(next);
  return next;
}

export async function resyncProjectIcon(items: Project[], project: Pick<Project, "id" | "worktree">) {
  const iconPath = discoverProjectIcon(project.worktree);
  if (!iconPath) clearCachedIcon(project.id);

  const next = items.map((item) =>
    item.worktree === project.worktree
      ? {
          ...item,
          icon: iconPath ? cacheProjectIcon(project.id, iconPath) : undefined,
          hasIcon: Boolean(iconPath),
        }
      : item,
  );
  writeMergedProjectIndex(next);
  return next;
}
