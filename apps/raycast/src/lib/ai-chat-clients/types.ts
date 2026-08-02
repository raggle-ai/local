export const AI_CHAT_CLIENT_IDS = ["opencode", "codex", "claude", "t3-code", "devin", "pible"] as const;

export type AiChatClientId = (typeof AI_CHAT_CLIENT_IDS)[number];

export type AiChatProjectOpenMode = "existing-or-new" | "new";

export type OpenAiChatProjectOptions = {
  worktree: string;
  mode?: AiChatProjectOpenMode;
};

export type AiChatProjectCommandOptions = {
  worktree: string;
};

export type AiChatClientCapabilities = {
  opensProjectFolder: boolean;
  canResumeProjectSession: boolean;
  canStartNewProjectSession: boolean;
};

export type RadarTemplateVariable = {
  key: string;
  label?: string;
  placeholder?: string;
  format?: string;
  encoding?: "none" | "url-component";
};

export type RadarLauncherIntent =
  | "open-project"
  | "open-folder"
  | "new-session"
  | "resume-session"
  | "fallback"
  | "settings";

export type RadarTemplate = {
  id: string;
  label: string;
  intent: RadarLauncherIntent;
  urlTemplate: string;
  variables?: RadarTemplateVariable[];
};

export type RadarLauncher = RadarTemplate & {
  kind: "command";
};

export type RadarApplication = {
  name: string;
  slug: AiChatClientId;
  category: "Application";
  homepage: string;
  platforms: string[];
  appNames?: string[];
  bundleId?: string;
  capabilities: AiChatClientCapabilities;
  deeplinks?: RadarTemplate[];
  launchers?: RadarLauncher[];
};

export type AiChatClient = {
  id: AiChatClientId;
  title: string;
  capabilities: AiChatClientCapabilities;
  openProject: (options: OpenAiChatProjectOptions) => Promise<void>;
  openProjectDeeplink?: (options: AiChatProjectCommandOptions) => Promise<string | undefined>;
  openProjectCommand?: (options: AiChatProjectCommandOptions) => Promise<string>;
};
