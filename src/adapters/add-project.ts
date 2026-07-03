import path from "node:path";
import { normalizeRepositoryUrl, repositoryDirectoryName, repositoryName } from "./git-repository";
import {
  type ImportedRepository,
  type ImportedRepositoryRow,
  normalizeClonePathTemplate,
  normalizeFolders,
  normalizeTags,
} from "./import";
import { normalizeSubpathPaths } from "../core/project-subpaths";

export type AddProjectValues = {
  url: string;
  name: string;
  description: string;
  tags: string;
  folders: string[];
  subpaths: string;
};

function splitListInput(input: string) {
  return input
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getRepositoryNameFromUrl(url: string) {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return "";

  try {
    return repositoryName(normalizeRepositoryUrl(trimmedUrl));
  } catch {
    return "";
  }
}

export function getRepositoryDirectoryNameFromUrl(url: string) {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return "";

  try {
    return repositoryDirectoryName(trimmedUrl);
  } catch {
    return "";
  }
}

export function deriveLocalProjectPath(url: string, defaultCloneDirectory?: string, folderName?: string) {
  const repository = folderName?.trim() || getRepositoryDirectoryNameFromUrl(url);
  if (!defaultCloneDirectory) return repository;
  if (!repository) return defaultCloneDirectory;
  return path.join(defaultCloneDirectory, repository);
}

export function deriveProjectName(url: string) {
  return repositoryName(normalizeRepositoryUrl(url.trim()));
}

export function clonePathTemplateFromFormValue(
  clonePath: string,
  defaultCloneDirectory: string,
  defaultRepositoryName: string,
) {
  const trimmedClonePath = clonePath.trim();
  if (!trimmedClonePath) return undefined;

  const clonePathTemplate = (() => {
    if (!path.isAbsolute(trimmedClonePath) || !defaultCloneDirectory) return trimmedClonePath;

    const relativePath = path.relative(defaultCloneDirectory, trimmedClonePath);
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return trimmedClonePath;
    return relativePath;
  })();
  const normalized = normalizeClonePathTemplate(clonePathTemplate);

  if (!normalized || normalized === defaultRepositoryName) return undefined;
  return normalized;
}

export function projectRowFromValues(values: AddProjectValues): ImportedRepositoryRow {
  const normalizedUrl = normalizeRepositoryUrl(values.url.trim());
  const derivedName = deriveProjectName(normalizedUrl);
  const trimmedName = values.name.trim();
  const description = values.description.trim();
  const tags = normalizeTags(splitListInput(values.tags));
  const folders = normalizeFolders(values.folders ?? []);
  const subpaths = normalizeSubpathPaths(splitListInput(values.subpaths));
  const row: ImportedRepositoryRow = { url: normalizedUrl };

  if (trimmedName && trimmedName !== derivedName) row.name = trimmedName;
  if (description) row.description = description;
  if (tags.length) row.tags = tags;
  if (folders.length) row.folders = folders;
  if (subpaths.length) row.subpaths = subpaths;

  return row;
}

export function repositoryRootPath(
  repository: Pick<ImportedRepository, "repository" | "clonePathTemplate"> & { remoteUrl?: string },
  defaultCloneDirectory: string,
) {
  const clonePathTemplate = normalizeClonePathTemplate(repository.clonePathTemplate);
  if (clonePathTemplate) {
    return path.isAbsolute(clonePathTemplate) ? clonePathTemplate : path.join(defaultCloneDirectory, clonePathTemplate);
  }

  return path.join(
    defaultCloneDirectory,
    repository.remoteUrl ? repositoryDirectoryName(repository.remoteUrl) : repository.repository,
  );
}

export function repositoryCloneParentDirectory(
  repository: Pick<ImportedRepository, "repository" | "clonePathTemplate">,
  defaultCloneDirectory: string,
) {
  return path.dirname(repositoryRootPath(repository, defaultCloneDirectory));
}
