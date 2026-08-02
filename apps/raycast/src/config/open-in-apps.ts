/**
 * Raycast-specific presentation and fallback configuration for "Open In" targets.
 *
 * Raggle Radar owns AI client names, capabilities, app names, deeplinks, and
 * launchers. This registry keeps synchronous labels, icons, installation hints,
 * and non-AI opening strategies required while Raycast starts.
 *
 * When adding a new application:
 * 1. Add Raycast presentation configuration to src/open-in-apps.json
 * 2. Specify a special opening strategy below if it does not use standard macOS app opening
 */

import type { Image, Keyboard } from "@raycast/api";
import openInApps from "../open-in-apps.json";
import { type AiChatClientId } from "../lib/ai-chat-clients/types";

/** Identifier for supported applications */
export type OpenInTarget = (typeof openInApps)[number]["target"] | AiChatClientId | `app:${string}`;

export type OpenInShortcutSetting = {
  target: OpenInTarget;
  shortcut: Keyboard.Shortcut;
};

export type DefaultOpenInAppType = "terminal" | "ide" | "aiClient" | "documents" | "gitDiff";

export const DEFAULT_TERMINAL_OPEN_IN_TARGET: OpenInTarget = "terminal";
export const DEFAULT_IDE_OPEN_IN_TARGET: OpenInTarget = "vscodium";
export const DEFAULT_AI_CLIENT_OPEN_IN_TARGET: OpenInTarget = "opencode";
export const DEFAULT_DOCUMENTS_OPEN_IN_TARGET: OpenInTarget = "zettlr";
export const DEFAULT_GIT_DIFF_OPEN_IN_TARGET: OpenInTarget = "github-desktop";

export const DEFAULT_OPEN_IN_APP_SHORTCUTS: Record<DefaultOpenInAppType, Keyboard.Shortcut> = {
  terminal: { modifiers: ["cmd", "shift"], key: "d" },
  ide: { modifiers: ["cmd", "shift"], key: "i" },
  aiClient: { modifiers: ["cmd", "shift"], key: "a" },
  documents: { modifiers: ["cmd", "opt"], key: "m" },
  gitDiff: { modifiers: ["cmd", "shift"], key: "g" },
};

/** How an application should be opened */
export type OpenStrategy =
  | { type: "gui-app" } // Standard GUI editor that opens worktree directly
  | { type: "git-host"; hosts: string[] } // Browser target for matching Git remotes
  | { type: "ai-chat-client"; client: AiChatClientId } // AI client deeplink handler
  | { type: "preferred-gui-then-terminal"; binaryEnvVar: string; binaryDefault: string } // Try GUI app first, fall back to terminal binary
  | { type: "terminal-script"; script: "terminal" | "iterm2" }; // Special terminal automation

/** Application metadata used by both UI and execution layers */
export interface AppConfig {
  target: OpenInTarget;
  title: string;
  icon: string; // Path relative to assets, or "command-icon.png" for default
  appNames?: string[]; // macOS .app bundle names to check for installation
  browserHosts?: string[]; // Git hosts that should open in the default browser
  allowMissingInstall?: boolean; // Show even when no installed app is detected so launch can surface its own error
}

/** Opening strategy for each application target */
export interface AppOpenStrategy {
  target: OpenInTarget;
  strategy: OpenStrategy;
}

type RawAppConfig = Omit<AppConfig, "title"> & { title?: string };

const AI_CHAT_CLIENT_FALLBACKS = {
  opencode: { title: "OpenCode", appNames: ["OpenCode.app", "OpenCode Beta.app"] },
  codex: { title: "Codex", appNames: ["ChatGPT.app", "Codex.app"] },
  claude: { title: "Claude Code", appNames: ["Claude.app"] },
  "t3-code": { title: "T3 Code", appNames: ["T3 Code.app", "T3 Code (Alpha).app"] },
  devin: { title: "Devin", appNames: ["Devin.app"] },
  pible: { title: "Pible", appNames: ["Pible.app"] },
} satisfies Record<AiChatClientId, Pick<AppConfig, "title" | "appNames">>;

export const APP_REGISTRY = (openInApps as RawAppConfig[]).map((item): AppConfig => {
  const fallback = AI_CHAT_CLIENT_FALLBACKS[item.target as AiChatClientId];
  if (fallback) return { ...fallback, ...item, target: item.target as OpenInTarget };
  if (!item.title) throw new Error(`Missing Raycast fallback title for ${item.target}`);
  return { ...item, title: item.title };
});

export const OPEN_IN_MULTI_APP_SHORTCUTS: Keyboard.Shortcut[] = [
  { modifiers: ["cmd", "opt"], key: "1" },
  { modifiers: ["cmd", "opt"], key: "2" },
  { modifiers: ["cmd", "opt"], key: "3" },
  { modifiers: ["cmd", "opt"], key: "4" },
  { modifiers: ["cmd", "opt"], key: "5" },
  { modifiers: ["cmd", "opt"], key: "6" },
  { modifiers: ["cmd", "opt"], key: "7" },
  { modifiers: ["cmd", "opt"], key: "8" },
  { modifiers: ["cmd", "opt"], key: "9" },
];

export function multiOpenInShortcutForIndex(index: number): Keyboard.Shortcut | undefined {
  return OPEN_IN_MULTI_APP_SHORTCUTS[index];
}

export const OPEN_IN_APP_OVERRIDES: Partial<Record<OpenInTarget, Partial<AppConfig>>> = {
  opencode: {
    allowMissingInstall: true,
  },
  pible: {
    allowMissingInstall: true,
  },
};

const LEGACY_OPEN_IN_TARGET_ALIASES = {
  t3: "t3-code",
} satisfies Record<string, OpenInTarget>;

export function normalizeOpenInTargetAlias(target: string): string {
  return LEGACY_OPEN_IN_TARGET_ALIASES[target] ?? target;
}

// =============================================================================
// OPEN STRATEGIES - How each application should be opened
// =============================================================================

const STANDARD_GUI_APPS = new Set<OpenInTarget>([
  "vscodium",
  "openchamber",
  "vscode",
  "cursor",
  "windsurf",
  "zed",
  "sublime",
  "bbedit",
  "typora",
  "zettlr",
  "clearly",
  "nova",
  "webstorm",
  "intellij",
  "github-desktop",
  "sourcetree",
  "finder",
]);

const IDE_OPEN_IN_TARGETS = new Set<OpenInTarget>([
  "vscodium",
  "openchamber",
  "vscode",
  "cursor",
  "windsurf",
  "zed",
  "sublime",
  "bbedit",
  "nova",
  "webstorm",
  "intellij",
]);

const DOCUMENT_OPEN_IN_TARGETS = new Set<OpenInTarget>(["zettlr", "typora", "clearly"]);
const GIT_DIFF_OPEN_IN_TARGETS = new Set<OpenInTarget>(["github-desktop", "sourcetree"]);

export function defaultOpenInTargetForType(
  settings: {
    defaultTerminalTarget?: OpenInTarget;
    defaultIdeTarget?: OpenInTarget;
    defaultAiClientTarget?: OpenInTarget;
    defaultDocumentsTarget?: OpenInTarget;
    defaultGitDiffTarget?: OpenInTarget;
  },
  type: DefaultOpenInAppType,
) {
  if (type === "terminal") return settings.defaultTerminalTarget ?? DEFAULT_TERMINAL_OPEN_IN_TARGET;
  if (type === "ide") return settings.defaultIdeTarget ?? DEFAULT_IDE_OPEN_IN_TARGET;
  if (type === "aiClient") return settings.defaultAiClientTarget ?? DEFAULT_AI_CLIENT_OPEN_IN_TARGET;
  if (type === "documents") return settings.defaultDocumentsTarget ?? DEFAULT_DOCUMENTS_OPEN_IN_TARGET;
  return settings.defaultGitDiffTarget ?? DEFAULT_GIT_DIFF_OPEN_IN_TARGET;
}

export function defaultOpenInAppLabel(type: DefaultOpenInAppType) {
  if (type === "terminal") return "Terminal";
  if (type === "ide") return "IDE";
  if (type === "aiClient") return "AI Client";
  if (type === "documents") return "Documents";
  return "Git Diff";
}

export function isDefaultOpenInTargetForType(target: OpenInTarget, type: DefaultOpenInAppType) {
  const strategy = getOpenStrategy(target);

  if (type === "terminal") return strategy.type === "terminal-script";
  if (type === "aiClient") return strategy.type === "ai-chat-client";
  if (type === "documents") return DOCUMENT_OPEN_IN_TARGETS.has(target);
  if (type === "gitDiff") return GIT_DIFF_OPEN_IN_TARGETS.has(target);
  return IDE_OPEN_IN_TARGETS.has(target);
}

export function getOpenStrategy(target: OpenInTarget): OpenStrategy {
  if (target.startsWith("app:")) {
    return { type: "gui-app" };
  }

  const appConfig = getAppConfig(target);
  if (appConfig?.browserHosts?.length) {
    return { type: "git-host", hosts: appConfig.browserHosts };
  }

  // Special cases
  if (target === "terminal" || target === "iterm2") {
    return { type: "terminal-script", script: target };
  }

  if (
    target === "opencode" ||
    target === "codex" ||
    target === "t3-code" ||
    target === "claude" ||
    target === "devin" ||
    target === "pible"
  ) {
    return { type: "ai-chat-client", client: target };
  }

  // Standard GUI apps
  if (STANDARD_GUI_APPS.has(target)) {
    return { type: "gui-app" };
  }

  // Fallback
  return { type: "gui-app" };
}

// =============================================================================
// LOOKUP HELPERS
// =============================================================================

/** Find app config by target identifier */
export function getAppConfig(target: OpenInTarget): AppConfig | undefined {
  return APP_REGISTRY.find((app) => app.target === target);
}

/** Get all app configurations */
export function getAllAppConfigs(): AppConfig[] {
  return APP_REGISTRY;
}

export function hostFromBrowserUrl(browserUrl?: string) {
  if (!browserUrl) return undefined;

  try {
    return new URL(browserUrl).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function getBrowserHostAppConfigs(browserUrl?: string) {
  const host = hostFromBrowserUrl(browserUrl);
  if (!host) return [];

  return APP_REGISTRY.filter((app) =>
    app.browserHosts?.some((browserHost) => browserHost.replace(/^www\./, "") === host),
  );
}

/** Type for UI layer option items */
export interface OpenInOption {
  target: OpenInTarget;
  title: string;
  icon: Image.ImageLike;
  isInstalled: () => boolean;
}
