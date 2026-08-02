import { LocalStorage, environment, getPreferenceValues, type Keyboard } from "@raycast/api";
import os from "node:os";
import path from "node:path";
import { DEFAULT_GLOBAL_IGNORED_SUBPATHS, normalizeIgnoredSubpaths } from "@raggle-ai/local";
import {
  APP_REGISTRY,
  multiOpenInShortcutForIndex,
  normalizeOpenInTargetAlias,
  type OpenInShortcutSetting,
  type OpenInTarget,
} from "../config/open-in-apps";
import { defaultOpenInOption } from "./open-in";

export { DEFAULT_GLOBAL_IGNORED_SUBPATHS };

type StandardProjectsPreferences = {
  projectSource?: ProjectSourceType;
  cloneDirectory?: string;
  projectActionsDirectory?: string;
  openInTarget?: OpenInTarget;
  defaultTerminalTarget?: OpenInTarget;
  defaultIdeTarget?: OpenInTarget;
  defaultAiClientTarget?: OpenInTarget;
  defaultDocumentsTarget?: OpenInTarget;
  defaultGitDiffTarget?: OpenInTarget;
  multiOpenInTargets?: OpenInTarget[];
  multiOpenInShortcuts?: OpenInShortcutSetting[];
  gitCloneAccount?: string;
  gitPullRequestAuthors?: string[];
  tursoDatabaseUrl?: string;
  tursoAuthToken?: string;
};

type StoredStandardProjectsSettings = {
  projectSource?: string;
  projectListFile?: string | string[];
  cloneDirectory?: string | string[];
  projectActionsDirectory?: string | string[];
  globalIgnoredSubpaths?: string[] | string;
  openInTarget?: string;
  defaultTerminalTarget?: string;
  defaultIdeTarget?: string;
  defaultAiClientTarget?: string;
  defaultDocumentsTarget?: string;
  defaultGitDiffTarget?: string;
  multiOpenInTargets?: string[] | string;
  multiOpenInShortcuts?: StoredOpenInShortcutSetting[];
  gitCloneAccount?: string;
  gitPullRequestAuthors?: string[] | string;
  tursoDatabaseUrl?: string;
  tursoAuthToken?: string;
};

type StoredOpenInShortcutSetting = {
  target?: string;
  shortcut?: Keyboard.Shortcut;
};

export type ProjectSourceType = "json-file" | "turso";

export type StandardProjectsSettings = {
  projectSource?: ProjectSourceType;
  projectListFile?: string;
  cloneDirectory?: string;
  projectActionsDirectory?: string[];
  globalIgnoredSubpaths?: string[];
  openInTarget?: OpenInTarget;
  defaultTerminalTarget?: OpenInTarget;
  defaultIdeTarget?: OpenInTarget;
  defaultAiClientTarget?: OpenInTarget;
  defaultDocumentsTarget?: OpenInTarget;
  defaultGitDiffTarget?: OpenInTarget;
  multiOpenInTargets?: OpenInTarget[];
  multiOpenInShortcuts?: OpenInShortcutSetting[];
  gitCloneAccount?: string;
  gitPullRequestAuthors?: string[];
  tursoDatabaseUrl?: string;
  tursoAuthToken?: string;
  deviceName?: string;
};

const STANDARD_PROJECTS_SETTINGS_KEY = "standard-projects-settings";
const LEGACY_DEFAULT_GLOBAL_IGNORED_SUBPATHS = [".rgl", "meetings", "drafts", "notes", "pets", "scripts"];

function expandHome(input?: string) {
  if (!input) return undefined;
  if (input === "~") return os.homedir();
  if (input.startsWith(`~${path.sep}`)) return path.join(os.homedir(), input.slice(2));
  return input;
}

function normalizeGlobalIgnoredSubpaths(input: unknown) {
  const normalized = normalizeIgnoredSubpaths(input, DEFAULT_GLOBAL_IGNORED_SUBPATHS);
  if (
    normalized.length === LEGACY_DEFAULT_GLOBAL_IGNORED_SUBPATHS.length &&
    normalized.every((item, index) => item === LEGACY_DEFAULT_GLOBAL_IGNORED_SUBPATHS[index])
  ) {
    return DEFAULT_GLOBAL_IGNORED_SUBPATHS;
  }

  return normalized;
}

function normalizeProjectActionsDirectories(input?: string | string[]) {
  const values = Array.isArray(input) ? input : input ? [input] : [];
  return values.map(expandHome).filter((value): value is string => Boolean(value));
}

function normalizeGitPullRequestAuthors(input?: string | string[]) {
  const values = Array.isArray(input) ? input : input ? [input] : [];

  return [
    ...new Set(
      values
        .flatMap((value) => value.split(/[\s,]+/))
        .map((value) => value.trim().replace(/^@/, ""))
        .filter(Boolean),
    ),
  ];
}

function normalizeGitHubUsername(input?: string) {
  const username = input?.trim().replace(/^@/, "");
  return username || undefined;
}

function normalizeOpenInTarget(input?: string): OpenInTarget | undefined {
  if (!input) return undefined;
  if (input.startsWith("app:")) return input as OpenInTarget;
  const target = normalizeOpenInTargetAlias(input);
  return APP_REGISTRY.some((item) => item.target === target) ? (target as OpenInTarget) : undefined;
}

function normalizeOpenInTargets(input?: string | string[]): OpenInTarget[] {
  const values = Array.isArray(input) ? input : input ? [input] : [];
  const targets = values.map(normalizeOpenInTarget).filter((target): target is OpenInTarget => Boolean(target));

  return [...new Set(targets)];
}

function normalizeOpenInShortcutSettings(
  shortcuts?: StoredOpenInShortcutSetting[],
  fallbackTargets?: string | string[],
): OpenInShortcutSetting[] {
  const normalizedShortcuts = (shortcuts ?? [])
    .map((item) => {
      const target = normalizeOpenInTarget(item.target);
      if (!target || !item.shortcut) return undefined;

      return { target, shortcut: item.shortcut };
    })
    .filter((item): item is OpenInShortcutSetting => Boolean(item));

  if (normalizedShortcuts.length) return normalizedShortcuts;

  return normalizeOpenInTargets(fallbackTargets)
    .map((target, index) => {
      const shortcut = multiOpenInShortcutForIndex(index);
      return shortcut ? { target, shortcut } : undefined;
    })
    .filter((item): item is OpenInShortcutSetting => Boolean(item));
}

export function standardProjectsPreferences() {
  return standardProjectsPreferencesWithOverrides();
}

function normalizeStoredStandardProjectsSettings(
  settings: StoredStandardProjectsSettings | undefined,
): StandardProjectsSettings {
  const projectSource = settings?.projectSource === "turso" ? "turso" : "json-file";
  const projectListFile = expandHome(
    Array.isArray(settings?.projectListFile) ? settings?.projectListFile[0] : settings?.projectListFile,
  );
  const cloneDirectory = expandHome(
    Array.isArray(settings?.cloneDirectory) ? settings?.cloneDirectory[0] : settings?.cloneDirectory,
  );
  const projectActionsDirectory = normalizeProjectActionsDirectories(settings?.projectActionsDirectory);
  const openInTarget = normalizeOpenInTarget(settings?.openInTarget);
  const defaultTerminalTarget = normalizeOpenInTarget(settings?.defaultTerminalTarget);
  const defaultIdeTarget = normalizeOpenInTarget(settings?.defaultIdeTarget);
  const defaultAiClientTarget = normalizeOpenInTarget(settings?.defaultAiClientTarget);
  const defaultDocumentsTarget = normalizeOpenInTarget(settings?.defaultDocumentsTarget);
  const defaultGitDiffTarget = normalizeOpenInTarget(settings?.defaultGitDiffTarget);
  const multiOpenInTargets = normalizeOpenInTargets(settings?.multiOpenInTargets);
  const multiOpenInShortcuts = normalizeOpenInShortcutSettings(
    settings?.multiOpenInShortcuts,
    settings?.multiOpenInTargets,
  );

  return {
    projectSource,
    projectListFile,
    cloneDirectory,
    projectActionsDirectory,
    globalIgnoredSubpaths: normalizeGlobalIgnoredSubpaths(settings?.globalIgnoredSubpaths),
    openInTarget,
    defaultTerminalTarget,
    defaultIdeTarget,
    defaultAiClientTarget,
    defaultDocumentsTarget,
    defaultGitDiffTarget,
    multiOpenInTargets,
    multiOpenInShortcuts,
    gitCloneAccount: normalizeGitHubUsername(settings?.gitCloneAccount),
    gitPullRequestAuthors: normalizeGitPullRequestAuthors(settings?.gitPullRequestAuthors),
    tursoDatabaseUrl: settings?.tursoDatabaseUrl?.trim() || undefined,
    tursoAuthToken: settings?.tursoAuthToken?.trim() || undefined,
    deviceName: os.hostname(),
  };
}

export async function getStandardProjectsSettings(): Promise<StandardProjectsSettings> {
  try {
    const stored = await LocalStorage.getItem<string>(STANDARD_PROJECTS_SETTINGS_KEY);
    if (!stored) return {};
    return normalizeStoredStandardProjectsSettings(JSON.parse(stored) as StoredStandardProjectsSettings);
  } catch (error) {
    console.error("Failed to load standard project settings:", error);
    return {};
  }
}

export async function saveStandardProjectsSettings(settings: StandardProjectsSettings): Promise<void> {
  try {
    await LocalStorage.setItem(
      STANDARD_PROJECTS_SETTINGS_KEY,
      JSON.stringify(normalizeStoredStandardProjectsSettings(settings)),
    );
  } catch (error) {
    console.error("Failed to save standard project settings:", error);
    throw error;
  }
}

function standardProjectsPreferencesWithMode(overrides?: StandardProjectsSettings, allowIncomplete = false) {
  const preferences = getPreferenceValues<StandardProjectsPreferences>();
  const projectSource = overrides?.projectSource ?? preferences.projectSource ?? "json-file";
  const projectListFile = expandHome(overrides?.projectListFile) ?? "";
  const cloneDirectory = expandHome(overrides?.cloneDirectory ?? preferences.cloneDirectory);
  const projectActionsDirectory = normalizeProjectActionsDirectories(
    overrides?.projectActionsDirectory ?? preferences.projectActionsDirectory,
  );

  if (!allowIncomplete && projectSource === "json-file" && !projectListFile) {
    throw new Error("Set the Projects List File in Project Settings");
  }

  if (!allowIncomplete && !cloneDirectory) {
    throw new Error("Set the Clone Directory preference in extension settings");
  }

  return {
    projectSource,
    projectListFile,
    cloneDirectory: cloneDirectory ?? "",
    projectActionsDirectory,
    globalIgnoredSubpaths: normalizeGlobalIgnoredSubpaths(overrides?.globalIgnoredSubpaths),
    openInTarget: overrides?.openInTarget ?? defaultOpenInOption(preferences.openInTarget ?? "opencode").target,
    defaultTerminalTarget: overrides?.defaultTerminalTarget,
    defaultIdeTarget: overrides?.defaultIdeTarget,
    defaultAiClientTarget: overrides?.defaultAiClientTarget,
    defaultDocumentsTarget: overrides?.defaultDocumentsTarget,
    defaultGitDiffTarget: overrides?.defaultGitDiffTarget,
    multiOpenInTargets: normalizeOpenInTargets(overrides?.multiOpenInTargets),
    multiOpenInShortcuts: normalizeOpenInShortcutSettings(
      overrides?.multiOpenInShortcuts,
      overrides?.multiOpenInTargets,
    ),
    gitCloneAccount: normalizeGitHubUsername(overrides?.gitCloneAccount),
    gitPullRequestAuthors: normalizeGitPullRequestAuthors(overrides?.gitPullRequestAuthors),
    tursoDatabaseUrl: (overrides?.tursoDatabaseUrl ?? preferences.tursoDatabaseUrl)?.trim(),
    tursoAuthToken: (overrides?.tursoAuthToken ?? preferences.tursoAuthToken)?.trim(),
    deviceName: os.hostname(),
  };
}

export function standardProjectsPreferencesWithOverrides(overrides?: StandardProjectsSettings) {
  return standardProjectsPreferencesWithMode(overrides, false);
}

export function standardProjectsPreferencesAllowIncomplete(overrides?: StandardProjectsSettings) {
  return standardProjectsPreferencesWithMode(overrides, true);
}

export function extensionPaths() {
  const supportPath = environment.supportPath;
  const projectIconsPath = path.join(supportPath, "project-icons");

  return {
    supportPath,
    projectIconsPath,
    projectIndexPath: path.join(supportPath, "projects.json"),
    standardProjectsSnapshotPath: path.join(supportPath, "standard-projects-snapshot.json"),
    standardProjectsCloneIndexPath: path.join(supportPath, "standard-projects-clone-index.json"),
    standardProjectsTursoRowsPath: path.join(supportPath, "standard-projects-turso-rows.json"),
    favoritesPath: path.join(supportPath, "favorites.json"),
    excludedProjectsPath: path.join(supportPath, "excluded-projects.json"),
    iconManifestPath: path.join(supportPath, "icon-manifest.json"),
    pluginCachePath: path.join(supportPath, "plugin-cache"),
  };
}
