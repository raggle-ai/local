import { closeMainWindow, open } from "@raycast/api";
import {
  openCommand,
  openInTerminal,
  openInTerminalCommand,
  openInstalledApplicationCommand,
  openInstalledApplicationPath,
  openInstalledApplicationUrl,
} from "./app";
import { localAppOverrideFor } from "./local-app-overrides";
import { radarProjectTarget } from "./radar-target";
import { sessionResolvers } from "./session-resolvers";
import { type AiChatClient, type OpenAiChatProjectOptions, type RadarApplication } from "./types";

async function latestSession(application: RadarApplication, worktree: string) {
  if (!application.capabilities.canResumeProjectSession) return undefined;
  return sessionResolvers[application.slug]?.(worktree);
}

async function openDeeplink(application: RadarApplication, url: string, fallbackUrl?: string) {
  await closeMainWindow().catch(() => undefined);

  const localOverride = localAppOverrideFor(application.slug);
  if (localOverride && (await localOverride.openUrl(url))) return;
  if (await openInstalledApplicationUrl(application.appNames ?? [], url)) return;

  await open(fallbackUrl ?? url);
}

async function openLauncherCommand(command: string) {
  await closeMainWindow().catch(() => undefined);
  await openInTerminal(command);
}

async function projectTarget(application: RadarApplication, options: OpenAiChatProjectOptions) {
  const session = options.mode === "new" ? undefined : await latestSession(application, options.worktree);
  return radarProjectTarget(application, options, session);
}

export function createAiChatClient(application: RadarApplication): AiChatClient {
  return {
    id: application.slug,
    title: application.name,
    capabilities: application.capabilities,
    async openProject(options) {
      const target = await projectTarget(application, options);
      if (!target) throw new Error(`No Radar launcher configured for ${application.name}`);

      if (target.type === "deeplink") {
        await openDeeplink(application, target.value, target.fallbackValue);
        return;
      }

      if (target.type === "folder") {
        if (await openInstalledApplicationPath(application.appNames ?? [], target.value)) return;
        if (target.fallbackLauncher) {
          await openLauncherCommand(target.fallbackLauncher);
          return;
        }
        return;
      }

      await openLauncherCommand(target.value);
    },
    async openProjectCommand(options) {
      const target = await projectTarget(application, options);
      if (!target) throw new Error(`No Radar launcher configured for ${application.name}`);

      if (target.type === "deeplink") {
        return localAppOverrideFor(application.slug)?.urlCommand(target.value) ?? openCommand(target.value);
      }

      if (target.type === "folder") return openInstalledApplicationCommand(application.appNames ?? [], target.value);
      return openInTerminalCommand(target.value);
    },
    async openProjectDeeplink(options) {
      const target = await projectTarget(application, options);
      if (!target) throw new Error(`No Radar launcher configured for ${application.name}`);

      return target.type === "deeplink" ? target.value : undefined;
    },
  };
}
