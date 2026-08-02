export {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Color,
  Detail,
  Form,
  Icon,
  Keyboard,
  List,
  Toast,
  closeMainWindow,
  confirmAlert,
  getPreferenceValues,
  launchCommand,
  open,
  openCommandPreferences,
  openExtensionPreferences,
  popToRoot,
  showHUD,
  showInFinder,
  showToast,
} from "@raycast/api";

export type ProjectActionSection = "open-in" | "repository" | "custom";

export type ProjectActionItem = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: unknown;
  section: ProjectActionSection;
  accessories?: unknown;
  onAction?: () => Promise<void> | void;
  childActions?: ProjectActionItem[];
  extraActions?: unknown;
};

export type GitHubRepository = {
  owner: string;
  repo: string;
  browserUrl: string;
};

export type ProjectActionContext = {
  project: unknown;
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

export type ProjectActionConfig = {
  tags?: string[];
  folders?: string[];
  subpaths?: Array<string | { path: string; allSubpath?: boolean; removePathFromName?: boolean }>;
  allSubpath?: boolean;
  removePathFromName?: boolean;
  ignoredSubpaths?: string[] | string;
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

export function defineProjectActions(factory: ProjectActionFactory): ProjectActionFactory;
export function defineProjectConfig(config: ProjectActionConfig): ProjectActionConfig;
export function resolveProjectActions(
  actions: ProjectActionExport | undefined,
  context: ProjectActionContext,
): Promise<ProjectActionItem[]>;
export function projectActionsFromModule(module: ProjectActionModule): ProjectActionExport | undefined;
export function projectConfigFromModule(module: ProjectActionModule): ProjectActionConfig | undefined;
