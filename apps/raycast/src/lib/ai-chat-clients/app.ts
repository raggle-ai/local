import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const applicationDirs = [
  "/Applications",
  "/System/Library/CoreServices",
  path.join(os.homedir(), "Applications"),
];

export function installedApplicationPath(appNames: string[]) {
  for (const dir of applicationDirs) {
    for (const appName of appNames) {
      const appPath = path.join(dir, appName);
      if (existsSync(appPath)) return appPath;
    }
  }

  return undefined;
}

// =============================================================================
// Shell quoting and command string builders
// =============================================================================

export function shellQuote(input: string) {
  return `'${input.replace(/'/g, `'\\''`)}'`;
}

export function openCommand(target: string) {
  return `open ${shellQuote(target)}`;
}

export function openApplicationCommand(appPath: string, target: string) {
  return `open -a ${shellQuote(appPath)} ${shellQuote(target)}`;
}

export function openInstalledApplicationCommand(appNames: string[], target: string) {
  const appName = appNames[0];
  return appName ? `open -a ${shellQuote(appName)} ${shellQuote(target)}` : openCommand(target);
}

export function terminalCommand(binaryPath: string, worktree: string) {
  return `${shellQuote(binaryPath)} ${shellQuote(worktree)}`;
}

export function opencodePath() {
  return process.env.OPENCODE_PATH || path.join(os.homedir(), ".opencode/bin/opencode");
}

// =============================================================================
// Terminal launching (osascript)
// =============================================================================

export function openInTerminalCommand(command: string) {
  return `osascript -e ${shellQuote(`tell application "Terminal" to do script ${JSON.stringify(command)}`)} -e ${shellQuote(
    'tell application "Terminal" to activate',
  )}`;
}

export function openIniTermCommand(worktree: string) {
  return runIniTermCommand(`cd ${shellQuote(worktree)}`);
}

export function runIniTermCommand(command: string) {
  return [
    "osascript",
    `-e ${shellQuote('tell application "iTerm" to activate')}`,
    `-e ${shellQuote('tell application "iTerm" to if (count of windows) = 0 then create window with default profile')}`,
    `-e ${shellQuote(
      `tell application "iTerm" to tell current session of current window to write text ${JSON.stringify(command)}`,
    )}`,
  ].join(" ");
}

export async function openInTerminal(command: string) {
  await execFileAsync("osascript", [
    "-e",
    `tell application "Terminal" to do script ${JSON.stringify(command)}`,
    "-e",
    'tell application "Terminal" to activate',
  ]);
}

export async function openIniTerm(worktree: string) {
  await runIniTerm(`cd ${shellQuote(worktree)}`);
}

export async function runIniTerm(command: string) {
  await execFileAsync("osascript", [
    "-e",
    'tell application "iTerm" to activate',
    "-e",
    'tell application "iTerm" to if (count of windows) = 0 then create window with default profile',
    "-e",
    `tell application "iTerm" to tell current session of current window to write text ${JSON.stringify(command)}`,
  ]);
}

// =============================================================================
// App launching
// =============================================================================

export async function openInstalledApplicationUrl(appNames: string[], url: string) {
  const appPath = installedApplicationPath(appNames);
  if (!appPath) return false;

  await execFileAsync("open", ["-a", appPath, url]);
  return true;
}

export async function openApplicationPath(appPath: string, target: string) {
  await execFileAsync("open", ["-a", appPath, target]);
}

export async function openInstalledApplicationPath(appNames: string[], target: string) {
  const appPath = installedApplicationPath(appNames);
  if (!appPath) return false;

  await openApplicationPath(appPath, target);
  return true;
}
