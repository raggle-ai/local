/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `projects` command */
  export type Projects = ExtensionPreferences & {
  /** Project Source - Where project repositories are loaded from */
  "projectSource": "json-file" | "turso",
  /** Clone Directory - Directory where repositories should be cloned */
  "cloneDirectory": string,
  /** Project Actions Folder - Folder containing a plugins directory or project actions plugin */
  "projectActionsDirectory"?: string,
  /** Open In - Default app used when opening a project */
  "openInTarget": "opencode" | "vscodium" | "codex" | "t3-code" | "claude" | "devin" | "pible" | "vscode" | "cursor" | "windsurf" | "zed" | "sublime" | "bbedit" | "nova" | "webstorm" | "intellij" | "iterm2",
  /** Turso Database - libSQL database URL when Project Source is Turso/libSQL */
  "tursoDatabaseUrl"?: string,
  /** Turso API Token - Database auth token for private Turso databases */
  "tursoAuthToken"?: string
}
}

declare namespace Arguments {
  /** Arguments passed to the `projects` command */
  export type Projects = {}
}

