import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { shellQuote } from "./app";
import { type AiChatClientId } from "./types";

const execFileAsync = promisify(execFile);

type LocalAppOverride = {
  openUrl: (url: string) => Promise<boolean>;
  urlCommand: (url: string) => string | undefined;
};

function pibleDevelopmentOverride(): LocalAppOverride {
  const repoPath = process.env.PIBLE_DEV_PATH || path.join(os.homedir(), "LOCAL/Github/raggle-ai-pible");
  const appPath = process.env.PIBLE_DEV_APP_PATH || path.join(repoPath, "apps/desktop");
  const electronPath =
    process.env.PIBLE_DEV_ELECTRON_PATH ||
    path.join(repoPath, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");

  function isAvailable() {
    return existsSync(electronPath) && existsSync(appPath);
  }

  return {
    async openUrl(url) {
      if (!isAvailable()) return false;
      await execFileAsync(electronPath, [appPath, url]);
      return true;
    },
    urlCommand(url) {
      if (!isAvailable()) return undefined;
      return `${shellQuote(electronPath)} ${shellQuote(appPath)} ${shellQuote(url)}`;
    },
  };
}

const localAppOverrides: Partial<Record<AiChatClientId, LocalAppOverride>> = {
  pible: pibleDevelopmentOverride(),
};

export function localAppOverrideFor(clientId: AiChatClientId) {
  return localAppOverrides[clientId];
}
