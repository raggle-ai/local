import path from "node:path";

type FolderProjectParent = {
  name?: string;
  repositoryRoot: string;
};

export function folderDisplayName(folder: string) {
  return folder.split("/").join(" - ");
}

export function repoPrefixedProjectName(parent: FolderProjectParent, folder: string, removePathFromName?: boolean) {
  if (removePathFromName) return path.posix.basename(folder);
  return `${parent.name ?? parent.repositoryRoot} - ${folderDisplayName(folder)}`;
}

function normalizeRelativeFolder(folder: string) {
  return folder
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .join("/");
}

function normalizeSubpathContext(subpathRoot: string) {
  const normalizedSubpath = normalizeRelativeFolder(subpathRoot);
  if (normalizedSubpath === "subpaths") return "";
  if (normalizedSubpath.startsWith("subpaths/")) return normalizedSubpath.slice("subpaths/".length);
  return normalizedSubpath;
}

export function subpathContextName(parent: FolderProjectParent, subpathRoot: string) {
  const repositoryName = path.basename(parent.repositoryRoot) || parent.name || parent.repositoryRoot;
  const normalizedSubpath = normalizeSubpathContext(subpathRoot);

  return normalizedSubpath ? `${repositoryName}/${normalizedSubpath}` : repositoryName;
}

export function subpathProjectName(folder: string) {
  return path.posix.basename(normalizeRelativeFolder(folder) || folder);
}

export function subpathParentDisplayName(folder: string) {
  const parentPath = normalizeSubpathContext(path.posix.dirname(normalizeRelativeFolder(folder)));
  if (!parentPath || parentPath === ".") return undefined;
  return folderDisplayName(parentPath);
}
