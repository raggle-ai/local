import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  Icon,
  List,
  Toast,
  openExtensionPreferences,
  showToast,
  useNavigation,
} from "@raycast/api";
import { existsSync } from "node:fs";
import path from "node:path";
import { Fragment, type ComponentProps, type JSX } from "react";
import { defaultOpenInAppItems } from "../lib/default-open-in-apps";
import { syncGitRemoteWithToast } from "../lib/git-sync";
import { defaultOpenInOption } from "../lib/open-in";
import {
  openProject,
  openProjectNewSession,
  openProjectRemote,
  projectOpenDeeplink,
  type OpenInTarget,
} from "../lib/open-in";
import { projectAccessoryPath, projectKeywords, projectSubtitle, projectTitle } from "../lib/project";
import { type ProjectActionItem } from "../lib/project-actions";
import { discoverProjectIcon, type Project } from "../lib/project-store";
import { type ProjectSubpathSettingsValues } from "@raggle-ai/local";
import { AddProjectForm } from "./add-project-form";
import { AddSubpathForm } from "./add-subpath-form";
import { CloneProjectForm, type CloneProjectFormValues } from "./clone-project-form";
import { EditProjectForm, type EditProjectFormValues } from "./edit-project-form";
import { EnhancedListActionPanel } from "./enhanced-list";
import { IndividualProjectSettings, type IndividualProjectSettingsValues } from "./individual-project-settings";
import { LocalFileActions } from "./local-file-actions";
import { ProjectActionItemsList } from "./project-actions-list";
import { ProjectSubpathSettings } from "./project-subpath-settings";
import { Shortcuts } from "./shortcuts";

type SaveProjectHandler = (project: Project, values: EditProjectFormValues) => Promise<boolean>;
type CloneProjectHandler = (project: Project, values: CloneProjectFormValues) => Promise<boolean>;
type SaveProjectIconHandler = (project: Project) => Promise<boolean>;
type LoadProjectFormValuesHandler = (project: Project) => Promise<EditProjectFormValues>;
type LoadIndividualProjectSettingsHandler = (project: Project) => Promise<IndividualProjectSettingsValues>;
type SaveIndividualProjectSettingsHandler = (
  project: Project,
  values: IndividualProjectSettingsValues,
) => Promise<boolean>;
type LoadProjectSubpathSettingsHandler = (project: Project) => Promise<ProjectSubpathSettingsValues>;
type SaveProjectSubpathSettingsHandler = (project: Project, values: ProjectSubpathSettingsValues) => Promise<boolean>;
type AddProjectHandler = ComponentProps<typeof AddProjectForm>["onSubmit"];
type DeleteProjectHandler = (project: Project) => Promise<boolean>;
type AddSubpathHandler = (project: Project, subpath: string, options?: { createFolder?: boolean }) => Promise<boolean>;
type ProjectActionsTarget = ComponentProps<typeof Action.Push>["target"];

type ProjectWithSettings = Project & {
  repositoryRoot?: string;
  parentProjectName?: string;
  relativePath?: string;
};

type ShowMoreProjectsListItemProps = {
  shown: number;
  total: number;
  onShowMore: () => void;
};

export type ProjectListItemProps = {
  item: ProjectWithSettings;
  listItemId?: string;
  defaultCloneDirectory?: string;
  showRepositoryRootMarker?: boolean;
  showPathAccessory?: boolean;
  showSubtitle?: boolean;
  hasLocalProject?: boolean;
  includeManagementActions?: boolean;
  subtitle?: string;
  accessoryText?: string;
  onOpenProject?: (project: Project) => Promise<void>;
  onOpenProjectIn?: (project: Project, target: OpenInTarget) => Promise<void>;
  onOpenProjectNewSession?: (project: Project, target: OpenInTarget) => Promise<void>;
  onCloneProject?: CloneProjectHandler;
  onRefreshProjects?: () => Promise<void>;
  onRemoveProject?: (project: Project) => Promise<void>;
  onSaveProject?: SaveProjectHandler;
  onLoadProjectFormValues?: LoadProjectFormValuesHandler;
  onLoadIndividualProjectSettings?: LoadIndividualProjectSettingsHandler;
  onSaveIndividualProjectSettings?: SaveIndividualProjectSettingsHandler;
  onLoadProjectSubpathSettings?: LoadProjectSubpathSettingsHandler;
  onSaveProjectSubpathSettings?: SaveProjectSubpathSettingsHandler;
  onSaveProjectIcon?: SaveProjectIconHandler;
  onAddProject?: AddProjectHandler;
  onAddSubpath?: AddSubpathHandler;
  onDeleteProject?: DeleteProjectHandler;
  remoteUrl?: string;
  openInTarget?: OpenInTarget;
  supportsNewSessionTarget?: boolean;
  defaultTerminalTarget?: OpenInTarget;
  defaultIdeTarget?: OpenInTarget;
  defaultAiClientTarget?: OpenInTarget;
  defaultDocumentsTarget?: OpenInTarget;
  defaultGitDiffTarget?: OpenInTarget;
  onOpenSettings?: () => void;
  projectActionsTarget?: ProjectActionsTarget;
  deleteProjectTarget?: ProjectActionsTarget;
  projectActionItems?: ProjectActionItem[];
  extraActions?: ComponentProps<typeof ActionPanel>["children"];
};

export function ShowMoreProjectsListItem({ shown, total, onShowMore }: ShowMoreProjectsListItemProps) {
  return (
    <List.Item
      title="Show More Results"
      subtitle={`Showing ${shown} of ${total}`}
      icon={Icon.Plus}
      accessories={[{ tag: String(total - shown) }]}
      actions={
        <ActionPanel>
          <Action title="Show More Results" icon={Icon.Plus} onAction={onShowMore} />
        </ActionPanel>
      }
    />
  );
}

function renderDirectProjectAction(action: ProjectActionItem): JSX.Element {
  const childActions = action.childActions ?? [];
  const hasChildActions = childActions.length > 0;
  const pushTarget = action.pushTarget;

  return pushTarget ? (
    <Action.Push key={action.id} title={action.title} icon={action.icon ?? undefined} target={pushTarget} />
  ) : hasChildActions ? (
    <Action.Push
      key={action.id}
      title={action.title}
      icon={action.icon ?? undefined}
      target={<ProjectActionItemsList title={action.title} actions={childActions} />}
    />
  ) : action.onAction ? (
    <Action key={action.id} title={action.title} icon={action.icon ?? undefined} onAction={action.onAction} />
  ) : (
    <Action key={action.id} title={action.title} icon={action.icon ?? undefined} />
  );
}

function projectRepositoryRoot(item: ProjectWithSettings) {
  return typeof item.repositoryRoot === "string" ? item.repositoryRoot : item.worktree;
}

function projectSettingsProjectName(item: ProjectWithSettings) {
  const repositoryRoot = projectRepositoryRoot(item);
  const isSubpath = typeof item.relativePath === "string";
  if (isSubpath && item.parentProjectName) return item.parentProjectName;
  return isSubpath ? path.basename(repositoryRoot) || projectTitle(item) : projectTitle(item);
}

function projectSettingsIcon(item: ProjectWithSettings) {
  return item.icon ?? discoverProjectIcon(projectRepositoryRoot(item));
}

export function ProjectListItem({
  item,
  listItemId,
  defaultCloneDirectory,
  showRepositoryRootMarker = false,
  showPathAccessory = true,
  showSubtitle = true,
  hasLocalProject: hasLocalProjectOverride,
  includeManagementActions = true,
  subtitle,
  accessoryText,
  onOpenProject,
  onOpenProjectIn,
  onOpenProjectNewSession,
  onCloneProject,
  onRefreshProjects,
  onRemoveProject,
  onSaveProject,
  onLoadProjectFormValues,
  onLoadIndividualProjectSettings,
  onSaveIndividualProjectSettings,
  onLoadProjectSubpathSettings,
  onSaveProjectSubpathSettings,
  onSaveProjectIcon,
  onAddProject,
  onAddSubpath,
  onDeleteProject,
  remoteUrl,
  openInTarget,
  supportsNewSessionTarget = false,
  defaultTerminalTarget,
  defaultIdeTarget,
  defaultAiClientTarget,
  defaultDocumentsTarget,
  defaultGitDiffTarget,
  onOpenSettings,
  projectActionsTarget,
  deleteProjectTarget,
  projectActionItems = [],
  extraActions,
}: ProjectListItemProps) {
  const { push } = useNavigation();
  const hasLocalProject = hasLocalProjectOverride ?? existsSync(item.worktree);
  const defaultOpenIn = defaultOpenInOption(openInTarget ?? "opencode");
  const defaultAppItems = defaultOpenInAppItems({
    defaultTerminalTarget,
    defaultIdeTarget,
    defaultAiClientTarget,
    defaultDocumentsTarget,
    defaultGitDiffTarget,
  });
  const openTitle = hasLocalProject ? `Open in ${defaultOpenIn.title}` : `Clone and Open in ${defaultOpenIn.title}`;
  const openIcon = hasLocalProject ? Icon.Terminal : Icon.Download;
  const canOpenNewSession = hasLocalProject || Boolean(onOpenProjectNewSession);
  const supportsNewSession = canOpenNewSession && supportsNewSessionTarget;
  const title = showRepositoryRootMarker ? `★ ${projectTitle(item)}` : projectTitle(item);

  async function copyOpenDeeplink() {
    try {
      const deeplink = await projectOpenDeeplink(item.worktree, defaultOpenIn.target);
      await Clipboard.copy(deeplink);
      await showToast({
        style: Toast.Style.Success,
        title: `Copied ${defaultOpenIn.title} Deeplink`,
        message: deeplink,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Could Not Copy ${defaultOpenIn.title} Deeplink`,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <List.Item
      id={listItemId ?? item.worktree}
      title={title}
      subtitle={showSubtitle ? (subtitle ?? projectSubtitle(item)) : undefined}
      keywords={projectKeywords(item)}
      accessories={[
        ...(accessoryText ? [{ text: accessoryText }] : []),
        ...(showPathAccessory ? [{ text: projectAccessoryPath(item), tooltip: item.worktree }] : []),
        ...(item.isFavorite ? [{ icon: { source: Icon.Star, tintColor: Color.Yellow } }] : []),
        ...(item.sandboxCount
          ? [
              {
                tag: `${item.sandboxCount} sandbox${item.sandboxCount === 1 ? "" : "es"}`,
              },
            ]
          : []),
      ]}
      icon={item.icon ? { source: item.icon } : undefined}
      actions={
        <EnhancedListActionPanel
          onSelect={
            <Action
              title={openTitle}
              icon={openIcon}
              onAction={async () => {
                if (onOpenProject) {
                  await onOpenProject(item);
                  return;
                }
                if (onOpenProjectIn) {
                  await onOpenProjectIn(item, defaultOpenIn.target);
                  return;
                }
                await openProject(item.worktree, defaultOpenIn.target);
              }}
            />
          }
          onCommandSelect={
            hasLocalProject ? (
              <Action.Open
                title="Open Folder in Finder"
                target={item.worktree}
                icon={Icon.Finder}
                shortcut={{ modifiers: ["cmd", "shift"], key: "return" }}
              />
            ) : null
          }
        >
          {projectActionsTarget ? (
            <Action.Push
              title="Project Actions"
              target={projectActionsTarget}
              icon={Icon.List}
              shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
            />
          ) : null}
          {supportsNewSession ? (
            <Action
              title={`Open New Session in ${defaultOpenIn.title}`}
              icon={Icon.Plus}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
              onAction={async () => {
                if (onOpenProjectNewSession) {
                  await onOpenProjectNewSession(item, defaultOpenIn.target);
                  return;
                }
                await openProjectNewSession(item.worktree, defaultOpenIn.target);
              }}
            />
          ) : null}
          {defaultAppItems.map((defaultApp) => (
            <Action
              key={`open-default-${defaultApp.type}`}
              title={`Open in ${defaultApp.label} (${defaultApp.option.title})`}
              icon={defaultApp.option.icon}
              shortcut={defaultApp.shortcut}
              onAction={async () => {
                if (onOpenProjectIn) {
                  await onOpenProjectIn(item, defaultApp.target);
                  return;
                }

                await openProject(item.worktree, defaultApp.target);
              }}
            />
          ))}
          <Action.Push
            title="Show Shortcuts"
            target={<Shortcuts />}
            icon={Icon.Keyboard}
            shortcut={{ modifiers: ["cmd", "opt"], key: "/" }}
          />
          {!hasLocalProject && onCloneProject ? (
            <Action.Push
              title="Clone Repository"
              icon={Icon.Download}
              target={
                <CloneProjectForm
                  item={item}
                  defaultCloneDirectory={defaultCloneDirectory}
                  onSubmit={(values) => onCloneProject(item, values)}
                />
              }
            />
          ) : null}
          {projectActionItems.length ? (
            <ActionPanel.Section title="Project Actions">
              {projectActionItems.map((action) => (
                <Fragment key={action.id}>
                  {renderDirectProjectAction(action)}
                  {action.extraActions}
                </Fragment>
              ))}
            </ActionPanel.Section>
          ) : null}
          {includeManagementActions && onRefreshProjects ? (
            <Action
              title="Reload Projects"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              onAction={async () => onRefreshProjects()}
            />
          ) : null}
          {includeManagementActions && onAddProject ? (
            <Action
              title="Add New Project"
              icon={Icon.Plus}
              shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
              onAction={() =>
                push(<AddProjectForm defaultCloneDirectory={defaultCloneDirectory} onSubmit={onAddProject} />)
              }
            />
          ) : null}
          {includeManagementActions && onSaveProject && onLoadProjectFormValues ? (
            <Action
              title="Edit Repository"
              icon={Icon.Pencil}
              shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
              onAction={async () => {
                push(
                  <EditProjectForm
                    navigationTitle="Edit Repository"
                    submitTitle="Save Repository"
                    description="Update the repository import entry used to build this list."
                    initialValues={await onLoadProjectFormValues(item)}
                    defaultCloneDirectory={defaultCloneDirectory}
                    fields={{ name: true, description: true, url: true, tags: true, folders: true, subpaths: true }}
                    onSubmit={async (values) => onSaveProject(item, values)}
                  />,
                );
              }}
            />
          ) : null}
          {includeManagementActions &&
          item.relativePath &&
          onSaveProjectSubpathSettings &&
          onLoadProjectSubpathSettings ? (
            <Action
              title="Subpath Settings"
              icon={Icon.Gear}
              shortcut={{ modifiers: ["cmd", "opt"], key: "," }}
              onAction={async () => {
                push(
                  <ProjectSubpathSettings
                    projectName={projectSettingsProjectName(item)}
                    projectIcon={projectSettingsIcon(item)}
                    subpath={item.relativePath ?? ""}
                    initialValues={await onLoadProjectSubpathSettings(item)}
                    onSubmit={(values) => onSaveProjectSubpathSettings(item, values)}
                  />,
                );
              }}
            />
          ) : includeManagementActions && onSaveIndividualProjectSettings && onLoadIndividualProjectSettings ? (
            <Action
              title="Individual Project Settings"
              icon={Icon.Gear}
              shortcut={{ modifiers: ["cmd", "opt"], key: "," }}
              onAction={async () => {
                push(
                  <IndividualProjectSettings
                    projectName={projectSettingsProjectName(item)}
                    projectIcon={projectSettingsIcon(item)}
                    initialValues={await onLoadIndividualProjectSettings(item)}
                    onSubmit={(values) => onSaveIndividualProjectSettings(item, values)}
                  />,
                );
              }}
            />
          ) : null}
          {includeManagementActions && onAddSubpath && hasLocalProject ? (
            <Action.Push
              title="Add Subpath"
              icon={Icon.PlusCircle}
              shortcut={{ modifiers: ["cmd", "opt"], key: "p" }}
              target={
                <AddSubpathForm
                  item={item}
                  onSubmit={async (subpath, options) => onAddSubpath(item, subpath, options)}
                />
              }
            />
          ) : null}
          {includeManagementActions && onDeleteProject && (deleteProjectTarget || projectActionsTarget) ? (
            <Action.Push
              title="Delete Project"
              icon={Icon.Trash}
              shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
              target={deleteProjectTarget ?? projectActionsTarget}
            />
          ) : includeManagementActions && onDeleteProject ? (
            <Action
              title="Delete Project"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
              onAction={async () => onDeleteProject(item)}
            />
          ) : null}
          {includeManagementActions && onSaveProjectIcon && hasLocalProject ? (
            <Action
              title={item.hasIcon ? "Change Project Icon" : "Add Project Icon"}
              icon={Icon.Image}
              shortcut={{ modifiers: ["cmd", "opt"], key: "i" }}
              onAction={async () => onSaveProjectIcon(item)}
            />
          ) : null}
          {includeManagementActions && remoteUrl ? (
            <>
              <Action.CopyToClipboard
                title="Copy Repository URL"
                content={remoteUrl}
                icon={Icon.Clipboard}
                shortcut={{ modifiers: ["cmd", "opt"], key: "." }}
              />
              <Action.OpenInBrowser
                title="Open Repository in Browser"
                url={remoteUrl}
                shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
              />
            </>
          ) : includeManagementActions && hasLocalProject ? (
            <Action
              title="Open Repository in Browser"
              icon={Icon.Globe}
              shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
              onAction={async () => openProjectRemote(item.worktree)}
            />
          ) : null}
          {includeManagementActions && hasLocalProject ? (
            <Action
              title="Sync Remote"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd", "shift"], key: "b" }}
              onAction={() => syncGitRemoteWithToast(projectRepositoryRoot(item))}
            />
          ) : null}
          {includeManagementActions && onRemoveProject && hasLocalProject ? (
            <Action
              title="Exclude Project from Results"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
              onAction={async () => onRemoveProject(item)}
            />
          ) : null}
          {extraActions as never}
          {includeManagementActions && onOpenSettings ? (
            <Action
              title="Project Settings"
              icon={Icon.Gear}
              shortcut={{ modifiers: ["cmd", "shift"], key: "," }}
              onAction={onOpenSettings}
            />
          ) : null}
          {includeManagementActions ? (
            <Action title="Open Extension Settings" icon={Icon.Gear} onAction={openExtensionPreferences} />
          ) : null}
          {includeManagementActions && hasLocalProject ? (
            <LocalFileActions
              filePath={item.worktree}
              extraActions={
                <Action
                  title={`Copy ${defaultOpenIn.title} Deeplink`}
                  icon={Icon.Link}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  onAction={copyOpenDeeplink}
                />
              }
              copyTitle="Copy Path"
              openTitle="Open Folder in Default App"
              showInFinderTitle="Open Folder in Finder"
            />
          ) : null}
        </EnhancedListActionPanel>
      }
    />
  );
}
