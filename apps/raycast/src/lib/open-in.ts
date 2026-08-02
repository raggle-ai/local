import { closeMainWindow, environment, Icon, open, type Image } from "@raycast/api";
import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectRemoteBrowserUrl } from "@raggle-ai/local";
import {
  APP_REGISTRY,
  OPEN_IN_APP_OVERRIDES,
  getBrowserHostAppConfigs,
  getAppConfig,
  getOpenStrategy,
  type AppConfig,
  type OpenInTarget,
} from "../config/open-in-apps";
import { getAiChatClient } from "./ai-chat-clients";
import {
  openApplicationCommand,
  openApplicationPath,
  openCommand,
  openIniTerm,
  openIniTermCommand,
  openInTerminal,
  openInTerminalCommand,
  runIniTerm,
  openInstalledApplicationCommand,
  openInstalledApplicationPath,
  terminalCommand,
} from "./ai-chat-clients/app";

export type { OpenInTarget } from "../config/open-in-apps";

export type OpenInOption = {
  target: OpenInTarget;
  title: string;
  icon: Image.ImageLike;
  isInstalled: () => boolean;
};

function installedApplicationNames() {
  return new Set(
    applicationDirs().flatMap((dir) => {
      try {
        return readdirSync(dir);
      } catch {
        return [];
      }
    }),
  );
}

function applicationDirs() {
  return [
    "/Applications",
    "/Applications/Utilities",
    "/System/Applications",
    "/System/Applications/Utilities",
    "/System/Library/CoreServices",
    path.join(os.homedir(), "Applications"),
  ];
}

export function appTarget(appPath: string): OpenInTarget {
  return `app:${appPath}`;
}

export function appPathFromOpenInTarget(target: OpenInTarget) {
  return target.startsWith("app:") ? target.slice("app:".length) : undefined;
}

function titleFromAppPath(appPath: string) {
  return path.basename(appPath, ".app");
}

export function openInOptionForTarget(target: OpenInTarget): OpenInOption {
  const customAppPath = appPathFromOpenInTarget(target);
  if (customAppPath) {
    return {
      target,
      title: titleFromAppPath(customAppPath),
      icon: { fileIcon: customAppPath },
      isInstalled: () => true,
    };
  }

  return openInOptions.find((item) => item.target === target) ?? openInOptions[0];
}

function installedApplicationPath(appNames: string[]) {
  for (const dir of applicationDirs()) {
    for (const appName of appNames) {
      const appPath = path.join(dir, appName);
      if (installedApps.has(appName)) return appPath;
    }
  }

  return undefined;
}

function bundledIconPath(icon: string) {
  return path.join(environment.assetsPath, icon.replace(/^assets\//, ""));
}

const installedApps = installedApplicationNames();

function isInstalled(config: AppConfig) {
  if (OPEN_IN_APP_OVERRIDES[config.target]?.allowMissingInstall) {
    return true;
  }

  if (config.appNames?.length) {
    return config.appNames.some((appName) => installedApps.has(appName));
  }

  return false;
}

export const openInOptions: OpenInOption[] = APP_REGISTRY.map((item) => ({
  target: item.target,
  title: item.title,
  icon:
    item.target === "finder"
      ? Icon.Finder
      : installedApplicationPath(item.appNames ?? [])
        ? { fileIcon: installedApplicationPath(item.appNames ?? []) as string }
        : bundledIconPath(item.icon),
  isInstalled: () => isInstalled(item),
}));

export function installedOpenInOptions() {
  return openInOptions.filter((item) => item.isInstalled());
}

export function browserHostOpenInOptions(browserUrl?: string) {
  return getBrowserHostAppConfigs(browserUrl).map((item) => openInOptionForTarget(item.target));
}

export function defaultOpenInOption(defaultTarget: OpenInTarget) {
  if (appPathFromOpenInTarget(defaultTarget)) {
    return openInOptionForTarget(defaultTarget);
  }

  const installed = installedOpenInOptions();
  return installed.find((item) => item.target === defaultTarget) ?? installed[0] ?? openInOptions[0];
}

export function secondaryOpenInOptions(defaultTarget: OpenInTarget) {
  const primary = defaultOpenInOption(defaultTarget);
  return installedOpenInOptions().filter((item) => item.target !== primary.target);
}

export async function runCommandInTerminal(command: string, target: OpenInTarget = "terminal") {
  const strategy = getOpenStrategy(target);

  if (strategy.type === "terminal-script" && strategy.script === "iterm2") {
    await runIniTerm(command);
    return;
  }

  await openInTerminal(command);
}

// =============================================================================
// Project opening — strategy dispatch
// =============================================================================

export async function openProject(worktree: string, target: OpenInTarget = "opencode") {
  const strategy = getOpenStrategy(target);
  const appConfig = getAppConfig(target);

  switch (strategy.type) {
    case "ai-chat-client": {
      await (await getAiChatClient(strategy.client)).openProject({ worktree });
      return;
    }

    case "git-host": {
      const remoteUrl = await projectRemoteBrowserUrl(worktree);
      const remoteHost = new URL(remoteUrl).hostname.replace(/^www\./, "");
      const expectedHosts = strategy.hosts.map((host) => host.replace(/^www\./, ""));
      if (!expectedHosts.includes(remoteHost)) {
        throw new Error(`Project remote is hosted on ${remoteHost}, not ${expectedHosts.join(" or ")}.`);
      }

      await closeMainWindow().catch(() => undefined);
      await open(remoteUrl);
      return;
    }

    case "gui-app": {
      const customAppPath = appPathFromOpenInTarget(target);
      if (customAppPath) {
        await openApplicationPath(customAppPath, worktree);
        return;
      }

      const appNames = appConfig?.appNames ?? [];
      await openInstalledApplicationPath(appNames, worktree);
      return;
    }

    case "preferred-gui-then-terminal": {
      const appNames = appConfig?.appNames ?? [];
      if (await openInstalledApplicationPath(appNames, worktree)) return;

      const binaryPath = process.env[strategy.binaryEnvVar] || strategy.binaryDefault;
      await openInTerminal(terminalCommand(binaryPath, worktree));
      return;
    }

    case "terminal-script": {
      if (strategy.script === "iterm2") {
        await openIniTerm(worktree);
      }
      return;
    }
  }
}

export async function projectOpenCommand(worktree: string, target: OpenInTarget = "opencode") {
  const strategy = getOpenStrategy(target);
  const appConfig = getAppConfig(target);

  switch (strategy.type) {
    case "ai-chat-client": {
      const aiChatClient = await getAiChatClient(strategy.client);
      const command = await aiChatClient.openProjectCommand?.({ worktree });
      if (command) return command;

      return openInstalledApplicationCommand(appConfig?.appNames ?? [], worktree);
    }

    case "git-host": {
      const remoteUrl = await projectRemoteBrowserUrl(worktree);
      return openCommand(remoteUrl);
    }

    case "gui-app": {
      const customAppPath = appPathFromOpenInTarget(target);
      if (customAppPath) return openApplicationCommand(customAppPath, worktree);

      return openInstalledApplicationCommand(appConfig?.appNames ?? [], worktree);
    }

    case "preferred-gui-then-terminal": {
      const appNames = appConfig?.appNames ?? [];
      if (appNames.length) return openInstalledApplicationCommand(appNames, worktree);

      const binaryPath = process.env[strategy.binaryEnvVar] || strategy.binaryDefault;
      return openInTerminalCommand(terminalCommand(binaryPath, worktree));
    }

    case "terminal-script": {
      if (strategy.script === "iterm2") return openIniTermCommand(worktree);
      return "";
    }
  }
}

export async function projectOpenDeeplink(worktree: string, target: OpenInTarget = "opencode") {
  const strategy = getOpenStrategy(target);

  switch (strategy.type) {
    case "ai-chat-client": {
      const aiChatClient = await getAiChatClient(strategy.client);
      const deeplink = await aiChatClient.openProjectDeeplink?.({ worktree });
      if (deeplink) return rawDeeplink(deeplink);

      throw new Error(`${aiChatClient.title} does not provide a project deeplink for this target.`);
    }

    case "git-host": {
      return projectRemoteBrowserUrl(worktree);
    }

    default: {
      throw new Error(`${openInOptionForTarget(target).title} does not provide a project deeplink.`);
    }
  }
}

function rawDeeplink(value: string) {
  const trimmed = value.trim();
  const match = /^open\s+(?:"([^"]+)"|'([^']+)'|(\S+))$/.exec(trimmed);

  return match?.[1] ?? match?.[2] ?? match?.[3] ?? trimmed;
}

export async function openProjectNewSession(worktree: string, target: OpenInTarget = "opencode") {
  const strategy = getOpenStrategy(target);

  switch (strategy.type) {
    case "ai-chat-client": {
      await (await getAiChatClient(strategy.client)).openProject({ worktree, mode: "new" });
      return;
    }

    default: {
      await openProject(worktree, target);
      return;
    }
  }
}

export async function openProjectRemote(worktree: string) {
  const remoteUrl = await projectRemoteBrowserUrl(worktree);
  await closeMainWindow().catch(() => undefined);
  await open(remoteUrl);
}
