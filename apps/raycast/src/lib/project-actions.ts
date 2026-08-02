import type { Action, ActionPanel, List } from "@raycast/api";
import type { ComponentProps } from "react";
import type { GitHubRepository, ProjectActionConfig } from "@raggle-ai/local";
import type { StandardProjectSnapshotItem } from "./standard-project-cache";

export type ProjectActionSection = "open-in" | "repository" | "custom";

export type ProjectActionItem = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: ComponentProps<typeof Action>["icon"];
  section: ProjectActionSection;
  accessories?: List.Item.Props["accessories"];
  shortcut?: ComponentProps<typeof Action>["shortcut"];
  onAction?: () => Promise<void> | void;
  pushTarget?: ComponentProps<typeof Action.Push>["target"];
  childActions?: ProjectActionItem[];
  extraActions?: ComponentProps<typeof ActionPanel>["children"];
};

export type ProjectActionContext = {
  project: StandardProjectSnapshotItem;
  name: string;
  folderPath: string;
  hasLocalProject: boolean;
  browserUrl?: string;
  remoteUrl?: string;
  githubRepository?: GitHubRepository;
  pluginPath?: string;
  pluginFilePath?: string;
  pluginDirectory?: string;
  resolvePluginPath?: (...segments: string[]) => string;
};

export type ProjectActionFactory = (
  context: ProjectActionContext,
) => ProjectActionItem[] | Promise<ProjectActionItem[]>;

export type ProjectActionExport = ProjectActionItem[] | ProjectActionFactory;

export type ProjectActionModule =
  | ProjectActionExport
  | {
      default?: ProjectActionExport;
      projectActions?: ProjectActionExport;
      projectConfig?: ProjectActionConfig;
      config?: ProjectActionConfig;
    };

export function defineProjectActions(factory: ProjectActionFactory) {
  return factory;
}

export function defineProjectConfig(config: ProjectActionConfig) {
  return config;
}

export async function resolveProjectActions(actions: ProjectActionExport | undefined, context: ProjectActionContext) {
  if (!actions) return [];

  return typeof actions === "function" ? actions(context) : actions;
}

export function projectActionsFromModule(module: ProjectActionModule) {
  if (typeof module === "function" || Array.isArray(module)) return module;

  return module.projectActions ?? module.default;
}

export function projectConfigFromModule(module: ProjectActionModule) {
  if (typeof module === "function" || Array.isArray(module)) return undefined;

  return module.projectConfig ?? module.config;
}
